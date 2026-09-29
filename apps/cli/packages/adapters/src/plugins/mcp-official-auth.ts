// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { KnorviaOfficialMcpAuthConfig, McpOfficialProvenance } from "@knorvia/contracts";
import { isRecord } from "./helpers.js";

export function parseKnorviaOfficialAuth(
  value: unknown,
  mcpKey: string,
): KnorviaOfficialMcpAuthConfig | undefined {
  if (value === undefined) return undefined;
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
export function buildOfficialProvenance(identity: {
  mcpKey: string;
  pluginId: string;
}): McpOfficialProvenance {
  return { source: "plugin", pluginId: identity.pluginId, mcpKey: identity.mcpKey };
}
