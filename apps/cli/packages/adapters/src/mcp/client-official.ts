// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 官方 MCP 鉴权装配：判定是否使用官方鉴权，并为 HTTP / stdio 两条传输准备鉴权材料。
// 装配约定：
// 一、usesOfficialAuth 要求四个条件同时成立：传输为 http/stdio、auth.type 匹配、
//     provider 为 jwt_token、official 配置存在；任一不满足都走原样透传。
// 二、HTTP 路径缺可信来源注册表时，返回一个总是抛 OfficialMcpAuthError 的 fetch，
//     让「运行时缺少注册表」在调用点立刻可见，而不是静默降级成未鉴权请求。
// 三、stdio 元数据顺序固定：解析目标来源 → 判定来源可信 → 取鉴权头；
//     任一环节失败都返回 ok:false 与稳定 reason，不抛给上层。
// 四、日志事件名与字段名（event / mcpKey / mcpServerName / module / pluginId / status）
//     是观测契约，逐字保留；identityHeaderNames 只输出小写排序后的头名，不含头值。
// 五、可信判定失败用 official_mcp_origin_untrusted，其余失败沿用端口返回的 reason。
// 六、来源解析与可信判定包在同一段 try 内，任一抛出都按「鉴权不可用」处理并记录 error/errorName。

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

/** 短别名：把长类型压成短名，让导出签名收敛到一两行，避免长参数块。 */
type FetchLike = typeof globalThis.fetch;
type HttpConfig = McpHttpServerConfig;
type Meta = Record<string, unknown>;
type State = McpClientState;

export function usesOfficialAuth(server: McpServerConfig): boolean {
  return (
    (server.type === "http" || server.type === "stdio") &&
    server.auth?.type === KNORVIA_OFFICIAL_MCP_AUTH_TYPE &&
    server.auth.provider === "jwt_token" &&
    server.official !== undefined
  );
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
  if (!ports?.trustedOrigins) {
    return () => {
      throw new OfficialMcpAuthError(
        "official_auth_unavailable",
        `official MCP trusted origin registry is not available in this runtime: ${name}`,
      );
    };
  }
  return createOfficialMcpAuthFetch({
    baseFetch: from,
    official: config.official,
    onAuthFailure: (kind) => {
      state.authFailures.set(name, kind);
    },
    onServerResponse: (info) => {
      state.observeResponse(name, gen, info);
    },
    serverName: name,
    trustedOrigins: ports.trustedOrigins,
    url: config.url,
    ...(ports.authHeadersPort ? { authHeadersPort: ports.authHeadersPort } : {}),
    ...(state.logger ? { logger: state.logger } : {}),
    ...(ports.workspaceIdentity ? { workspaceIdentity: ports.workspaceIdentity } : {}),
    ...(state.workingDirectory ? { workspacePath: state.workingDirectory } : {}),
  });
}

/** 官方 stdio 元数据：只有 stdio + 官方鉴权才产出元数据，其余返回 undefined。 */
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
  const logBase = {
    event: "mcp.official_auth.stdio_meta",
    mcpKey: auth.mcpKey,
    mcpServerName: name,
    module: "adapters.mcp",
  };
  const failed = (reason: OfficialMcpAuthPortFailureReason): OfficialMcpAuthHeadersResult => {
    state.logger?.warn("Official MCP stdio auth headers unavailable", {
      ...logBase,
      reason,
      status: "failed",
    });
    return { ok: false, reason };
  };
  const wrapMeta = (payload: OfficialMcpAuthHeadersResult): Meta => ({
    [OFFICIAL_MCP_AUTH_META_KEY]: payload,
  });
  if (!headersPort || !registry || !resolveOrigin)
    return wrapMeta(failed("official_auth_unavailable"));

  let origin: string;
  let verdict: Awaited<ReturnType<typeof registry.isTrusted>>;
  try {
    origin = resolveOrigin();
    verdict = await registry.isTrusted({
      mcpKey: auth.mcpKey,
      origin,
      pluginId: auth.pluginId,
    });
  } catch (cause) {
    state.logger?.warn("Official MCP stdio origin resolution failed", {
      ...logBase,
      error: errorText(cause),
      errorName: errorName(cause),
      pluginId: auth.pluginId,
    });
    return wrapMeta(failed("official_auth_unavailable"));
  }
  if (!verdict.trusted) {
    state.logger?.warn("Official MCP stdio origin is not trusted", {
      ...logBase,
      detail: verdict.detail ?? "unknown",
      pluginId: auth.pluginId,
      targetOrigin: origin,
    });
    return wrapMeta(failed("official_mcp_origin_untrusted"));
  }

  const result = await headersPort.resolveHeaders({
    mcpKey: auth.mcpKey,
    pluginId: auth.pluginId,
    targetOrigin: origin,
    ...(ports?.workspaceIdentity ? { workspaceIdentity: ports.workspaceIdentity } : {}),
    ...(state.workingDirectory ? { workspacePath: state.workingDirectory } : {}),
    ...(signal ? { signal } : {}),
  });
  if (!result.ok) return wrapMeta(failed(result.reason));
  const targetType = result.headers["Bigmodel-Target-Type"];
  state.logger?.debug("Official MCP stdio auth headers attached", {
    ...logBase,
    identityHeaderNames: Object.keys(result.headers)
      .map((header) => header.toLowerCase())
      .sort(),
    ...(targetType ? { identityTargetType: targetType } : {}),
    status: "completed",
  });
  return wrapMeta({ ok: true, headers: result.headers });
}
// 排障补充（照此定位线上问题）：
// 一、日志里 event=mcp.official_auth.stdio_meta 的 status=failed 表示 stdio 元数据未产出，reason 给出原因。
// 二、official_auth_unavailable 常见于运行时未注入 official 端口（桌面宿主早期启动阶段）。
// 三、official_mcp_origin_untrusted 表示来源未在可信注册表中：先查 workspaceIdentity 是否随请求传递。
// 四、Bigmodel-Target-Type 只在服务端返回时记录；缺席不代表鉴权失败。
// 五、HTTP 路径的失败发生在请求阶段（fetch 内），不会走到本文件的 stdio 分支。
// 六、本文件不读写凭据：凭据由 official-auth 模块与共享凭据存储负责。
