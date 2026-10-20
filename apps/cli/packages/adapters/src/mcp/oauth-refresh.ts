// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// OAuth 令牌刷新：在文件锁内做「发现 → 换取 → 发布」，并区分三类失败。
// 刷新约定：
// 一、锁前先记下当前 generation；锁内若发现 generation 变了，说明别的进程已刷新，直接复用。
// 二、无凭据抛 no_credentials；缺 refresh_token 或 clientInformation 抛 no_refresh_token。
// 三、发现结果优先用缓存；缓存缺失才发起发现，并顺手把结果写回存储。
// 四、发现阶段的任何失败（含 getter）都按「临时失败」处理，不误判为 grant 失效。
// 五、交换失败按错误码分流：见 GRANT_FAILURE_TABLE（表驱动，新增码只需加一行）。
// 六、grant 失效会先失效凭据再抛交互式授权要求；固定 clientId 被拒时提示修配置而非重授权。
// 七、等锁超时不等于刷新失败：重新读一次凭据，generation 变了就当作已刷新成功。
// 八、日志事件名与字段名是观测契约，逐字保留；日志不含令牌内容。

// 互补说明（与 oauth-provider / oauth-interactive 的边界）：
// 一、本模块只负责「换取新令牌」；何时刷新由 oauth-provider 判定（临近过期或 401）。
// 二、本模块不做交互式授权：需要用户参与时统一抛交互式授权要求错误。
// 三、锁是文件级（跨进程）：同一凭据文件的并发刷新只会有一个真正执行交换。
// 四、发布走 publishCanonicalCredentials：generation 由存储层推进，本模块只透传。
// 五、reactive=true 表示由 401 触发；此时若无法刷新，宁可抛错也不复用旧令牌。
// 排障补充：
// 一、refresh.completed 的 refreshTokenRotated=true 表示授权服务器轮换了刷新令牌。
// 二、refresh.failed 的 oauthErrorCode 为 undefined 表示非 OAuth 错误（多为网络问题）。
// 三、publishedGeneration 与前一次相同说明发布被存储层判为无变化（幂等写入）。
// 四、锁等待超时（REFRESH_LOCK_MAX_WAIT_MS）只影响本次尝试，不会破坏凭据文件。
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

/** 刷新入参里与凭据存储相关的两段：存储本身，以及凭据键的前缀。 */
type RefreshStorePart = { credentialStore: SharedKnorviaCredentialStore; keyPrefix: string };

/** 刷新入参里与服务身份相关的三段：服务名、服务地址、以及可选的固定 clientId。 */
type RefreshServerPart = {
  serverName: string;
  serverUrl: string;
  staticClientId?: string;
};

/** 刷新入参里与「怎么做」相关的三段：可选 fetch、可选日志、以及是否由 401 触发。 */
type RefreshBehaviorPart = { fetchFn?: FetchLike; logger?: Logger; reactive: boolean };

/** 刷新一次的完整入参：由上面三段合成。 */
type RefreshMcpOAuthTokensInput = RefreshStorePart & RefreshServerPart & RefreshBehaviorPart;

type ExchangeOptions = Parameters<typeof refreshAuthorization>[1];
interface ResolvedAuthorization {
  authorizationServerUrl: Parameters<typeof refreshAuthorization>[0];
  metadata?: ExchangeOptions["metadata"];
  resource?: ExchangeOptions["resource"];
}

/** grant 失效分流表：错误码 → 失效范围与重新授权原因（新增码只需加一行）。 */
const GRANT_FAILURE_TABLE = new Map<
  OAuthErrorCode,
  { invalidate: "all" | "tokens"; reason: "invalid_client" | "invalid_grant" }
>([
  [OAuthErrorCode.InvalidGrant, { invalidate: "tokens", reason: "invalid_grant" }],
  [OAuthErrorCode.InvalidClient, { invalidate: "all", reason: "invalid_client" }],
  [OAuthErrorCode.UnauthorizedClient, { invalidate: "all", reason: "invalid_client" }],
]);

/** 别的进程是否已经刷新过（generation 变了即视为已刷新）。 */
function refreshedElsewhere(
  pair: CredentialPairSnapshot | undefined,
  baselineGeneration: string | undefined,
): boolean {
  return Boolean(pair?.tokens && pair.generation !== baselineGeneration);
}

