// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash, randomBytes } from "node:crypto";
import { auth, type FetchLike } from "@modelcontextprotocol/client";
import type { Logger, McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import { createLocalhostOAuthCallbackServer } from "../auth/localhost-callback.js";
import { loadCanonicalCredentials, type CanonicalCredentialSnapshot } from "./oauth-credentials.js";
import { createInteractiveTransactionProvider } from "./oauth-interactive-transaction.js";
import {
  deletePendingAuthorizationIfOwned,
  loadPendingAuthorization,
  tryAcquireAuthorizationLease,
} from "./oauth-lease.js";
import type { McpOAuthAuthorizationContext } from "./oauth-shared.js";
import { withTimeout } from "./timeout.js";

/**
 * 本模块的四个常量。
 *
 * 收成一张表而不是四个并列声明：它们是一组「授权流程的时间与长度参数」，
 * 放在一起才能一眼看出彼此的量级关系（5 秒轮询 / 5 分钟事务 / 24 字节 state / 16 位 id）。
 */
const OAUTH_FLOW = {
  /** 交互式授权事务的默认存活时长（5 分钟）。 */
  transactionTtlMs: 300_000 as number,
  /** 跟随模式的轮询间隔（500 毫秒）。 */
  followPollMs: 500,
  /** OAuth state 的随机字节数。 */
  stateBytes: 24,
  /** 落日志时 state id 的截断长度。 */
  stateIdLength: 16,
} as const;

export const MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS: number = OAUTH_FLOW.transactionTtlMs;
const FOLLOW_POLL_MS = OAUTH_FLOW.followPollMs;
const STATE_BYTES = OAUTH_FLOW.stateBytes;
const STATE_ID_LENGTH = OAUTH_FLOW.stateIdLength;

export type { McpInteractiveAuthorizationOutcome } from "./oauth-interactive-types.js";

import type {
  McpInteractiveAuthorizationInput,
  McpInteractiveAuthorizationOutcome,
} from "./oauth-interactive-types.js";

// 基线代次：缺席表示调用方没有基线快照，判定语义与空串不同。
type Generation = string | undefined;

// 授权入参的短别名：签名里出现十几次，收敛后可读性不降、行也更短。
type AuthInput = McpInteractiveAuthorizationInput;

/** 授权结果类型：7 处函数签名共用，用短别名让签名收在一行内。 */
type AuthOutcome = McpInteractiveAuthorizationOutcome;

/** 快照是否比基线更新：有令牌且 generation 前进过。 */
const isNewerSnapshot = (
  current: CanonicalCredentialSnapshot | undefined,
  baseline: Generation,
): boolean => Boolean(current?.tokens && current.generation !== baseline);

/** state 的日志指纹：sha256 十六进制后取前 N 位。 */
function oauthStateDigest(oauthState: string): string {
  return createHash("sha256").update(oauthState).digest("hex").slice(0, STATE_ID_LENGTH);
}

/**
 * 日志公共字段：一次算好，四处日志复用。
 *
 * 字段**插入顺序**是观测契约（日志消费方按序读），所以这里用顺序赋值而不是条件展开：
 * adapterInstanceId → credentialKeyPrefix → mcpServerName → processId → oauthStateId（有才加）。
 */
/** 公共日志字段的取值来源（顺序即键的插入顺序，观测契约）。 */
const LOG_BASE_FIELDS = (input: AuthInput): [string, unknown][] => [
  ["adapterInstanceId", input.adapterInstanceId],
  ["credentialKeyPrefix", input.keyPrefix],
  ["mcpServerName", input.serverName],
  ["processId", process.pid],
];

function logFields(input: AuthInput, oauthState?: string): Record<string, unknown> {
  const fields = Object.fromEntries(LOG_BASE_FIELDS(input));
  // 空串视为「没有 state」，不落这个字段（与旧实现一致）。
  if (oauthState !== undefined && oauthState !== "")
    fields.oauthStateId = oauthStateDigest(oauthState);
  return fields;
}

/** 日志级别（只用到 info 与 warn）。 */
type LogLevel = "info" | "warn";

/** 日志里的流程状态取值。 */
type LogStatus = "cancelled" | "completed" | "failed" | "started" | "waiting";

/** 一次日志的内容与上下文（对象参数；event/status 由调用点给出，其余字段按需附加）。 */
type LogAsk = {
  input: AuthInput;
  level: LogLevel;
  event: string;
  message: string;
  status: LogStatus;
  /** 附加字段（如 error 文案）。 */
  extra?: Record<string, unknown>;
  /** OAuth state（用于日志关联，会被摘要成 stateId）。 */
  state?: string;
};

function emitLog(ask: LogAsk): void {
  const { input, level, event, message, status, extra, state } = ask;
  input.logger?.[level](message, {
    event,
    ...logFields(input, state),
    status,
    ...(extra ?? {}),
  });
}

/**
 * SDK 鉴权选项。
 *
 * 字段顺序固定：serverUrl → authorizationCode → iss → scope → resourceMetadataUrl → fetchFn → forceReauthorization。
 * 何时带：authorizationCode 存在即传（空串合法）；iss 非空才传；scope/resourceMetadataUrl/fetchFn 真值才传；
 * forceReauthorization 只作用于首个授权请求（带码的交换腿不携带）。
 */

/** SDK 鉴权选项类型（从 auth 的第二个参数取出，避免重复声明）。 */
type AuthOptions = Parameters<typeof auth>[1];

/** 交换腿的额外入参：回调码与签发方。 */
type CallbackCode = { authorizationCode?: string; iss?: string };

function sdkAuthOptions(input: AuthInput, extra: CallbackCode = {}): AuthOptions {
  const hasCode = extra.authorizationCode !== undefined;
  // 条件表：每项是 [键, 是否带, 值]。顺序即字段插入顺序（观测契约）。
  const candidates: [string, boolean, unknown][] = [
    ["serverUrl", true, input.serverUrl],
    ["authorizationCode", hasCode, extra.authorizationCode],
    ["iss", extra.iss !== undefined && extra.iss !== "", extra.iss],
    ["scope", Boolean(input.requestedScope), input.requestedScope],
    ["resourceMetadataUrl", Boolean(input.resourceMetadataUrl), input.resourceMetadataUrl],
    ["fetchFn", Boolean(input.fetchFn), input.fetchFn],
    ["forceReauthorization", !hasCode && Boolean(input.forceReauthorization), true],
  ];
  const fields = {} as Record<string, unknown>;
  for (const [key, include, value] of candidates) {
    if (include) fields[key] = value;
  }
  return fields as unknown as AuthOptions;
}

/**
 * 等待下一次轮询，或提前被中断。
 *
 * 两条路径都只兑现同一件事（「可以继续了」），所以用「两个触发器竞速 + 统一收尾」表达：
 *   - 超时器到点；
 *   - 外部 signal 中断。
 * 收尾时清掉超时器并摘掉监听，避免泄漏；已中断则立即返回，不再挂定时器。
 */
/** 一次性回调：多次触发只生效第一次（超时与中断可能同时到达）。 */
function onceCallback(action: () => void): () => void {
  let fired = false;
  return () => {
    if (fired) return;
    fired = true;
    action();
  };
}

/**
 * 等待下一次轮询；中途被中断则立即返回。
 *
 * ⚠️ 顺序要求：`timer` 必须在 `done` **之前**声明 —— `done` 体内引用 `timer`，
 * 而 `addEventListener` 在 signal 已 aborted 时可能同步触发，先声明才不会命中 TDZ。
 */
/**
 * 等待下一次轮询，或提前被中断 —— 两者谁先到用谁。
 *
 * 两条路径都必须清理定时器与中断监听：中断胜出时若不清定时器，会留下一个到点才触发的空转。
 * 所以统一走 `settle`（onceCallback 保证只生效一次）。
 */
function waitForPoll(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) return Promise.resolve();

  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const settle = onceCallback((): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", settle);
      resolve();
    });
    timer = setTimeout(settle, FOLLOW_POLL_MS);
    signal?.addEventListener("abort", settle, { once: true });
  });
}

