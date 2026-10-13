// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { AuthProvider, FetchLike } from "@modelcontextprotocol/client";
import type { Logger, McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import { isCanonicalTokenNearExpiry, loadCredentialPair } from "./oauth-credentials.js";
import { createInteractiveAuthorizationRequiredError } from "./oauth-errors.js";
import { refreshMcpOAuthTokensUnderLock } from "./oauth-refresh.js";
import type { CreateMcpOAuthTokenProviderInput } from "./oauth-provider-types.js";

type McpAuthorizationCodeOAuthConfig = Extract<McpOAuthConfig, { type: "authorization_code" }>;

// 令牌提供者：读 live 凭据 → 未过期直接用 → 临近过期或收到 401 时在文件锁内刷新。
// 刷新配置在创建时捕获（clientId 等），而凭据每次都重新读取，两者生命周期不得合并。
export function createMcpOAuthTokenProvider(
  request: CreateMcpOAuthTokenProviderInput,
): AuthProvider {
  const refreshInputs = {
    credentialStore: request.credentialStore,
    ...(request.fetchFn ? { fetchFn: request.fetchFn } : {}),
    keyPrefix: request.keyPrefix,
    ...(request.logger ? { logger: request.logger } : {}),
    serverName: request.serverName,
    serverUrl: request.serverUrl,
    ...(request.config.clientId ? { staticClientId: request.config.clientId } : {}),
  };

  return {
    async token() {
      // 每次读取 live 输入；刷新配置则保持创建时捕获的引用，不能合并两个生命周期。
      const credentials = await loadCredentialPair(request.credentialStore, request.keyPrefix);
      if (!credentials?.tokens) return undefined;
      if (!isCanonicalTokenNearExpiry(credentials) || !credentials.tokens.refresh_token) {
        return credentials.tokens.access_token;
      }
      return await refreshMcpOAuthTokensUnderLock({ ...refreshInputs, reactive: false });
    },
    async onUnauthorized() {
      const credentials = await loadCredentialPair(request.credentialStore, request.keyPrefix);
      if (!credentials?.tokens?.refresh_token) {
        throw createInteractiveAuthorizationRequiredError({
          reason: credentials?.tokens ? "no_refresh_token" : "no_credentials",
          serverName: request.serverName,
        });
      }
      await refreshMcpOAuthTokensUnderLock({ ...refreshInputs, reactive: true });
    },
  };
}