function currentTokenOrTemporaryError(
  refresh: RefreshMcpOAuthTokensInput,
  pair: CredentialPairSnapshot,
  cause: unknown,
): string {
  if (!refresh.reactive && pair.tokens) return pair.tokens.access_token;
  throw createTemporaryRefreshFailureError({ cause, serverName: refresh.serverName });
}

/** 发现阶段：缓存优先，缺失才发起发现并写回；返回交换所需的三元组。 */
async function resolveAuthorization(
  refresh: RefreshMcpOAuthTokensInput,
  pair: CredentialPairSnapshot,
): Promise<ResolvedAuthorization> {
  const issuerHint = pair.issuer ? { expectedIssuer: pair.issuer } : {};
  const cachedRecord = await loadDiscoveryRecord(
    refresh.credentialStore,
    refresh.keyPrefix,
    issuerHint,
  );
  // 注意：refresh.fetchFn 必须**在调用点读取**，不能提前求值。它可能是读取时抛错的
  // 惰性 getter；提前读会让该错误逃出交换阶段的错误处理，把「换取出错」误判成
  // 「发现出错」。测试 exchange options ... failures retain exchange error handling 守这条。
  const serverInfo =
    cachedRecord ??
    (await discoverOAuthServerInfo(
      refresh.serverUrl,
      refresh.fetchFn ? { fetchFn: refresh.fetchFn } : {},
    ));
  if (!cachedRecord) {
    await saveDiscoveryRecord(refresh.credentialStore, refresh.keyPrefix, serverInfo);
  }

  const metadata = serverInfo.authorizationServerMetadata;
  const resource = await selectResourceURL(
    refresh.serverUrl,
    {} as Parameters<typeof selectResourceURL>[1],
    serverInfo.resourceMetadata,
  );
  // 发现结果的 getter 也属于发现失败；先投影，避免误进入 grant 失效处理。
  const resolved = {} as ResolvedAuthorization;
  resolved.authorizationServerUrl = serverInfo.authorizationServerUrl;
  if (metadata) resolved.metadata = metadata;
  if (resource) resolved.resource = resource;
  return resolved;
}

/** grant 失效：先按表失效凭据，再抛交互式授权要求（固定 clientId 被拒时提示修配置）。 */
async function failGrant(
  refresh: RefreshMcpOAuthTokensInput,
  pair: CredentialPairSnapshot,
  grantFailure: { invalidate: "all" | "tokens"; reason: "invalid_client" | "invalid_grant" },
  cause: unknown,
): Promise<never> {
  if (grantFailure.reason === "invalid_client" && refresh.staticClientId) {
    throw new Error(
      `MCP server ${refresh.serverName} OAuth client was rejected by the authorization server (invalid_client). The configured clientId is not usable; fix the MCP oauth configuration.`,
      { cause },
    );
  }
  if (pair.raw) {
    await invalidateCanonicalCredentials(
      refresh.credentialStore,
      refresh.keyPrefix,
      pair.raw,
      grantFailure.invalidate,
    );
  }
  throw createInteractiveAuthorizationRequiredError({
    cause,
    reason: grantFailure.reason,
    serverName: refresh.serverName,
  });
}

