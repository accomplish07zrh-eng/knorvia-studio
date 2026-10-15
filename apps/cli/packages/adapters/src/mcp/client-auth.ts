// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// MCP 客户端鉴权装配：决定某个服务用哪种鉴权方式，并为交互式授权准备运行期材料。
// 判定顺序（authorizationCode）：
// 一、stdio 传输与官方鉴权一律不走 SDK 的 OAuth（由官方端口负责）。
// 二、显式 authorization_code 配置直接采用。
// 三、显式 client_credentials 与已有 Authorization 头都视为「不需要交互式授权」。
// 四、其余情况按 authorization_code 处理：SDK 会按需发起动态注册与授权。
// 运行期约定：
// 五、凭据存储按需创建一次并缓存在 state.credentialStore 上，多个服务共享同一文件。
// 六、交互式授权开始前先把记录状态置为 connecting 并写入授权 URL，供客户端展示。
// 七、授权失败只记录 warn 并返回 failed 结果，不向上抛错（由调用方决定重试或提示）。
// 八、requiredScope 与现有令牌 scope 求并集，避免重复弹窗索取已授权范围。

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

type AuthConfig = McpAuthorizationCodeOAuthConfig;
type HttpConfig = Exclude<McpServerConfig, { type: "stdio" }>;

export function authorizationCode(server: McpServerConfig): AuthConfig | undefined {
  if (server.type === "stdio" || usesOfficialAuth(server)) return undefined;
  if (server.oauth?.type === "authorization_code") return server.oauth;
  if (server.oauth?.type === "client_credentials") return undefined;
  const hasAuthHeader = Object.keys(server.headers ?? {}).some(
    (header) => header.toLowerCase() === "authorization",
  );
  if (hasAuthHeader) return undefined;
  return { type: "authorization_code" };
}

/** 凭据存储：按需创建一次并缓存在状态上，避免每个服务各建一份。 */
function credentialStoreOf(runtimeState: McpClientState) {
  runtimeState.credentialStore ??=
    runtimeState.oauth?.credentialStore ?? createSharedKnorviaCredentialStore();
  return runtimeState.credentialStore;
}

export function authProvider(
  runtimeState: McpClientState,
  target: string,
  server: McpServerConfig,
): AuthProvider | OAuthClientProvider | undefined {
  if (server.type === "stdio" || usesOfficialAuth(server)) return undefined;
  const oauthCode = authorizationCode(server);
  if (oauthCode) {
    return createMcpOAuthTokenProvider({
      config: oauthCode,
      credentialStore: credentialStoreOf(runtimeState),
      fetchFn: createMcpTransportFetch({ env: runtimeState.env, network: runtimeState.network }),
      keyPrefix: createCredentialKeyPrefix(target, server.url, oauthCode),
      ...(runtimeState.logger ? { logger: runtimeState.logger } : {}),
      serverName: target,
      serverUrl: server.url,
    });
  }
  if (server.oauth?.type !== "client_credentials") return undefined;
  return new ClientCredentialsProvider({
    clientId: server.oauth.clientId,
    clientName: server.oauth.clientName ?? `${runtimeState.clientName}-${target}`,
    clientSecret: server.oauth.clientSecret,
    scope: server.oauth.scope,
  });
}

/** 授权开始时改状态：只在记录仍属于本轮时写入，避免污染新一轮连接。 */
function markAuthorizationPending(
  runtimeState: McpClientState,
  target: string,
  epoch: number,
  context: { authorizationUrl: string },
): void {
  const entry = runtimeState.records.get(target);
  if (!runtimeState.current(target, epoch) || !entry) return;
  const now = new Date().toISOString();
  entry.status = {
    ...entry.status,
    status: "connecting",
    authorization: {
      type: "oauth_authorization_code",
      authorizationUrl: context.authorizationUrl,
      startedAt: now,
    },
    updatedAt: now,
  };
}

