// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { AuthProvider, FetchLike } from "@modelcontextprotocol/client";
import type { Logger, McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import { isCanonicalTokenNearExpiry, loadCredentialPair } from "./oauth-credentials.js";
import { createInteractiveAuthorizationRequiredError } from "./oauth-errors.js";
import { refreshMcpOAuthTokensUnderLock } from "./oauth-refresh.js";

type McpAuthorizationCodeOAuthConfig = Extract<McpOAuthConfig, { type: "authorization_code" }>;

interface CreateMcpOAuthTokenProviderInput {
  config: McpAuthorizationCodeOAuthConfig;
  credentialStore: SharedKnorviaCredentialStore;
  fetchFn?: FetchLike;
  keyPrefix: string;
  logger?: Logger;
  serverName: string;
  serverUrl: string;
}

export function createMcpOAuthTokenProvider(input: CreateMcpOAuthTokenProviderInput): AuthProvider {
  const refreshOptions = {
    credentialStore: input.credentialStore,
    ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
    keyPrefix: input.keyPrefix,
    ...(input.logger ? { logger: input.logger } : {}),
    serverName: input.serverName,
    serverUrl: input.serverUrl,
    ...(input.config.clientId ? { staticClientId: input.config.clientId } : {}),
  };

  return {
    async token() {
      // 每次读取 live 输入；刷新配置则保持创建时捕获的引用，不能合并两个生命周期。
      const pair = await loadCredentialPair(input.credentialStore, input.keyPrefix);
      if (!pair?.tokens) return undefined;
      if (!isCanonicalTokenNearExpiry(pair) || !pair.tokens.refresh_token) {
        return pair.tokens.access_token;
      }
      return await refreshMcpOAuthTokensUnderLock({ ...refreshOptions, reactive: false });
    },
    async onUnauthorized() {
      const pair = await loadCredentialPair(input.credentialStore, input.keyPrefix);
      if (!pair?.tokens?.refresh_token) {
        throw createInteractiveAuthorizationRequiredError({
          reason: pair?.tokens ? "no_refresh_token" : "no_credentials",
          serverName: input.serverName,
        });
      }
      await refreshMcpOAuthTokensUnderLock({ ...refreshOptions, reactive: true });
    },
  };
}
