// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import {
  MCP_TOOL_DISPLAY_MAX_DESCRIPTION_CHARS,
  MCP_TOOL_DISPLAY_MAX_NAME_CHARS,
  type ToolResultDisplayPayload,
} from "@knorvia/contracts";
import { parseOfficialMcpToolError } from "@knorvia/shared";
import { isRecord } from "../utils.js";

export interface McpDisplayMetadata {
  serverName: string;
  toolName: string;
  description?: string;
  official?: boolean;
}

function label(input: string, capacity: number): string {
  return input
    .trim()
    .slice(0, capacity)
    .replace(/[\uD800-\uDBFF]$/u, "");
}

function unavailableCode(output: unknown) {
  if (!isRecord(output) || output.isError !== true || !Array.isArray(output.content)) return;
  for (const entry of output.content) {
    if (!isRecord(entry) || entry.type !== "text" || typeof entry.text !== "string") continue;
    const error = parseOfficialMcpToolError(entry.text);
    if (error) return { code: error.code };
  }
}

export function createMcpToolDisplay(
  metadata: McpDisplayMetadata | undefined,
  output?: unknown,
): ToolResultDisplayPayload | undefined {
  if (!metadata) return;
  const serverName = label(metadata.serverName, MCP_TOOL_DISPLAY_MAX_NAME_CHARS);
  const toolName = label(metadata.toolName, MCP_TOOL_DISPLAY_MAX_NAME_CHARS);
  if (!serverName || !toolName) return;
  const card: Extract<ToolResultDisplayPayload, { kind: "mcp_tool" }> = {
    kind: "mcp_tool",
    serverName,
    toolName,
  };
  if (metadata.description) {
    const description = label(metadata.description, MCP_TOOL_DISPLAY_MAX_DESCRIPTION_CHARS);
    if (description) card.description = description;
  }
  // 名称不证明来源；只有调用适配器给出的 official 标志能启用结构化错误提示。
  if (metadata.official) {
    const unavailable = unavailableCode(output);
    if (unavailable) card.unavailable = unavailable;
  }
  return card;
}
