// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { dirname, join } from "node:path";
import {
  discoverOAuthServerInfo,
  OAuthError,
  OAuthErrorCode,
  refreshAuthorization,
  selectResourceURL,
  type FetchLike,
} from "@modelcontextprotocol/client";
import type { Logger } from "@knorvia/contracts";
import { isKnorviaFileLockTimeoutError } from "@knorvia/shared";
import { withFileLock } from "@knorvia/shared/node";
import type { SharedKnorviaCredentialStore } from "../auth/shared-credentials.js";
import {
  invalidateCanonicalCredentials,
  loadCredentialPair,
  publishCanonicalCredentials,
  type CredentialPairSnapshot,
} from "./oauth-credentials.js";
import {
  createInteractiveAuthorizationRequiredError,
  createTemporaryRefreshFailureError,
} from "./oauth-errors.js";
import { sanitizeKeyPrefix } from "./oauth-lease.js";
import { loadDiscoveryRecord, saveDiscoveryRecord } from "./oauth-shared.js";

const REFRESH_LOCK_MAX_WAIT_MS = 45_000;
const LOGGED_GENERATION_LENGTH = 12;

interface RefreshMcpOAuthTokensInput {
  credentialStore: SharedKnorviaCredentialStore;
  fetchFn?: FetchLike;
  keyPrefix: string;
  logger?: Logger;
  reactive: boolean;
  serverName: string;
  serverUrl: string;
  staticClientId?: string;
}

type ExchangeOptions = Parameters<typeof refreshAuthorization>[1];
interface ResolvedAuthorization {
  authorizationServerUrl: Parameters<typeof refreshAuthorization>[0];
  metadata?: ExchangeOptions["metadata"];
  resource?: ExchangeOptions["resource"];
}

function currentTokenOrTemporaryError(
  input: RefreshMcpOAuthTokensInput,
  current: CredentialPairSnapshot,
  error: unknown,
): string {
  if (!input.reactive && current.tokens) return current.tokens.access_token;
  throw createTemporaryRefreshFailureError({ cause: error, serverName: input.serverName });
}

