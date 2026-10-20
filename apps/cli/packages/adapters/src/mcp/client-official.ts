// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 官方 MCP 鉴权的装配层：判定「是否使用官方鉴权」，并为 HTTP / stdio 两条传输准备材料。
//
// 判定条件（`usesOfficialAuth` 要求四项同时成立）：
//   1. 传输是 http 或 stdio；
//   2. `auth.type` 等于官方鉴权标记；
//   3. `auth.provider` 是 jwt_token；
//   4. 配置里带 official 段。
// 任一不满足就原样透传，不做任何鉴权包装。
//
// 两条传输的差别：
// - **HTTP**：缺可信来源注册表时返回一个**必然抛 OfficialMcpAuthError 的 fetch**，
//   让「运行时缺注册表」在调用点立刻可见，而不是静默降级成未鉴权请求；
// - **stdio**：顺序固定为「解析目标来源 → 判定来源可信 → 取鉴权头」，
//   任一环节失败都返回 `ok:false` 与稳定 reason，**不抛给上层**。
//
// 观测契约（字段名逐字保留）：event / mcpKey / mcpServerName / module / pluginId / status /
// reason / detail / targetOrigin / error / errorName / identityHeaderNames / identityTargetType。
// `identityHeaderNames` 只输出小写排序后的头名，**不含头值**。本文件不读写凭据。

import type {
  McpHttpServerConfig,
  McpServerConfig,
  OfficialMcpAuthHeadersResult,
} from "@knorvia/contracts";
import {
  KNORVIA_OFFICIAL_MCP_AUTH_TYPE,
  OFFICIAL_MCP_AUTH_META_KEY,
  type OfficialMcpAuthPortFailureReason,
} from "@knorvia/shared";
import type { McpClientState } from "./client-state.js";
import { errorName, errorText } from "./client-stdio-log.js";
import { createOfficialMcpAuthFetch, OfficialMcpAuthError } from "./official-auth.js";

/** 短别名：让导出签名收敛到一两行。 */
type FetchLike = typeof globalThis.fetch;
type HttpConfig = McpHttpServerConfig;
type Meta = Record<string, unknown>;
type State = McpClientState;

/** stdio 元数据的固定日志基底（事件名与 module 是观测契约）。 */
const STDIO_META_EVENT = "mcp.official_auth.stdio_meta";
const MODULE_TAG = "adapters.mcp";

/** 是否应对该服务启用官方鉴权：四项条件同时成立才启用。 */
export function usesOfficialAuth(server: McpServerConfig): boolean {
  // 只有 http / stdio 两支带 auth 与 official 字段，故先按传输类型提前返回。
  if (server.type !== "http" && server.type !== "stdio") return false;
  const marked = server.auth?.type === KNORVIA_OFFICIAL_MCP_AUTH_TYPE;
  const jwtProvider = server.auth?.provider === "jwt_token";
  const hasOfficialSettings = server.official !== undefined;
  return marked && jwtProvider && hasOfficialSettings;
}

/** 造一个必然失败的 fetch：运行时缺可信来源注册表时用它，让问题立刻暴露。 */
function unavailableFetch(name: string): FetchLike {
  return () => {
    throw new OfficialMcpAuthError(
      "official_auth_unavailable",
      `official MCP trusted origin registry is not available in this runtime: ${name}`,
    );
  };
}

/** 官方 HTTP 鉴权：注册表缺失时返回必然失败的 fetch，否则包装底层 fetch。 */
export function officialHttpFetch(
  state: State,
  name: string,
  config: HttpConfig,
  gen: number,
  from: FetchLike,
): FetchLike {
  if (!usesOfficialAuth(config) || !config.official) return from;
  const ports = state.official;
  const trustedOrigins = ports?.trustedOrigins;
  if (ports === undefined || trustedOrigins === undefined) return unavailableFetch(name);

  // 可选依赖按「存在才写」拼装：避免把 undefined 塞进下游配置。
  const extra: Record<string, unknown> = {};
  if (ports.authHeadersPort) extra.authHeadersPort = ports.authHeadersPort;
  if (state.logger) extra.logger = state.logger;
  if (ports.workspaceIdentity) extra.workspaceIdentity = ports.workspaceIdentity;
  if (state.workingDirectory) extra.workspacePath = state.workingDirectory;

  const plan = {
    baseFetch: from,
    official: config.official,
    onAuthFailure: (kind: Parameters<State["authFailures"]["set"]>[1]): void => {
      state.authFailures.set(name, kind);
    },
    onServerResponse: (info: Parameters<State["observeResponse"]>[2]): void => {
      state.observeResponse(name, gen, info);
    },
    serverName: name,
    trustedOrigins,
    url: config.url,
  };
  return createOfficialMcpAuthFetch({ ...plan, ...extra } as Parameters<
    typeof createOfficialMcpAuthFetch
  >[0]);
}

