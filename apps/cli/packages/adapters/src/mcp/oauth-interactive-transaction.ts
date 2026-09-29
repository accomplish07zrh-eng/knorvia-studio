// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  OAuthTokens,
} from "@modelcontextprotocol/client";
import type { Logger, McpOAuthConfig } from "@knorvia/contracts";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import type { LocalhostOAuthCallbackServer } from "../auth/localhost-callback.js";
import { publishCanonicalCredentials } from "./oauth-credentials.js";
import { publishPendingAuthorization } from "./oauth-lease.js";
import {
  loadDiscoveryRecord,
  saveDiscoveryRecord,
  type McpOAuthAuthorizationContext,
} from "./oauth-shared.js";

const SHORT_ID_LENGTH = 12;
const STATE_ID_LENGTH = 16;

interface TransactionInput {
  config: Extract<McpOAuthConfig, { type: "authorization_code" }>;
  credentialStore: SharedKnorviaCredentialStore;
  keyPrefix: string;
  logger?: Logger;
  onAuthorizationRequired?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  openAuthorizationUrl?: (context: McpOAuthAuthorizationContext) => Promise<void> | void;
  requestedScope?: string;
  serverName: string;
  callback: LocalhostOAuthCallbackServer;
  attemptId: string;
  baselineGeneration?: string;
  ttlMs: number;
  state: string;
}

export function createInteractiveTransactionProvider(input: TransactionInput): OAuthClientProvider {
  const {
    config,
    credentialStore,
    keyPrefix,
    logger,
    onAuthorizationRequired,
    openAuthorizationUrl,
    requestedScope,
    serverName,
    callback,
    attemptId,
    baselineGeneration,
    ttlMs,
    state,
  } = input;
  const transactionId = createHash("sha256").update(state).digest("hex");
  let client: OAuthClientInformationMixed | undefined;
  let verifier: string | undefined;
  let discovery: OAuthDiscoveryState | undefined;
  let issuer: string | undefined;
  const logContext = () => ({
    credentialKeyPrefix: keyPrefix,
    mcpServerName: serverName,
    oauthAttemptId: attemptId.slice(0, SHORT_ID_LENGTH),
    oauthStateId: transactionId.slice(0, STATE_ID_LENGTH),
    processId: process.pid,
  });

  const provider = {
    get redirectUrl(): string {
      return callback.callbackUrl;
    },
    get clientMetadata(): OAuthClientMetadata {
      return {
        client_name: config.clientName ?? `Knorvia Studio ${serverName}`,
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: [provider.redirectUrl],
        response_types: ["code"],
        ...(config.clientSecret ? { token_endpoint_auth_method: "client_secret_basic" } : {}),
        // 捕获的是 scope 值和 config 引用；条件和值各自读取，不能预先缓存结果。
        ...((requestedScope ?? config.scope) ? { scope: requestedScope ?? config.scope } : {}),
      };
    },
    state(): string {
      return state;
    },
    clientInformation(): OAuthClientInformationMixed | undefined {
      if (config.clientId) {
        return {
          client_id: config.clientId,
          ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
        };
      }
      return client;
    },
    saveClientInformation(value: OAuthClientInformationMixed): void {
      client = value;
    },
    tokens(): undefined {
      return undefined;
    },
    async saveTokens(tokens: OAuthTokens): Promise<void> {
      const clientInformation = provider.clientInformation();
      if (!clientInformation) {
        throw new Error(`Missing MCP OAuth client information for ${serverName}`);
      }
      const published = await publishCanonicalCredentials(credentialStore, keyPrefix, {
        clientInformation,
        ...(issuer ? { issuer } : {}),
        publishedBy: transactionId,
        tokens,
      });
      logger?.info("MCP OAuth credentials published", {
        event: "mcp.oauth.credentials.published",
        ...logContext(),
        clientIdHash: clientInformation.client_id
          ? createHash("sha256")
              .update(clientInformation.client_id)
              .digest("hex")
              .slice(0, SHORT_ID_LENGTH)
          : undefined,
        grantKind: "authorization_code",
        hasRefreshToken: Boolean(tokens.refresh_token),
        publishedGeneration: published.generation.slice(0, SHORT_ID_LENGTH),
        status: "completed",
        tokenExpiresInSeconds: tokens.expires_in,
      });
    },
    async redirectToAuthorization(url: URL): Promise<void> {
      const context = {
        authorizationUrl: url.toString(),
        redirectUrl: provider.redirectUrl,
        serverName,
      };
      await publishPendingAuthorization(credentialStore, keyPrefix, {
        attemptId,
        authorizationUrl: context.authorizationUrl,
        ...(baselineGeneration ? { baselineGeneration } : {}),
        expiresAt: Date.now() + ttlMs,
        state,
      });
      logger?.info("MCP OAuth authorization required", {
        event: "mcp.oauth.authorization.required",
        ...logContext(),
        callbackPort: Number(new URL(provider.redirectUrl).port),
        status: "waiting",
      });
      await onAuthorizationRequired?.call(provider, context);
      await openAuthorizationUrl?.call(provider, context);
    },
    saveCodeVerifier(value: string): void {
      verifier = value;
    },
    codeVerifier(): string {
      if (!verifier) throw new Error(`Missing MCP OAuth PKCE verifier for ${serverName}`);
      return verifier;
    },
    saveAuthorizationServerUrl(value: string): void {
      issuer = value;
    },
    authorizationServerUrl(): string | undefined {
      return issuer;
    },
    async saveDiscoveryState(value: OAuthDiscoveryState): Promise<void> {
      discovery = value;
      await saveDiscoveryRecord(credentialStore, keyPrefix, value);
    },
    async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
      return discovery || (await loadDiscoveryRecord(credentialStore, keyPrefix));
    },
  };
  return provider;
}
