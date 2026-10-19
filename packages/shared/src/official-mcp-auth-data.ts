// SPDX-License-Identifier: Apache-2.0

/*
 * 官方 MCP 认证的纯数据表：逻辑名到真实头名的映射、只允许框架写入的头、
 * 失败原因与回环主机白名单。判定、摘要与来源信任逻辑在 official-mcp-auth.ts。
 */

/** 逻辑名 → 真实头名；顺序即登记顺序。 */
export const OFFICIAL_MCP_AUTH_HEADER_NAMES = {
  authorization: "Authorization",
  codingPlanAuthorization: "X-Bigmodel-Authorization",
  targetType: "Bigmodel-Target-Type",
  organization: "Bigmodel-Organization",
  project: "Bigmodel-Project",
} as const;

/** 除身份头外，会话与协议版本头也只能由框架写入。 */
export const OFFICIAL_MCP_SESSION_HEADER_NAMES = [
  "x-coding-plan-api-key",
  "mcp-session-id",
  "mcp-protocol-version",
] as const;

/** 通用失败原因。 */
export const OFFICIAL_MCP_AUTH_FAILURE_REASONS = [
  "official_auth_unavailable",
  "official_auth_plan_required",
] as const;

/** 端口层失败原因：两个通用原因加上来源不信任。 */
export const OFFICIAL_MCP_AUTH_PORT_FAILURE_REASONS = [
  "official_auth_unavailable",
  "official_auth_plan_required",
  "official_mcp_origin_untrusted",
] as const;

/** 本机回环白名单：三个主机名之外一律不算回环。 */
export const OFFICIAL_MCP_LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]"];