/** 拼一条 stdio 元数据日志：基底字段 + 调用方给的差异字段。 */
function stdioMetaLog(
  base: Record<string, unknown>,
  delta: Record<string, unknown>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  Object.assign(fields, base);
  Object.assign(fields, delta);
  return fields;
}

/** 把鉴权结果包成 `_meta` 载荷（键名是协议契约）。 */
function wrapMeta(payload: OfficialMcpAuthHeadersResult): Meta {
  const meta: Meta = {};
  meta[OFFICIAL_MCP_AUTH_META_KEY] = payload;
  return meta;
}

/** 官方 stdio 元数据：只有 stdio 且启用官方鉴权才产出，其余返回 undefined。 */
export async function officialStdioMeta(
  state: State,
  name: string,
  config: McpServerConfig,
  signal?: AbortSignal,
): Promise<Meta | undefined> {
  if (config.type !== "stdio" || !usesOfficialAuth(config) || !config.official) return undefined;
  const auth = config.official;
  const ports = state.official;
  const headersPort = ports?.authHeadersPort;
  const registry = ports?.trustedOrigins;
  const resolveOrigin = ports?.resolveKnorviaApiOrigin;

  const logBase: Record<string, unknown> = {};
  logBase.event = STDIO_META_EVENT;
  logBase.mcpKey = auth.mcpKey;
  logBase.mcpServerName = name;
  logBase.module = MODULE_TAG;

  /** 失败统一出口：记一条 warn 日志并交出 `ok:false` 载荷。 */
  const failed = (reason: OfficialMcpAuthPortFailureReason): Meta => {
    const delta: Record<string, unknown> = {};
    delta.reason = reason;
    delta.status = "failed";
    state.logger?.warn("Official MCP stdio auth headers unavailable", stdioMetaLog(logBase, delta));
    return wrapMeta({ ok: false, reason });
  };

  if (!headersPort || !registry || !resolveOrigin) return failed("official_auth_unavailable");

  let origin: string;
  let verdict: Awaited<ReturnType<typeof registry.isTrusted>>;
  try {
    origin = resolveOrigin();
    verdict = await registry.isTrusted({ mcpKey: auth.mcpKey, origin, pluginId: auth.pluginId });
  } catch (cause) {
    const delta: Record<string, unknown> = {};
    delta.error = errorText(cause);
    delta.errorName = errorName(cause);
    delta.pluginId = auth.pluginId;
    state.logger?.warn("Official MCP stdio origin resolution failed", stdioMetaLog(logBase, delta));
    return failed("official_auth_unavailable");
  }

  if (!verdict.trusted) {
    const delta: Record<string, unknown> = {};
    delta.detail = verdict.detail ?? "unknown";
    delta.pluginId = auth.pluginId;
    delta.targetOrigin = origin;
    state.logger?.warn("Official MCP stdio origin is not trusted", stdioMetaLog(logBase, delta));
    return failed("official_mcp_origin_untrusted");
  }

  const headerAsk: Record<string, unknown> = {};
  headerAsk.mcpKey = auth.mcpKey;
  headerAsk.pluginId = auth.pluginId;
  headerAsk.targetOrigin = origin;
  if (ports?.workspaceIdentity) headerAsk.workspaceIdentity = ports.workspaceIdentity;
  if (state.workingDirectory) headerAsk.workspacePath = state.workingDirectory;
  if (signal) headerAsk.signal = signal;

  const result = await headersPort.resolveHeaders(
    headerAsk as Parameters<typeof headersPort.resolveHeaders>[0],
  );
  if (!result.ok) return failed(result.reason);

  const targetType = result.headers["Bigmodel-Target-Type"];
  const delta: Record<string, unknown> = {};
  delta.identityHeaderNames = Object.keys(result.headers)
    .map((header) => header.toLowerCase())
    .sort();
  if (targetType) delta.identityTargetType = targetType;
  delta.status = "completed";
  state.logger?.debug("Official MCP stdio auth headers attached", stdioMetaLog(logBase, delta));
  return wrapMeta({ ok: true, headers: result.headers });
}
