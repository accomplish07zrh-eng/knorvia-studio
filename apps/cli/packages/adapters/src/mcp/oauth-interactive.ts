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

export type McpInteractiveAuthorizationOutcome =
  | { status: "authorized" }
  | { status: "already-authorized" }
  | { status: "pending"; authorizationUrl?: string }
  | { status: "failed"; error: unknown };

interface McpInteractiveAuthorizationInput {
  adapterInstanceId?: string;
  config: Extract<McpOAuthConfig, { type: "authorization_code" }>;
  credentialStore: SharedKnorviaCredentialStore;
  fetchFn?: FetchLike;
  forceReauthorization?: boolean;
  keyPrefix: string;
  logger?: Logger;
  onAuthorizationRequired?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  openAuthorizationUrl?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  requestedScope?: string;
  resourceMetadataUrl?: URL;
  serverName: string;
  serverUrl: string;
  signal?: AbortSignal;
  transactionTtlMs?: number;
}

function hasNewerCredentials(
  current: CanonicalCredentialSnapshot | undefined,
  baselineGeneration: string | undefined,
): boolean {
  return Boolean(current?.tokens && current.generation !== baselineGeneration);
}

function outerLogContext(input: McpInteractiveAuthorizationInput, state?: string) {
  return {
    adapterInstanceId: input.adapterInstanceId,
    credentialKeyPrefix: input.keyPrefix,
    mcpServerName: input.serverName,
    ...(state
      ? { oauthStateId: createHash("sha256").update(state).digest("hex").slice(0, STATE_ID_LENGTH) }
      : {}),
    processId: process.pid,
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
  input.logger?.info("MCP OAuth authorization is already in progress elsewhere", {
    event: "mcp.oauth.authorization.following",
    ...outerLogContext(input),
    status: "waiting",
  });
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
    input.logger?.warn("MCP OAuth callback listener failed", {
      event: "mcp.oauth.callback_listener.failed",
      ...outerLogContext(input, state),
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
    });
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
    const result = await auth(provider, {
      serverUrl: input.serverUrl,
      ...(input.requestedScope ? { scope: input.requestedScope } : {}),
      ...(input.resourceMetadataUrl ? { resourceMetadataUrl: input.resourceMetadataUrl } : {}),
      ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
      ...(input.forceReauthorization ? { forceReauthorization: true } : {}),
    });
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
    await auth(provider, {
      serverUrl: input.serverUrl,
      authorizationCode,
      ...(issuer ? { iss: issuer } : {}),
      ...(input.requestedScope ? { scope: input.requestedScope } : {}),
      ...(input.resourceMetadataUrl ? { resourceMetadataUrl: input.resourceMetadataUrl } : {}),
      ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    });
    input.logger?.info("MCP OAuth authorization completed", {
      event: "mcp.oauth.authorization.completed",
      ...outerLogContext(input, state),
      status: "completed",
    });
    return { status: "authorized" };
  } catch (error) {
    const current = await loadCanonicalCredentials(input.credentialStore, input.keyPrefix);
    if (hasNewerCredentials(current, baselineGeneration)) return { status: "already-authorized" };
    input.logger?.warn("MCP OAuth authorization failed", {
      event: "mcp.oauth.authorization.failed",
      ...outerLogContext(input, state),
      error: error instanceof Error ? error.message : String(error),
      status: "failed",
    });
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
