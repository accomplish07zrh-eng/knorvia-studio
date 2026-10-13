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

function hasNewerCredentials(
  current: CanonicalCredentialSnapshot | undefined,
  baselineGeneration: string | undefined,
): boolean {
  return Boolean(current?.tokens && current.generation !== baselineGeneration);
}

/** 日志公共字段：一次算好，四处日志复用（字段名逐字保留）。 */
function logFields(input: McpInteractiveAuthorizationInput, state?: string) {
  return {
    adapterInstanceId: input.adapterInstanceId,
    credentialKeyPrefix: input.keyPrefix,
    mcpServerName: input.serverName,
    processId: process.pid,
    ...(state
      ? { oauthStateId: createHash("sha256").update(state).digest("hex").slice(0, STATE_ID_LENGTH) }
      : {}),
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
  state?: string,
): void {
  input.logger?.[level](message, { event, ...logFields(input, state), status, ...extra });
}

/** SDK 鉴权选项：公共字段一次装配，两处调用各自补充私有字段（额外字段名逐字保留）。 */
function sdkAuthOptions(
  input: McpInteractiveAuthorizationInput,
  extra: { authorizationCode?: string; iss?: string } = {},
) {
  return {
    serverUrl: input.serverUrl,
    ...(input.requestedScope ? { scope: input.requestedScope } : {}),
    ...(input.resourceMetadataUrl ? { resourceMetadataUrl: input.resourceMetadataUrl } : {}),
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    ...(input.forceReauthorization ? { forceReauthorization: true } : {}),
    ...(extra.authorizationCode ? { authorizationCode: extra.authorizationCode } : {}),
    ...(extra.iss ? { iss: extra.iss } : {}),
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

async function followAuthorization(
  input: McpInteractiveAuthorizationInput,
  ttlMs: number,
  baselineGeneration: string | undefined,
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
    const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
    if (hasNewerCredentials(current, baselineGeneration)) return { status: "already-authorized" };
    const pending = await loadPendingAuthorization(input.credentialStore, input.keyPrefix);
    if (pending && pending.authorizationUrl !== projectedUrl) {
      projectedUrl = pending.authorizationUrl;
      await input.onAuthorizationRequired?.({
        authorizationUrl: projectedUrl,
        redirectUrl: "",
        serverName: input.serverName,
      });
    }
    await waitForPoll(input.signal);
  }
  return { status: "pending", ...(projectedUrl ? { authorizationUrl: projectedUrl } : {}) };
}

async function leadAuthorization(
  input: McpInteractiveAuthorizationInput,
  attemptId: string,
  ttlMs: number,
  baselineGeneration: string | undefined,
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
    config: input.config,
    credentialStore: input.credentialStore,
    keyPrefix: input.keyPrefix,
    logger: input.logger,
    onAuthorizationRequired: input.onAuthorizationRequired,
    openAuthorizationUrl: input.openAuthorizationUrl,
    requestedScope: input.requestedScope,
    serverName: input.serverName,
    callback,
    attemptId,
    baselineGeneration,
    ttlMs,
    state,
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
        ...(issuer ? { iss: issuer } : {}),
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
  try {
    const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
    if (hasNewerCredentials(current, baselineGeneration)) return { status: "already-authorized" };
    return await leadAuthorization(input, lease.attemptId, ttlMs, baselineGeneration);
  } finally {
    // 仅忽略返回 Promise 的清理拒绝；同步调用失败及最终 release 拒绝仍保留优先级。
    await deletePendingAuthorizationIfOwned(
      input.credentialStore,
      input.keyPrefix,
      lease.attemptId,
    ).catch(() => undefined);
    await lease.release();
  }
}