/** 单次轮询结果：done 表示本次等待可以结束（已有更新的凭据）。 */
/** 单次轮询结果：done 表示本次等待可以结束（已有更新的凭据）。 */
type PollResult = { done: boolean; announcedUrl?: string };

/**
 * 重读凭据，判断是否已被人抢先授权。
 *
 * 轮询循环与租约路径都要做这个判断（两处都可能在等待期间被别人完成授权），
 * 所以收成一个函数，避免两处各写一遍「读凭据 + 比代次」。
 */
async function refreshedSince(input: AuthInput, baseline: Generation): Promise<boolean> {
  const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
  return isNewerSnapshot(current, baseline);
}

/** 单次轮询：先看凭据是否已被别的进程刷新，再看是否有待授权记录可展示。 */
async function pollOnce(input: AuthInput, baseline: Generation): Promise<PollResult> {
  if (await refreshedSince(input, baseline)) return { done: true };
  const pending = await loadPendingAuthorization(input.credentialStore, input.keyPrefix);
  return { done: false, ...(pending ? { announcedUrl: pending.authorizationUrl } : {}) };
}

/** 跟随模式的循环状态：截止时刻与「已播报过的授权地址」。 */
type FollowState = { deadline: number; announced?: string };

/**
 * 是否该继续轮询。
 *
 * ⚠️ 截止判断必须写成**肯定式** `Date.now() < deadline`：
 * `ttlMs` 可能是 NaN（调用方传得出来），此时
 *   - `Date.now() < NaN` → false → **不进入轮询**（正确，与旧实现一致）；
 *   - 若反转成 `Date.now() >= deadline` → 也是 false → **会进入轮询且永远退不出**（死循环）。
 * 测试 `zero negative and NaN TTL ... do not enter the follower poll` 断言了这一点。
 */
