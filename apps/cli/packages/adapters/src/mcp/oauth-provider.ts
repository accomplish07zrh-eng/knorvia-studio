// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// OAuth 令牌提供者：读 live 凭据 → 未过期直接用 → 临近过期或收到 401 时在文件锁内刷新。
// 生命周期约定：
// 一、刷新配置（clientId、fetch、logger 等）在创建时捕获一次，之后不再重读。
// 二、凭据每次都重新读取：外部进程可能已经换了令牌，不能缓存到内存。
// 三、token() 在无凭据时返回 undefined（调用方按未鉴权处理），不抛错。
// 四、onUnauthorized() 在缺少 refresh_token 时抛出交互式授权要求错误，区分两种原因。
// 五、刷新统一走 refreshMcpOAuthTokensUnderLock，reactive 标记区分「主动过期」与「401 触发」。

import type { AuthProvider, FetchLike } from "@modelcontextprotocol/client";
import type { Logger, McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import { isCanonicalTokenNearExpiry, loadCredentialPair } from "./oauth-credentials.js";
import { createInteractiveAuthorizationRequiredError } from "./oauth-errors.js";
import { refreshMcpOAuthTokensUnderLock } from "./oauth-refresh.js";
import type { CreateMcpOAuthTokenProviderInput } from "./oauth-provider-types.js";

type McpAuthorizationCodeOAuthConfig = Extract<McpOAuthConfig, { type: "authorization_code" }>;

/** 刷新入参：创建时捕获一次，可空字段只在有值时出现。 */
function refreshInputsFor(request: CreateMcpOAuthTokenProviderInput) {
  const { config, credentialStore, fetchFn, keyPrefix, logger, serverName, serverUrl } = request;
  return {
    credentialStore,
    keyPrefix,
    serverName,
    serverUrl,
    ...(fetchFn ? { fetchFn } : {}),
    ...(logger ? { logger } : {}),
    ...(config.clientId ? { staticClientId: config.clientId } : {}),
  };
}

/** 读取当前凭据对；每次都从存储读，不做内存缓存。 */
function liveCredentials(request: CreateMcpOAuthTokenProviderInput) {
  return loadCredentialPair(request.credentialStore, request.keyPrefix);
}

/** 主动取用：未过期或不可刷新时直接返回访问令牌，否则在锁内刷新。 */
async function activeToken(
  request: CreateMcpOAuthTokenProviderInput,
  refreshInputs: ReturnType<typeof refreshInputsFor>,
): Promise<string | undefined> {
  const credentials = await liveCredentials(request);
  if (!credentials?.tokens) return undefined;
  if (!isCanonicalTokenNearExpiry(credentials) || !credentials.tokens.refresh_token) {
    return credentials.tokens.access_token;
  }
  return await refreshMcpOAuthTokensUnderLock({ ...refreshInputs, reactive: false });
}

/** 401 后重鉴权：缺 refresh_token 时升级为交互式授权要求。 */
async function reauthenticate(
  request: CreateMcpOAuthTokenProviderInput,
  refreshInputs: ReturnType<typeof refreshInputsFor>,
): Promise<void> {
  const credentials = await liveCredentials(request);
  if (!credentials?.tokens?.refresh_token) {
    throw createInteractiveAuthorizationRequiredError({
      reason: credentials?.tokens ? "no_refresh_token" : "no_credentials",
      serverName: request.serverName,
    });
  }
  await refreshMcpOAuthTokensUnderLock({ ...refreshInputs, reactive: true });
}

export function createMcpOAuthTokenProvider(
  request: CreateMcpOAuthTokenProviderInput,
): AuthProvider {
  const refreshInputs = refreshInputsFor(request);
  return {
    token: async () => await activeToken(request, refreshInputs),
    onUnauthorized: async () => await reauthenticate(request, refreshInputs),
  };
}
