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

export const MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS: number = 300_000;
const FOLLOW_POLL_MS = 500;
const STATE_BYTES = 24;
const STATE_ID_LENGTH = 16;

export type { McpInteractiveAuthorizationOutcome } from "./oauth-interactive-types.js";

import type {
  McpInteractiveAuthorizationInput,
  McpInteractiveAuthorizationOutcome,
} from "./oauth-interactive-types.js";

// 基线代次：缺席表示调用方没有基线快照，判定语义与空串不同。
type Generation = string | undefined;

// 授权入参的短别名：签名里出现十几次，收敛后可读性不降、行也更短。
type AuthInput = McpInteractiveAuthorizationInput;

// 快照是否比基线更新：有令牌且 generation 前进过。
function hasNewerCredentials(
  current: CanonicalCredentialSnapshot | undefined,
  baseline: Generation,
): boolean {
  return Boolean(current?.tokens && current.generation !== baseline);
}

/**
 * 日志公共字段：一次算好，四处日志复用。
 *
 * 字段**插入顺序**是观测契约（日志消费方按序读），所以这里用顺序赋值而不是条件展开：
 * adapterInstanceId → credentialKeyPrefix → mcpServerName → processId → oauthStateId（有才加）。
 */
function logFields(input: AuthInput, oauthState?: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  fields.adapterInstanceId = input.adapterInstanceId;
  fields.credentialKeyPrefix = input.keyPrefix;
  fields.mcpServerName = input.serverName;
  fields.processId = process.pid;
  if (oauthState !== undefined && oauthState !== "") {
    fields.oauthStateId = createHash("sha256")
      .update(oauthState)
      .digest("hex")
      .slice(0, STATE_ID_LENGTH);
  }
  return fields;
}

/** 统一日志出口：event/status 由调用点给出，其余字段按需附加。 */
function emitLog(
  input: AuthInput,
  level: "info" | "warn",
  event: string,
  message: string,
  status: "cancelled" | "completed" | "failed" | "started" | "waiting",
  extra: Record<string, unknown> = {},
  oauthState?: string,
): void {
  input.logger?.[level](message, { event, ...logFields(input, oauthState), status, ...extra });
}

/**
 * SDK 鉴权选项：字段顺序固定为 serverUrl → authorizationCode → iss → scope → resourceMetadataUrl → fetchFn → forceReauthorization。
 *
 * 逐条说明「何时带」：
 *   - authorizationCode：**存在即传**，空串也是合法回调值（缺失与空必须区分）；
 *   - iss：非空才传（空串视为未提供）；
 *   - scope / resourceMetadataUrl / fetchFn：真值才传；
 *   - forceReauthorization：只作用于首个授权请求，带授权码的交换腿不再携带。
 */

/** SDK 鉴权选项类型（从 auth 的第二个参数取出，避免重复声明）。 */
type AuthOptions = Parameters<typeof auth>[1];

function sdkAuthOptions(
  input: AuthInput,
  extra: { authorizationCode?: string; iss?: string } = {},
): AuthOptions {
  const hasCode = extra.authorizationCode !== undefined;
  const fields = {} as AuthOptions;
  fields.serverUrl = input.serverUrl;
  if (hasCode) fields.authorizationCode = extra.authorizationCode;
  if (extra.iss !== undefined && extra.iss !== "") fields.iss = extra.iss;
  if (input.requestedScope) fields.scope = input.requestedScope;
  if (input.resourceMetadataUrl) fields.resourceMetadataUrl = input.resourceMetadataUrl;
  if (input.fetchFn) fields.fetchFn = input.fetchFn;
  if (!hasCode && input.forceReauthorization) fields.forceReauthorization = true;
  return fields;
}

/**
 * 等待下一次轮询，或提前被中断。
 *
 * 两条路径都只兑现同一件事（「可以继续了」），所以用「两个触发器竞速 + 统一收尾」表达：
 *   - 超时器到点；
 *   - 外部 signal 中断。
 * 收尾时清掉超时器并摘掉监听，避免泄漏；已中断则立即返回，不再挂定时器。
 */
function waitForPoll(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, FOLLOW_POLL_MS);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

/** 单次轮询结果：done 表示本次等待可以结束（已有更新的凭据）。 */
interface PollResult {
  announcedUrl?: string;
  done: boolean;
}

/** 单次轮询：先看凭据是否已被别的进程刷新，再看是否有待授权记录可展示。 */
async function pollOnce(input: AuthInput, baselineGeneration: Generation): Promise<PollResult> {
  const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
  if (hasNewerCredentials(current, baselineGeneration)) return { done: true };
  const pending = await loadPendingAuthorization(input.credentialStore, input.keyPrefix);
  return { done: false, ...(pending ? { announcedUrl: pending.authorizationUrl } : {}) };
}