function interactiveOptions(
  runtimeState: McpClientState,
  target: string,
  epoch: number,
): McpOAuthRuntimeOptions {
  return {
    ...runtimeState.oauth,
    authorizationTimeoutMs: runtimeState.oauth?.authorizationTimeoutMs,
    onAuthorizationRequired: async (context) => {
      markAuthorizationPending(runtimeState, target, epoch, context);
      await runtimeState.oauth?.onAuthorizationRequired?.(context);
    },
  };
}

/** 授权运行入参：可空字段只在有值时出现，字段名由 SDK 契约决定。 */
function interactiveRunInput(input: {
  runtimeState: McpClientState;
  target: string;
  server: HttpConfig;
  oauthCode: AuthConfig;
  settings: McpOAuthRuntimeOptions;
  store: ReturnType<typeof credentialStoreOf>;
  keyPrefix: string;
  scope: string | undefined;
  hint: InteractiveAuthorizationTrigger;
  cancelSignal: AbortSignal | undefined;
}) {
  const { runtimeState, server, settings, scope, target, store, hint } = input;
  return {
    adapterInstanceId: runtimeState.id,
    config: input.oauthCode,
    credentialStore: store,
    fetchFn: createMcpTransportFetch({ env: runtimeState.env, network: runtimeState.network }),
    ...(hint.reason === "insufficient_scope" ? { forceReauthorization: true } : {}),
    keyPrefix: input.keyPrefix,
    ...(runtimeState.logger ? { logger: runtimeState.logger } : {}),
    ...(settings.onAuthorizationRequired
      ? { onAuthorizationRequired: settings.onAuthorizationRequired }
      : {}),
    ...(settings.openAuthorizationUrl
      ? { openAuthorizationUrl: settings.openAuthorizationUrl }
      : {}),
    ...(scope ? { requestedScope: scope } : {}),
    ...(hint.resourceMetadataUrl ? { resourceMetadataUrl: new URL(hint.resourceMetadataUrl) } : {}),
    serverName: target,
    serverUrl: server.url,
    signal: input.cancelSignal,
    transactionTtlMs: MCP_OAUTH_AUTHORIZATION_TRANSACTION_TTL_MS,
  };
}

export async function authorize(
  runtimeState: McpClientState,
  target: string,
  server: HttpConfig,
  oauthCode: AuthConfig,
  epoch: number,
  hint: InteractiveAuthorizationTrigger,
  cancelSignal: AbortSignal | undefined,
): Promise<McpInteractiveAuthorizationOutcome> {
  try {
    const settings = interactiveOptions(runtimeState, target, epoch);
    const store = settings.credentialStore ?? createSharedKnorviaCredentialStore();
    const keyPrefix = createCredentialKeyPrefix(target, server.url, oauthCode);
    let scope = oauthCode.scope;
    if (hint.requiredScope) {
      const pair = await loadCredentialPair(store, keyPrefix);
      scope = computeScopeUnion(oauthCode.scope, pair?.tokens?.scope, hint.requiredScope);
    }
    return await runMcpInteractiveAuthorization(
      interactiveRunInput({
        runtimeState,
        oauthCode,
        server,
        keyPrefix,
        settings,
        scope,
        target,
        cancelSignal,
        store,
        hint,
      }),
    );
  } catch (cause) {
    runtimeState.logger?.warn("MCP OAuth authorization orchestration failed", {
      error: errorText(cause),
      errorName: errorName(cause),
      event: "mcp.oauth.authorization.orchestration_failed",
      mcpServerName: target,
      status: "failed",
    });
    return { status: "failed", error: cause };
  }
}

export function authorizationFailure(
  target: string,
  outcome: McpInteractiveAuthorizationOutcome,
): unknown {
  if (outcome.status === "failed") return outcome.error;
  return new Error(
    `MCP server ${target} OAuth authorization is still in progress; complete it in the browser and reconnect`,
  );
}
