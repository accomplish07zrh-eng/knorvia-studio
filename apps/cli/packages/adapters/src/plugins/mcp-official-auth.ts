// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { KnorviaOfficialMcpAuthConfig, McpOfficialProvenance } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

export function parseKnorviaOfficialAuth(
  value: /* 待校验的认证配置原文 */ unknown,
  mcpKey: /* 目标 MCP 服务键 */ string,
): KnorviaOfficialMcpAuthConfig | undefined {
  if (value === undefined) return /* 缺少配置视为未启用官方认证 */ undefined;
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 2 ||
    value.type !== "knorvia_official" ||
    value.provider !== "jwt_token"
  ) {
    throw new Error(`Invalid official authentication for MCP server ${mcpKey}`);
  }
  return { type: "knorvia_official", provider: "jwt_token" };
}
export function /* 汇总官方 MCP 归属信息 */ buildOfficialProvenance(identity: {
  /* 服务键 */ mcpKey: string;
  /* 所属插件 */ pluginId: string;
}): /* 插件来源的归属记录 */ McpOfficialProvenance {
  return { source: "plugin", pluginId: identity.pluginId, mcpKey: identity.mcpKey };
}
