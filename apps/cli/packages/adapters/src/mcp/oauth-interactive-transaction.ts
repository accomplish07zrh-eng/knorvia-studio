// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 交互式授权事务：把 SDK 的 OAuthClientProvider 适配到 Knorvia 的凭据存储与等待回调。
// 事务约定：
// 一、transactionId 由 state 摘要得出，用于标记「谁发布的凭据」，不回写用户可见状态。
// 二、可变字段（client/verifier/issuer/discovery）集中在 state 对象里，便于一次性重置。
// 三、clientInformation 优先用配置里的固定 clientId；没有才用动态注册结果。
// 四、saveTokens 落库后记录 info 日志，日志只含 id 摘要与布尔/数值，不含令牌内容。
// 五、redirectToAuthorization 先登记待授权记录（含 TTL 与 baseline），再依次触发回调。
// 六、discoveryState 优先返回内存值，缺失时才回读持久化记录。
// 七、所有日志事件名与字段名是观测契约，逐字保留。

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

type AuthorizationCodeConfig = Extract<McpOAuthConfig, { type: "authorization_code" }>;

interface TransactionInput {
  config: AuthorizationCodeConfig;
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

/** 事务内可变状态：动态注册结果、PKCE verifier、issuer 与发现记录。 */
interface TxState {
  client: OAuthClientInformationMixed | undefined;
  discovery: OAuthDiscoveryState | undefined;
  issuer: string | undefined;
  verifier: string | undefined;
}

/** 日志公共字段：只含 id 摘要与进程号，不含任何凭据内容。 */
function logFields(namespace: string, target: string, attempt: string, transactionId: string) {
  return {
    credentialKeyPrefix: namespace,
    mcpServerName: target,
    oauthAttemptId: attempt.slice(0, SHORT_ID_LENGTH),
    oauthStateId: transactionId.slice(0, STATE_ID_LENGTH),
    processId: process.pid,
  };
}

function clientIdHash(clientId: string | undefined): string | undefined {
  if (!clientId) return undefined;
  return createHash("sha256").update(clientId).digest("hex").slice(0, SHORT_ID_LENGTH);
}

/** 事务上下文：把对象字面量里需要的闭包依赖集中成一处。 */
interface TxContext {
  attempt: string;
  baseline: string | undefined;
  keyPrefix: string;
  logger: Logger | undefined;
  onOpen: ((context: McpOAuthAuthorizationContext) => Promise<void> | void) | undefined;
  onRequired: ((context: McpOAuthAuthorizationContext) => Promise<void> | void) | undefined;
  serverName: string;
  store: SharedKnorviaCredentialStore;
  transactionId: string;
  ttl: number;
  tx: TxState;
  oauthState: string;
}

/** 落库并记录发布日志：日志只含摘要与布尔/数值字段。 */
async function publishTokens(
  context: TxContext,
  tokens: OAuthTokens,
  clientInformation: OAuthClientInformationMixed,
): Promise<void> {
  const published = await publishCanonicalCredentials(context.store, context.keyPrefix, {
    clientInformation,
    ...(context.tx.issuer ? { issuer: context.tx.issuer } : {}),
    publishedBy: context.transactionId,
    tokens,
  });
  context.logger?.info("MCP OAuth credentials published", {
    event: "mcp.oauth.credentials.published",
    ...logFields(context.keyPrefix, context.serverName, context.attempt, context.transactionId),
    clientIdHash: clientIdHash(clientInformation.client_id),
    grantKind: "authorization_code",
    hasRefreshToken: Boolean(tokens.refresh_token),
    publishedGeneration: published.generation.slice(0, SHORT_ID_LENGTH),
    status: "completed",
    tokenExpiresInSeconds: tokens.expires_in,
  });
}

/** 授权跳转：登记待授权记录 → 记录等待日志 → 以 provider 为接收者依次触发两个回调。 */
async function redirectForAuthorization(
  context: TxContext,
  url: URL,
  redirectUrl: string,
  receiver: object,
): Promise<void> {
  const authorizationUrl = url.toString();
  await publishPendingAuthorization(context.store, context.keyPrefix, {
    attemptId: context.attempt,
    authorizationUrl,
    ...(context.baseline ? { baselineGeneration: context.baseline } : {}),
    expiresAt: Date.now() + context.ttl,
    state: context.oauthState,
  });
  context.logger?.info("MCP OAuth authorization required", {
    event: "mcp.oauth.authorization.required",
    ...logFields(context.keyPrefix, context.serverName, context.attempt, context.transactionId),
    callbackPort: Number(new URL(redirectUrl).port),
    status: "waiting",
  });
  const callbackContext: McpOAuthAuthorizationContext = {
    authorizationUrl,
    redirectUrl,
    serverName: context.serverName,
  };
  await context.onRequired?.call(receiver, callbackContext);
  await context.onOpen?.call(receiver, callbackContext);
}

export function createInteractiveTransactionProvider(input: TransactionInput): OAuthClientProvider {
  const {
    attemptId: attempt,
    baselineGeneration: baseline,
    callback: server,
    config: oauthConfig,
    credentialStore: store,
    keyPrefix: namespace,
    logger: log,
    onAuthorizationRequired: onRequired,
    openAuthorizationUrl: onOpen,
    requestedScope: scopeWanted,
    serverName: target,
    state: oauthState,
    ttlMs: ttl,
  } = input;
  const transactionId = createHash("sha256").update(oauthState).digest("hex");
  const tx: TxState = {
    client: undefined,
    discovery: undefined,
    issuer: undefined,
    verifier: undefined,
  };

  const context: TxContext = {
    attempt,
    baseline,
    keyPrefix: namespace,
    logger: log,
    oauthState,
    onOpen,
    onRequired,
    serverName: target,
    store,
    transactionId,
    ttl,
    tx,
  };

  const provider = {
    get redirectUrl(): string {
      return server.callbackUrl;
    },
    get clientMetadata(): OAuthClientMetadata {
      const scope = scopeWanted ?? oauthConfig.scope;
      return {
        client_name: oauthConfig.clientName ?? `Knorvia Studio ${target}`,
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: [provider.redirectUrl],
        response_types: ["code"],
        ...(oauthConfig.clientSecret ? { token_endpoint_auth_method: "client_secret_basic" } : {}),
        // 捕获的是 scope 值和 config 引用；条件和值各自读取，不能预先缓存结果。
        ...(scope ? { scope } : {}),
      };
    },
    state(): string {
      return oauthState;
    },
    clientInformation(): OAuthClientInformationMixed | undefined {
      if (oauthConfig.clientId) {
        return {
          client_id: oauthConfig.clientId,
          ...(oauthConfig.clientSecret ? { client_secret: oauthConfig.clientSecret } : {}),
        };
      }
      return tx.client;
    },
    saveClientInformation(value: OAuthClientInformationMixed): void {
      tx.client = value;
    },
    tokens(): undefined {
      return undefined;
    },
    async saveTokens(tokens: OAuthTokens): Promise<void> {
      const clientInformation = provider.clientInformation();
      if (!clientInformation) {
        throw new Error(`Missing MCP OAuth client information for ${target}`);
      }
      await publishTokens(context, tokens, clientInformation);
    },
    async redirectToAuthorization(url: URL): Promise<void> {
      await redirectForAuthorization(context, url, provider.redirectUrl, provider);
    },
    saveCodeVerifier(value: string): void {
      tx.verifier = value;
    },
    codeVerifier(): string {
      if (!tx.verifier) throw new Error(`Missing MCP OAuth PKCE verifier for ${target}`);
      return tx.verifier;
    },
    saveAuthorizationServerUrl(value: string): void {
      tx.issuer = value;
    },
    authorizationServerUrl(): string | undefined {
      return tx.issuer;
    },
    async saveDiscoveryState(value: OAuthDiscoveryState): Promise<void> {
      tx.discovery = value;
      await saveDiscoveryRecord(store, namespace, value);
    },
    async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
      return tx.discovery || (await loadDiscoveryRecord(store, namespace));
    },
  };
  return provider;
}
// 排障补充：
// 一、publishedGeneration 与 baselineGeneration 不同表示本轮确实发布了新凭据。
// 二、callbackPort 由回调地址解析得出，用于核对浏览器实际访问的端口。
// 三、attemptId 与 oauthStateId 同时出现在日志里，便于把「同一次尝试的多条事件」串起来。
// 四、saveTokens 在缺少 clientInformation 时抛错，不落库半份凭据。
// 五、discoveryState 命中内存值时不再读盘，减少授权流程中的 IO。