export async function refreshMcpOAuthTokensUnderLock(
  input: RefreshMcpOAuthTokensInput,
): Promise<string> {
  const entry = await loadCredentialPair(input.credentialStore, input.keyPrefix);
  const entryGeneration = entry?.generation;
  const lockPath = join(
    dirname(input.credentialStore.filePath),
    `${sanitizeKeyPrefix(input.keyPrefix)}.refresh`,
  );

  try {
    return await withFileLock(
      lockPath,
      async () => {
        const current = await loadCredentialPair(input.credentialStore, input.keyPrefix);
        if (current?.tokens && current.generation !== entryGeneration) {
          return current.tokens.access_token;
        }
        if (!current?.tokens) {
          throw createInteractiveAuthorizationRequiredError({
            reason: "no_credentials",
            serverName: input.serverName,
          });
        }
        // 刷新令牌只捕获一次；交换与轮换日志复用，且先于 clientInformation 读取。
        const refreshToken = current.tokens.refresh_token;
        const clientInformation = current.clientInformation;
        if (!refreshToken || !clientInformation) {
          throw createInteractiveAuthorizationRequiredError({
            reason: "no_refresh_token",
            serverName: input.serverName,
          });
        }

        let resolved: ResolvedAuthorization;
        try {
          const cached = await loadDiscoveryRecord(
            input.credentialStore,
            input.keyPrefix,
            current.issuer ? { expectedIssuer: current.issuer } : {},
          );
          const discovered =
            cached ??
            (await discoverOAuthServerInfo(
              input.serverUrl,
              input.fetchFn ? { fetchFn: input.fetchFn } : {},
            ));
          if (!cached) {
            await saveDiscoveryRecord(input.credentialStore, input.keyPrefix, discovered);
          }
          const resource = await selectResourceURL(
            input.serverUrl,
            {} as Parameters<typeof selectResourceURL>[1],
            discovered.resourceMetadata,
          );
          // 发现结果的 getter 也属于发现失败；先投影，避免误进入 grant 失效处理。
          resolved = {
            authorizationServerUrl: discovered.authorizationServerUrl,
            ...(discovered.authorizationServerMetadata
              ? { metadata: discovered.authorizationServerMetadata }
              : {}),
            ...(resource ? { resource } : {}),
          };
        } catch (error) {
          return currentTokenOrTemporaryError(input, current, error);
        }

        try {
          const next = await refreshAuthorization(resolved.authorizationServerUrl, {
            clientInformation,
            refreshToken,
            ...(resolved.metadata ? { metadata: resolved.metadata } : {}),
            ...(resolved.resource ? { resource: resolved.resource } : {}),
            ...(input.fetchFn ? { fetchFn: input.fetchFn } : {}),
          });
          const published = await publishCanonicalCredentials(
            input.credentialStore,
            input.keyPrefix,
            {
              clientInformation,
              ...(current.issuer ? { issuer: current.issuer } : {}),
              publishedBy: `refresh:${input.keyPrefix}`,
              tokens: next,
            },
          );
          input.logger?.info("MCP OAuth access token refreshed", {
            event: "mcp.oauth.refresh.completed",
            credentialKeyPrefix: input.keyPrefix,
            mcpServerName: input.serverName,
            processId: process.pid,
            publishedGeneration: published.generation.slice(0, LOGGED_GENERATION_LENGTH),
            reactive: input.reactive,
            refreshTokenRotated: next.refresh_token !== refreshToken,
            status: "completed",
          });
          return next.access_token;
        } catch (error) {
          const oauthErrorCode = error instanceof OAuthError ? error.code : undefined;
          input.logger?.warn("MCP OAuth access token refresh failed", {
            event: "mcp.oauth.refresh.failed",
            credentialKeyPrefix: input.keyPrefix,
            credentialSource: current.source,
            mcpServerName: input.serverName,
            oauthErrorCode,
            processId: process.pid,
            reactive: input.reactive,
            status: "failed",
          });
          if (oauthErrorCode === OAuthErrorCode.InvalidGrant) {
            if (current.raw) {
              await invalidateCanonicalCredentials(
                input.credentialStore,
                input.keyPrefix,
                current.raw,
                "tokens",
              );
            }
            throw createInteractiveAuthorizationRequiredError({
              cause: error,
              reason: "invalid_grant",
              serverName: input.serverName,
            });
          }
          if (
            oauthErrorCode === OAuthErrorCode.InvalidClient ||
            oauthErrorCode === OAuthErrorCode.UnauthorizedClient
          ) {
            if (input.staticClientId) {
              throw new Error(
                `MCP server ${input.serverName} OAuth client was rejected by the authorization server (invalid_client). The configured clientId is not usable; fix the MCP oauth configuration.`,
                { cause: error },
              );
            }
            if (current.raw) {
              await invalidateCanonicalCredentials(
                input.credentialStore,
                input.keyPrefix,
                current.raw,
                "all",
              );
            }
            throw createInteractiveAuthorizationRequiredError({
              cause: error,
              reason: "invalid_client",
              serverName: input.serverName,
            });
          }
          return currentTokenOrTemporaryError(input, current, error);
        }
      },
      { lockMaxWaitMs: REFRESH_LOCK_MAX_WAIT_MS },
    );
  } catch (error) {
    if (!isKnorviaFileLockTimeoutError(error)) throw error;
    const recovered = await loadCredentialPair(input.credentialStore, input.keyPrefix);
    if (recovered?.tokens && recovered.generation !== entryGeneration) {
      return recovered.tokens.access_token;
    }
    throw createTemporaryRefreshFailureError({ cause: error, serverName: input.serverName });
  }
}