function shouldKeepPolling(state: FollowState, input: AuthInput): boolean {
  if (!(Date.now() < state.deadline)) return false;
  return input.signal?.aborted !== true;
}

/**
 * 向用户播报授权地址。
 *
 * 只在「拿到新地址」且「与上次播报不同」时才播 —— 避免每轮轮询都弹一次。
 */
async function announceOnce(
  state: FollowState,
  input: AuthInput,
  url: string | undefined,
): Promise<void> {
  // 没有地址、或与上次播报相同 → 都不播（避免每轮都弹）。
  if (url === undefined || url === state.announced) return;

  state.announced = url;
  await input.onAuthorizationRequired?.({
    authorizationUrl: url,
    redirectUrl: "",
    serverName: input.serverName,
  });
}

/** 跟进授权：轮询等待别处（或用户浏览器）完成，期间把授权地址播报给调用方。 */
async function followAuthorization(
  input: AuthInput,
  ttlMs: number,
  baseline: Generation,
): Promise<AuthOutcome> {
  const state: FollowState = { deadline: Date.now() + ttlMs };

  emitLog({
    input,
    level: "info",
    event: "mcp.oauth.authorization.following",
    message: "MCP OAuth authorization is already in progress elsewhere",
    status: "waiting",
  });

  while (shouldKeepPolling(state, input)) {
    const polled = await pollOnce(input, baseline);
    if (polled.done) return { status: "already-authorized" };

    await announceOnce(state, input, polled.announcedUrl);
    await waitForPoll(input.signal);
  }

  // ⚠️ 用真值判断而非 undefined 判断：**空串视为「没有可用地址」**，
  // 此时不返回 authorizationUrl 字段（测试断言了「不出现 own URL field」）。
  return state.announced
    ? { status: "pending", authorizationUrl: state.announced }
    : { status: "pending" };
}

/** 「真值才传」的三个可选字段（顺序即插入顺序）。 */
const PASSTHROUGH_TRUTHY = ["logger", "onAuthorizationRequired", "openAuthorizationUrl"] as const;

/**
 * 事务 provider 的直传字段。
 *
 * 三段宽容度不同，所以分组写：
 *   - 必填四项无条件传；
 *   - 真值三项空串等于没给；
 *   - `requestedScope` **缺席才跳过** —— 空串是合法的作用域选择，必须保留，
 *     这也是它单独一段的原因。
 */
function passthroughFields(input: AuthInput) {
  // 必填四项：配置、凭据存储、键前缀、服务名（顺序即 provider 的声明顺序）。
  const required = {} as Pick<AuthInput, "config" | "credentialStore" | "keyPrefix" | "serverName">;
  required.config = input.config;
  required.credentialStore = input.credentialStore;
  required.keyPrefix = input.keyPrefix;
  required.serverName = input.serverName;

  // 真值才传的三项：表驱动，新增一项只需往表里加一行（原来要再写一个 if，容易漏）。
  const truthy: Record<string, unknown> = {};
  for (const key of PASSTHROUGH_TRUTHY) {
    const value = input[key];
    if (value) truthy[key] = value;
  }

  // requestedScope 单独处理：**缺席才跳过**（空串是合法的作用域选择，必须保留）。
  const defined: { requestedScope?: AuthInput["requestedScope"] } = {};
  if (input.requestedScope !== undefined) defined.requestedScope = input.requestedScope;

  return { ...required, ...truthy, ...defined } as const;
}

/** 本轮「主导授权」的上下文：回调服务器建立后，后续步骤共用它。 */
type LeadRun = {
  input: AuthInput;
  ttlMs: number;
  baseline: Generation;
  callbackPath: string;
  state: string;
};

