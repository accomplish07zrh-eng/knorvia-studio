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

// 快照是否比基线更新：有令牌且 generation 前进过。
function hasNewerCredentials(
  current: CanonicalCredentialSnapshot | undefined,
  baseline: Generation,
): boolean {
  return Boolean(current?.tokens && current.generation !== baseline);
}

/** 日志公共字段：一次算好，四处日志复用（字段名逐字保留）。 */
function logFields(input: McpInteractiveAuthorizationInput, oauthState?: string) {
  return /* 日志公共字段 */ {
    adapterInstanceId: input.adapterInstanceId,
    credentialKeyPrefix: input.keyPrefix,
    mcpServerName: input.serverName,
    processId: process.pid,
    ...(oauthState
      ? {
          oauthStateId: createHash("sha256")
            .update(oauthState)
            .digest("hex")
            .slice(0, STATE_ID_LENGTH),
        }
      : /* 无扩展 */ {}),
  };
}

/** 统一日志出口：event/status 由调用点给出，其余字段按需附加。 */
function emitLog(
  input: McpInteractiveAuthorizationInput,
  level: "info" | "warn",
  event: string,
  message: string,
  status: "cancelled" | "completed" | "failed" | "started" | "waiting",
  extra: Record<string, unknown> = {},
  oauthState?: string,
): void {
  input.logger?.[level](message, { event, ...logFields(input, oauthState), status, ...extra });
}

/** SDK 鉴权选项：公共字段一次装配，两处调用各自补充私有字段（额外字段名逐字保留）。 */
function sdkAuthOptions(
  input: McpInteractiveAuthorizationInput,
  extra: { authorizationCode?: string; iss?: string } = {},
) {
  return /* 构造返回值 */ {
    serverUrl: input.serverUrl,
    ...(input.requestedScope ? { scope: input.requestedScope } : /* 无扩展 */ {}),
    ...(input.resourceMetadataUrl
      ? { resourceMetadataUrl: input.resourceMetadataUrl }
      : /* 无扩展 */ {}),
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : /* 无扩展 */ {}),
    ...(input.forceReauthorization ? { forceReauthorization: true } : /* 无扩展 */ {}),
    ...(extra.authorizationCode ? { authorizationCode: extra.authorizationCode } : /* 无扩展 */ {}),
    ...(extra.iss ? { iss: extra.iss } : /* 无扩展 */ {}),
  };
}

function waitForPoll(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, FOLLOW_POLL_MS);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** 单次轮询结果：done 表示本次等待可以结束（已有更新的凭据）。 */
interface PollResult {
  announcedUrl?: string;
  done: boolean;
}

/** 单次轮询：先看凭据是否已被别的进程刷新，再看是否有待授权记录可展示。 */
async function pollOnce(
  input: McpInteractiveAuthorizationInput,
  baselineGeneration: Generation,
): Promise<PollResult> {
  const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
  if (hasNewerCredentials(current, baselineGeneration)) return { done: true };
  const pending = await loadPendingAuthorization(input.credentialStore, input.keyPrefix);
  return { done: false, ...(pending ? { announcedUrl: pending.authorizationUrl } : {}) };
}

async function followAuthorization(
  input: McpInteractiveAuthorizationInput,
  ttlMs: number,
  baselineGeneration: Generation,
): Promise<McpInteractiveAuthorizationOutcome> {
  const deadline = Date.now() + ttlMs;
  let projectedUrl: string | undefined;
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
    if (polled.announcedUrl && polled.announcedUrl !== projectedUrl) {
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

/** 事务 provider 的直传字段：必填四项 + 仅在存在时传入的四项可选项。 */
function passthroughFields(input: McpInteractiveAuthorizationInput) {
  const required = {
    config: input.config,
    credentialStore: input.credentialStore,
    keyPrefix: input.keyPrefix,
    serverName: input.serverName,
  };
  const optional = {
    ...(input.logger ? { logger: input.logger } : /* 无扩展 */ {}),
    ...(input.onAuthorizationRequired
      ? { onAuthorizationRequired: input.onAuthorizationRequired }
      : /* 无扩展 */ {}),
    ...(input.openAuthorizationUrl
      ? { openAuthorizationUrl: input.openAuthorizationUrl }
      : /* 无扩展 */ {}),
    ...(input.requestedScope ? { requestedScope: input.requestedScope } : /* 无扩展 */ {}),
  };
  return { ...required, ...optional };
}

async function leadAuthorization(
  input: McpInteractiveAuthorizationInput,
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
  try {
    callback = await createLocalhostOAuthCallbackServer({ callbackPath, state });
  } catch (error) {
    emitLog(
      input,
      "warn",
      "mcp.oauth.callback_listener.failed",
      "MCP OAuth callback listener failed",
      "failed",
      { error: error instanceof Error ? error.message : String(error) },
      state,
    );
    return { status: "failed", error };
  }

  // 保留构造阶段边界：事务 provider 成功创建后，才进入 callback 的关闭范围。
  const provider = createInteractiveTransactionProvider({
    ...passthroughFields(input),
    attemptId,
    baselineGeneration,
    callback,
    state,
    ttlMs,
  });
  try {
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
        authorizationCode,
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
      state,
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
      state,
    );
    return { status: "failed", error };
  } finally {
    await callback.close().catch(() => undefined);
  }
}

export async function runMcpInteractiveAuthorization(
  input: McpInteractiveAuthorizationInput,
): Promise<McpInteractiveAuthorizationOutcome> {
  const ttlMs = input.transactionTtlMs ?? MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS;
  const baseline = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
  const baselineGeneration = baseline?.generation;
  const lease = await tryAcquireAuthorizationLease({
    credentialsFilePath: input.credentialStore.filePath,
    keyPrefix: input.keyPrefix,
  });
  if (!lease) return await followAuthorization(input, ttlMs, baselineGeneration);
  return await runWithAuthorizationLease(input, lease, ttlMs, baselineGeneration);
}

type AuthorizationLease = NonNullable<Awaited<ReturnType<typeof tryAcquireAuthorizationLease>>>;

// 租约路径：拿到租约后重新读一次凭据（别人可能已授权），再走 lead 流程；
// 无论成败都清理待授权记录并释放租约——清理失败只忽略返回 Promise 的拒绝，release 的拒绝保留优先级。
async function runWithAuthorizationLease(
  input: McpInteractiveAuthorizationInput,
  lease: AuthorizationLease,
  ttlMs: number,
  baselineGeneration: Generation | undefined,
): Promise<McpInteractiveAuthorizationOutcome> {
  try {
    const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
    if (hasNewerCredentials(current, baselineGeneration)) return { status: "already-authorized" };
    return await leadAuthorization(input, lease.attemptId, ttlMs, baselineGeneration);
  } finally {
    await deletePendingAuthorizationIfOwned(
      input.credentialStore,
      input.keyPrefix,
      lease.attemptId,
    ).catch(() => undefined);
    await lease.release();
  }
}