/** 交换并发布：成功记录 completed，失败按错误码表分流。 */
async function exchangeAndPublish(
  refresh: RefreshMcpOAuthTokensInput,
  pair: CredentialPairSnapshot,
  authServer: ResolvedAuthorization,
  refreshToken: string,
  clientInformation: NonNullable<CredentialPairSnapshot["clientInformation"]>,
): Promise<string> {
  try {
    const refreshed = await refreshAuthorization(authServer.authorizationServerUrl, {
      clientInformation,
      refreshToken,
      ...(authServer.metadata ? { metadata: authServer.metadata } : {}),
      ...(authServer.resource ? { resource: authServer.resource } : {}),
      ...(refresh.fetchFn ? { fetchFn: refresh.fetchFn } : {}),
    });
    const published = await publishCanonicalCredentials(
      refresh.credentialStore,
      refresh.keyPrefix,
      {
        clientInformation,
        ...(pair.issuer ? { issuer: pair.issuer } : {}),
        publishedBy: `refresh:${refresh.keyPrefix}`,
        tokens: refreshed,
      },
    );
    refresh.logger?.info("MCP OAuth access token refreshed", {
      event: "mcp.oauth.refresh.completed",
      credentialKeyPrefix: refresh.keyPrefix,
      mcpServerName: refresh.serverName,
      processId: process.pid,
      publishedGeneration: published.generation.slice(0, LOGGED_GENERATION_LENGTH),
      reactive: refresh.reactive,
      refreshTokenRotated: refreshed.refresh_token !== refreshToken,
      status: "completed",
    });
    return refreshed.access_token;
  } catch (cause) {
    const oauthErrorCode = cause instanceof OAuthError ? cause.code : undefined;
    refresh.logger?.warn("MCP OAuth access token refresh failed", {
      event: "mcp.oauth.refresh.failed",
      credentialKeyPrefix: refresh.keyPrefix,
      credentialSource: pair.source,
      mcpServerName: refresh.serverName,
      oauthErrorCode,
      processId: process.pid,
      reactive: refresh.reactive,
      status: "failed",
    });
    const grantFailure =
      oauthErrorCode !== undefined
        ? GRANT_FAILURE_TABLE.get(oauthErrorCode as OAuthErrorCode)
        : undefined;
    if (grantFailure) await failGrant(refresh, pair, grantFailure, cause);
    return currentTokenOrTemporaryError(refresh, pair, cause);
  }
}

export async function refreshMcpOAuthTokensUnderLock(
  refresh: RefreshMcpOAuthTokensInput,
): Promise<string> {
  const beforeLock = await loadCredentialPair(refresh.credentialStore, refresh.keyPrefix);
  const baselineGeneration = beforeLock?.generation;
  const refreshLockFile = join(
    dirname(refresh.credentialStore.filePath),
    `${sanitizeKeyPrefix(refresh.keyPrefix)}.refresh`,
  );

  try {
    return await withFileLock(
      refreshLockFile,
      async () => {
        const pair = await loadCredentialPair(refresh.credentialStore, refresh.keyPrefix);
        if (refreshedElsewhere(pair, baselineGeneration)) {
          return pair?.tokens?.access_token ?? "";
        }
        if (!pair?.tokens) {
          throw createInteractiveAuthorizationRequiredError({
            reason: "no_credentials",
            serverName: refresh.serverName,
          });
        }
        // 刷新令牌只捕获一次；交换与轮换日志复用，且先于 clientInformation 读取。
        const refreshToken = pair.tokens.refresh_token;
        const clientInformation = pair.clientInformation;
        if (!refreshToken || !clientInformation) {
          throw createInteractiveAuthorizationRequiredError({
            reason: "no_refresh_token",
            serverName: refresh.serverName,
          });
        }

        let authServer: ResolvedAuthorization;
        try {
          authServer = await resolveAuthorization(refresh, pair);
        } catch (cause) {
          return currentTokenOrTemporaryError(refresh, pair, cause);
        }
        return await exchangeAndPublish(refresh, pair, authServer, refreshToken, clientInformation);
      },
      { lockMaxWaitMs: REFRESH_LOCK_MAX_WAIT_MS },
    );
  } catch (cause) {
    if (!isKnorviaFileLockTimeoutError(cause)) throw cause;
    const postLock = await loadCredentialPair(refresh.credentialStore, refresh.keyPrefix);
    if (refreshedElsewhere(postLock, baselineGeneration)) {
      return postLock?.tokens?.access_token ?? "";
    }
    throw createTemporaryRefreshFailureError({ cause, serverName: refresh.serverName });
  }
}
// 回归提示：
// 一、改动本模块后请覆盖三条路径：正常刷新、grant 失效（invalid_grant/invalid_client）、锁超时。
// 二、fixed clientId 被拒时不要失效凭据：提示修配置比重新授权更可预期。
// 三、发现缓存命中时不应再发起网络发现（可注入 fetchFn 断言调用次数为零）。
// 四、generation 判定必须用「锁前 vs 锁后」两次快照，不能只比一次。