/** 回调路径：默认按服务名生成；配置了 redirectPath 就用它（自动补前导斜杠）。 */
function callbackPathFor(input: AuthInput): string {
  const custom = input.config.redirectPath;
  const fallback = `/oauth/callback/mcp/${encodeURIComponent(input.serverName)}`;
  if (custom === undefined || custom === "") return fallback;
  return custom.startsWith("/") ? custom : `/${custom}`;
}

/** 回调里带回来的两个值（都可能缺席）。 */
type CallbackPayload = { code: string | undefined; iss: string | undefined };

/** 从回调响应里取 code 与 iss：code 优先 query，其次响应体；iss 只取 query。 */
function readCallbackCode(response: { url: string; code?: string }): CallbackPayload {
  const parsed = new URL(response.url);
  return {
    code: parsed.searchParams.get("code") ?? response.code,
    iss: parsed.searchParams.get("iss") ?? undefined,
  };
}

/** 本地回调服务器的句柄类型（SDK 生成）。 */
type CallbackServer = Awaited<ReturnType<typeof createLocalhostOAuthCallbackServer>>;

/**
 * 建回调服务器的结果。
 *
 * 用「成功/失败」两态的判别联合而不是「成功返回句柄、失败返回 undefined」——
 * 后者会让调用方在失败分支里拿不到原始 error，只能新造一个，丢掉失败原因。
 */
type CallbackOpening = { ok: true; callback: CallbackServer } | { ok: false; error: unknown };

/** 第一段：建立本地回调服务器（失败时把原始 error 交给调用方）。 */
async function openCallback(run: LeadRun): Promise<CallbackOpening> {
  try {
    const callback = await createLocalhostOAuthCallbackServer({
      callbackPath: run.callbackPath,
      state: run.state,
    });
    return { ok: true, callback };
  } catch (error) {
    emitLog({
      input: run.input,
      level: "warn",
      event: "mcp.oauth.callback_listener.failed",
      message: "MCP OAuth callback listener failed",
      status: "failed",
      extra: { error: errorText(error) },
      state: run.state,
    });
    // 保留原始 error：它是失败的 cause，换成新造的错误会丢掉原始原因。
    return { ok: false, error };
  }
}

/**
 * 第二段：发起挑战 → 等回调 → 用 code 交换令牌。
 *
 * 两次 auth 共用同一个 provider：第一次触发交互式挑战，第二次用回调码完成交换。
 * 交换与 saveTokens 必须在 callback 关闭范围之内完成，不能被超时提前释放。
 */
async function exchangeAuthorization(
  run: LeadRun,
  provider: Parameters<typeof auth>[0],
  callback: Awaited<ReturnType<typeof createLocalhostOAuthCallbackServer>>,
): Promise<AuthOutcome> {
  const first = await auth(provider, sdkAuthOptions(run.input));
  if (first === "AUTHORIZED") return { status: "authorized" };

  const response = await withTimeout(
    callback.waitForCallback(),
    run.ttlMs,
    `MCP server ${run.input.serverName} OAuth authorization timed out`,
    run.input.signal,
  );
  const { code, iss } = readCallbackCode(response);
  const extra = iss === undefined ? { authorizationCode: code } : { authorizationCode: code, iss };
  await auth(provider, sdkAuthOptions(run.input, extra));

  emitLog({
    input: run.input,
    level: "info",
    event: "mcp.oauth.authorization.completed",
    message: "MCP OAuth authorization completed",
    status: "completed",
    state: run.state,
  });
  return { status: "authorized" };
}

/**
 * 第三段：失败处置。
 *
 * 先重读凭据 —— 若期间别人完成了授权，本次失败应报「已授权」而不是「失败」。
 */
async function settleFailure(run: LeadRun, error: unknown): Promise<AuthOutcome> {
  const current = await loadCanonicalCredentials(run.input.credentialStore, run.input.keyPrefix);
  if (isNewerSnapshot(current, run.baseline)) return { status: "already-authorized" };

  emitLog({
    input: run.input,
    level: "warn",
    event: "mcp.oauth.authorization.failed",
    message: "MCP OAuth authorization failed",
    status: "failed",
    extra: { error: errorText(error) },
    state: run.state,
  });
  return { status: "failed", error };
}