async function /* 跟进授权：轮询等待用户在浏览器完成 */ followAuthorization(
  input: AuthInput,
  ttlMs: number,
  baselineGeneration: Generation,
): Promise<McpInteractiveAuthorizationOutcome> {
  const deadline = Date.now() + ttlMs;
  let projectedUrl: /* 已向用户播报过的授权地址 */ string | undefined;
  emitLog(
    input,
    "info",
    "mcp.oauth.authorization.following",
    "MCP OAuth authorization is already in progress elsewhere",
    "waiting",
  );
  while (Date.now() < deadline && !input.signal?.aborted) {
    const polled = await pollOnce(input, baselineGeneration);
    if (polled.done) return { status: "already-authorized" };
    if (polled.announcedUrl !== undefined && polled.announcedUrl !== projectedUrl) {
      projectedUrl = polled.announcedUrl;
      await input.onAuthorizationRequired?.({
        authorizationUrl: projectedUrl,
        redirectUrl: /* 初始为空 */ "",
        serverName: input.serverName,
      });
    }
    await waitForPoll(input.signal);
  }
  return { status: "pending", ...(projectedUrl ? { authorizationUrl: projectedUrl } : {}) };
}

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

  const truthy = {} as {
    logger?: AuthInput["logger"];
    onAuthorizationRequired?: AuthInput["onAuthorizationRequired"];
    openAuthorizationUrl?: AuthInput["openAuthorizationUrl"];
  };
  if (input.logger) truthy.logger = input.logger;
  if (input.onAuthorizationRequired) truthy.onAuthorizationRequired = input.onAuthorizationRequired;
  if (input.openAuthorizationUrl) truthy.openAuthorizationUrl = input.openAuthorizationUrl;

  const defined = {} as { requestedScope?: AuthInput["requestedScope"] };
  if (input.requestedScope !== undefined) defined.requestedScope = input.requestedScope;

  return { ...required, ...truthy, ...defined };
}

async function /* 主导授权：发起挑战并等待回调 */ leadAuthorization(
  input: AuthInput,
  attemptId: string,
  ttlMs: number,
  baselineGeneration: Generation,
): Promise<McpInteractiveAuthorizationOutcome> {
  const state = randomBytes(STATE_BYTES).toString("base64url");
  const fallbackPath = `/oauth/callback/mcp/${encodeURIComponent(input.serverName)}`;
  const customPath = input.config.redirectPath;
  const callbackPath = !customPath
    ? fallbackPath
    : customPath.startsWith("/")
      ? customPath
      : `/${customPath}`;
  let callback: Awaited<ReturnType<typeof createLocalhostOAuthCallbackServer>>;
  try /* 本段可能抛错，收尾统一交给下方 finally */ {
    callback = await createLocalhostOAuthCallbackServer({ callbackPath, state });
  } catch (error) {
    emitLog(
      input,
      "warn",
      "mcp.oauth.callback_listener.failed",
      "MCP OAuth callback listener failed",
      "failed",
      { error: error instanceof Error ? error.message : String(error) },
      /* 授权流程状态：仅用于日志关联 */ state,
    );
    return { status: "failed", error };
  }

  // 保留构造阶段边界：事务 provider 成功创建后，才进入 callback 的关闭范围。
  const provider = createInteractiveTransactionProvider({
    ...passthroughFields(input),
    attemptId,
    baselineGeneration,
    callback,
    /* 授权流程状态：仅用于日志关联 */ state,
    ttlMs,
  });
  try /* 本段可能抛错，收尾统一交给下方 finally */ {
    const result = await auth(provider, sdkAuthOptions(input));
    if (result === "AUTHORIZED") return { status: "authorized" };
    const response = await withTimeout(
      callback.waitForCallback(),
      ttlMs,
      `MCP server ${input.serverName} OAuth authorization timed out`,
      input.signal,
    );
    const callbackUrl = new URL(response.url);
    const authorizationCode = callbackUrl.searchParams.get("code") ?? response.code;
    const issuer = callbackUrl.searchParams.get("iss");
    // 交换及其 saveTokens 完成后才离开此范围，不用人机等待超时提前释放 lease。
    await auth(
      provider,
      sdkAuthOptions(input, {
        /* 授权码：来自回调 query */ authorizationCode,
        ...(issuer ? { iss: issuer } : /* 无扩展 */ {}),
      }),
    );
    emitLog(
      input,
      "info",
      "mcp.oauth.authorization.completed",
      "MCP OAuth authorization completed",
      "completed",
      {},
      /* 授权流程状态：仅用于日志关联 */ state,
    );
    return { status: "authorized" };
  } catch (error) {
    const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
    if (hasNewerCredentials(current, baselineGeneration)) return { status: "already-authorized" };
    emitLog(
      input,
      "warn",
      "mcp.oauth.authorization.failed",
      "MCP OAuth authorization failed",
      "failed",
      { error: error instanceof Error ? error.message : String(error) },
      /* 授权流程状态：仅用于日志关联 */ state,
    );
    return { status: "failed", error };
  } finally /* 无论成败都要归还租约，避免泄漏 */ {
    await callback.close().catch(() => undefined);
  }
}

export async function /* 交互式授权入口 */ runMcpInteractiveAuthorization(
  input: AuthInput,
): Promise<McpInteractiveAuthorizationOutcome> {
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
async function dispatch(
  input: AuthInput,
  ttlMs: number,
): Promise<McpInteractiveAuthorizationOutcome> {
  const baselineGeneration = await currentGeneration(input);
  const lease = await acquireLease(input);
  if (lease === undefined) return followAuthorization(input, ttlMs, baselineGeneration);
  return runWithAuthorizationLease(input, lease, ttlMs, baselineGeneration);
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
async function runWithAuthorizationLease(
  input: AuthInput,
  lease: AuthorizationLease,
  ttlMs: number,
  baselineGeneration: Generation | undefined,
): Promise<McpInteractiveAuthorizationOutcome> {
  try {
    const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
    if (hasNewerCredentials(current, baselineGeneration)) return { status: "already-authorized" };
    return await leadAuthorization(input, lease.attemptId, ttlMs, baselineGeneration);
  } finally {
    await releaseLeaseResources(input, lease);
  }
}
