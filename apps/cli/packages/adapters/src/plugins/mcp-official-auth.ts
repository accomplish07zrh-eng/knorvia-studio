// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 官方 MCP 认证配置的校验与归属记录。配置只有一种合法形态（两个键、类型与服务商都是
// 固定字面量），其余一律视为配置错误；缺省则表示该服务未启用官方认证。

import type { KnorviaOfficialMcpAuthConfig, McpOfficialProvenance } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

/** 合法配置的固定取值：类型标识与凭据服务商都是契约字面量。 */
const AUTH_TYPE = "knorvia_official";
const AUTH_PROVIDER = "jwt_token";

/** 合法配置恰好有两个键（type 与 provider），多一个少一个都算不合法。 */
const AUTH_KEY_COUNT = 2;

/** 归属记录的来源标签：目前只有插件一种来源。 */
const PROVENANCE_SOURCE = "plugin";

/** 归属记录的两个标识：服务键与所属插件。 */
type ProvenanceIdentity = {
  mcpKey: string;
  pluginId: string;
};

/** 配置形状是否恰好是那两种固定字面量且没有多余键。 */
function isOfficialAuthShape(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Object.keys(value).length !== AUTH_KEY_COUNT) return false;
  return value.type === AUTH_TYPE && value.provider === AUTH_PROVIDER;
}

/**
 * 解析官方认证配置。
 * - 缺省：未启用，返回 undefined；
 * - 形状合法：返回规范化的配置对象；
 * - 形状不合法：抛错，文案带上目标服务键便于定位。
 */
export function parseKnorviaOfficialAuth(
  value: unknown,
  mcpKey: string,
): KnorviaOfficialMcpAuthConfig | undefined {
  if (value === undefined) return undefined;
  if (!isOfficialAuthShape(value)) {
    throw new Error(`Invalid official authentication for MCP server ${mcpKey}`);
  }
  const config = {} as KnorviaOfficialMcpAuthConfig;
  config.type = AUTH_TYPE;
  config.provider = AUTH_PROVIDER;
  return config;
}

/** 汇总官方 MCP 的归属信息：来源固定为插件，另带服务键与插件标识。 */
export function buildOfficialProvenance(identity: ProvenanceIdentity): McpOfficialProvenance {
  const provenance = {} as McpOfficialProvenance;
  provenance.source = PROVENANCE_SOURCE;
  provenance.pluginId = identity.pluginId;
  provenance.mcpKey = identity.mcpKey;
  return provenance;
}