/** 主导授权：建立回调 → 构造 provider → 交换授权 → 无论成败都关闭回调。 */
async function leadAuthorization(
  input: AuthInput,
  attemptId: string,
  ttlMs: number,
  baseline: Generation,
): Promise<AuthOutcome> {
  const run: LeadRun = {
    input,
    ttlMs,
    baseline,
    callbackPath: callbackPathFor(input),
    state: randomBytes(STATE_BYTES).toString("base64url"),
  };

  const opened = await openCallback(run);
  if (!opened.ok) return { status: "failed", error: opened.error };
  const callback = opened.callback;

  // 保留构造阶段边界：provider 成功创建后，才进入 callback 的关闭范围。
  const provider = createInteractiveTransactionProvider({
    ...passthroughFields(input),
    attemptId,
    baselineGeneration: baseline,
    callback,
    state: run.state,
    ttlMs,
  });

  try {
    return await exchangeAuthorization(run, provider, callback);
  } catch (error) {
    return await settleFailure(run, error);
  } finally {
    await callback.close().catch(() => undefined);
  }
}

/** 错误文案归一：非 Error 也给出字符串。 */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function /* 交互式授权入口 */ runMcpInteractiveAuthorization(
  input: AuthInput,
): Promise<AuthOutcome> {
  const ttlMs = input.transactionTtlMs ?? MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS;
  return dispatch(input, ttlMs);
}

/** 读当前凭据的代次：作为「是否已有更新授权」的基线。 */
async function currentGeneration(input: AuthInput): Promise<Generation> {
  const snapshot = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
  return snapshot?.generation;
}

/** 尝试抢占授权租约；抢不到返回 undefined（说明别处正在进行）。 */
function acquireLease(input: AuthInput): Promise<AuthorizationLease | undefined> {
  return tryAcquireAuthorizationLease({
    credentialsFilePath: input.credentialStore.filePath,
    keyPrefix: input.keyPrefix,
  });
}

/**
 * 入口分段：
 *   1. 读基线代次；
 *   2. 抢租约 —— 抢到就走 lead（自己是主导方），抢不到就走 follow（跟随别处的授权）。
 */
async function dispatch(input: AuthInput, ttlMs: number): Promise<AuthOutcome> {
  const baselineGeneration = await currentGeneration(input);
  const lease = await acquireLease(input);
  if (lease === undefined) return followAuthorization(input, ttlMs, baselineGeneration);
  return runWithAuthorizationLease({ input, lease, ttlMs, baseline: baselineGeneration });
}

type AuthorizationLease = NonNullable<Awaited<ReturnType<typeof tryAcquireAuthorizationLease>>>;

/**
 * 租约收尾的清理步骤表。
 *
 * 顺序固定为「先删待授权记录，再释放租约」，与依赖关系一致：记录归属靠 attemptId，
 * 必须在租约还持有的时候判归属。
 *
 * `swallow` 决定失败如何处置：
 *   - `true`  → 清理失败不应影响主流程（删记录失败只忽略）；
 *   - `false` → 失败要向上抛（租约释放失败必须让调用方知道，否则租约泄漏不可见）。
 */
const LEASE_CLEANUP_STEPS = [
  {
    swallow: true,
    run: (input: AuthInput, lease: AuthorizationLease) =>
      deletePendingAuthorizationIfOwned(input.credentialStore, input.keyPrefix, lease.attemptId),
  },
  {
    swallow: false,
    run: (_input: AuthInput, lease: AuthorizationLease) => lease.release(),
  },
] as const;

/** 按表执行收尾：swallow 的步骤吞掉拒绝，其余原样上抛。 */
async function releaseLeaseResources(input: AuthInput, lease: AuthorizationLease): Promise<void> {
  for (const step of LEASE_CLEANUP_STEPS) {
    const pending = step.run(input, lease);
    if (step.swallow) await pending.catch(() => undefined);
    else await pending;
  }
}

// 租约路径：拿到租约后重新读一次凭据（别人可能已授权），再走 lead 流程；
// 无论成败都清理待授权记录并释放租约——清理策略见 LEASE_CLEANUP_STEPS。
/** 租约路径的入参。 */
type LeaseRun = {
  input: AuthInput;
  lease: AuthorizationLease;
  ttlMs: number;
  baseline: Generation;
};

/** 租约路径：拿到租约后重读凭据（别人可能已授权），否则成为主导方。 */
async function runWithAuthorizationLease(run: LeaseRun): Promise<AuthOutcome> {
  try {
    if (await refreshedSince(run.input, run.baseline)) return { status: "already-authorized" };
    return await leadAuthorization(run.input, run.lease.attemptId, run.ttlMs, run.baseline);
  } finally {
    await releaseLeaseResources(run.input, run.lease);
  }
}
