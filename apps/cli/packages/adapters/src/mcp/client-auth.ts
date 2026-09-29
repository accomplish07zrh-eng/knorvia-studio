// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  ClientCredentialsProvider,
  computeScopeUnion,
  type AuthProvider,
  type OAuthClientProvider,
} from "@modelcontextprotocol/client";
import type { McpAuthorizationCodeOAuthConfig, McpServerConfig } from "@knorvia/contracts";
import { createSharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import type { McpClientState } from "./client-state.js";
import { usesOfficialAuth } from "./client-official.js";
import { errorName, errorText } from "./client-stdio-log.js";
import { createMcpTransportFetch } from "./network.js";
import { createCredentialKeyPrefix, type McpOAuthRuntimeOptions } from "./oauth.js";
import { loadCredentialPair } from "./oauth-credentials.js";
import type { InteractiveAuthorizationTrigger } from "./oauth-errors.js";
import {
  MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS,
  runMcpInteractiveAuthorization,
  type McpInteractiveAuthorizationOutcome,
} from "./oauth-interactive.js";
import { createMcpOAuthTokenProvider } from "./oauth-provider.js";

export function authorizationCode(
  config: McpServerConfig,
): McpAuthorizationCodeOAuthConfig | undefined {
  if (config.type === "stdio" || usesOfficialAuth(config)) return undefined;
  if (config.oauth?.type === "authorization_code") return config.oauth;
  if (config.oauth?.type === "client_credentials") return undefined;
  if (Object.keys(config.headers ?? {}).some((name) => name.toLowerCase() === "authorization"))
    return undefined;
  return { type: "authorization_code" };
}

export function authProvider(
  state: McpClientState,
  name: string,
  config: McpServerConfig,
): AuthProvider | OAuthClientProvider | undefined {
  if (config.type === "stdio" || usesOfficialAuth(config)) return undefined;
  const code = authorizationCode(config);
  if (code) {
    return createMcpOAuthTokenProvider({
      config: code,
      credentialStore: (state.credentialStore ??=
        state.oauth?.credentialStore ?? createSharedKnorviaCredentialStore()),
      fetchFn: createMcpTransportFetch({ env: state.env, network: state.network }),
      keyPrefix: createCredentialKeyPrefix(name, config.url, code),
      ...(state.logger ? { logger: state.logger } : {}),
      serverName: name,
      serverUrl: config.url,
    });
  }
  if (config.oauth?.type !== "client_credentials") return undefined;
  return new ClientCredentialsProvider({
    clientId: config.oauth.clientId,
    clientName: config.oauth.clientName ?? `${state.clientName}-${name}`,
    clientSecret: config.oauth.clientSecret,
    scope: config.oauth.scope,
  });
}

function interactiveOptions(
  state: McpClientState,
  name: string,
  generation: number,
): McpOAuthRuntimeOptions {
  return {
    ...state.oauth,
    authorizationTimeoutMs: state.oauth?.authorizationTimeoutMs,
    onAuthorizationRequired: async (context) => {
      const record = state.records.get(name);
      if (state.current(name, generation) && record) {
        record.status = {
          ...record.status,
          status: "connecting",
          authorization: {
            type: "oauth_authorization_code",
            authorizationUrl: context.authorizationUrl,
            startedAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
        };
      }
      await state.oauth?.onAuthorizationRequired?.(context);
    },
  };
}

export async function authorize(
  state: McpClientState,
  name: string,
  config: Exclude<McpServerConfig, { type: "stdio" }>,
  code: McpAuthorizationCodeOAuthConfig,
  generation: number,
  trigger: InteractiveAuthorizationTrigger,
  signal: AbortSignal | undefined,
): Promise<McpInteractiveAuthorizationOutcome> {
  try {
    const options = interactiveOptions(state, name, generation);
    const store = options.credentialStore ?? createSharedKnorviaCredentialStore();
    const keyPrefix = createCredentialKeyPrefix(name, config.url, code);
    let scope = code.scope;
    if (trigger.requiredScope) {
      const pair = await loadCredentialPair(store, keyPrefix);
      scope = computeScopeUnion(code.scope, pair?.tokens?.scope, trigger.requiredScope);
    }
    return await runMcpInteractiveAuthorization({
      adapterInstanceId: state.id,
      config: code,
      credentialStore: store,
      fetchFn: createMcpTransportFetch({ env: state.env, network: state.network }),
      ...(trigger.reason === "insufficient_scope" ? { forceReauthorization: true } : {}),
      keyPrefix,
      ...(state.logger ? { logger: state.logger } : {}),
      ...(options.onAuthorizationRequired
        ? { onAuthorizationRequired: options.onAuthorizationRequired }
        : {}),
      ...(options.openAuthorizationUrl
        ? { openAuthorizationUrl: options.openAuthorizationUrl }
        : {}),
      ...(scope ? { requestedScope: scope } : {}),
      ...(trigger.resourceMetadataUrl
        ? { resourceMetadataUrl: new URL(trigger.resourceMetadataUrl) }
        : {}),
      serverName: name,
      serverUrl: config.url,
      signal,
      transactionTtlMs: MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS,
    });
  } catch (error) {
    state.logger?.warn("MCP OAuth authorization orchestration failed", {
      error: errorText(error),
      errorName: errorName(error),
      event: "mcp.oauth.authorization.orchestration_failed",
      mcpServerName: name,
      status: "failed",
    });
    return { status: "failed", error };
  }
}

export function authorizationFailure(
  name: string,
  outcome: McpInteractiveAuthorizationOutcome,
): unknown {
  if (outcome.status === "failed") return outcome.error;
  return new Error(
    `MCP server ${name} OAuth authorization is still in progress; complete it in the browser and reconnect`,
  );
}
