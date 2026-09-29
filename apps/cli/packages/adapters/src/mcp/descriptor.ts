// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { JsonSchema, McpToolAnnotations, McpToolDescriptor } from "@knorvia/contracts";

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nameComponent(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_") || "unknown";
}

function inputSchema(value: unknown): JsonSchema {
  if (!isRecord(value)) {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  // 展开保留 symbol 与自有 __proto__ 数据字段；后续覆盖不移动已有键位。
  const projected: JsonSchema = { ...value };
  projected.type = "object";
  const properties = value.properties;
  projected.properties = isRecord(properties) ? properties : {};
  return projected;
}

function booleanHint(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function annotations(value: unknown): McpToolAnnotations | undefined {
  if (!isRecord(value)) return undefined;
  return {
    readOnlyHint: booleanHint(value.readOnlyHint),
    destructiveHint: booleanHint(value.destructiveHint),
    idempotentHint: booleanHint(value.idempotentHint),
    openWorldHint: booleanHint(value.openWorldHint),
  };
}

export function normalizeMcpToolDescriptor(
  serverName: string,
  tool: unknown,
  timeoutMs?: number,
  official?: boolean,
): McpToolDescriptor {
  const source = isRecord(tool) ? tool : {};
  const rawName = source.name;
  const toolName = typeof rawName === "string" ? rawName : "unknown";
  const descriptor: McpToolDescriptor = {
    serverName,
    toolName,
    name: `mcp__${nameComponent(serverName)}__${nameComponent(toolName)}`,
    description: typeof source.description === "string" ? source.description : undefined,
    timeoutMs,
    inputSchema: inputSchema(source.inputSchema),
    outputSchema: isRecord(source.outputSchema) ? source.outputSchema : undefined,
    annotations: annotations(source.annotations),
  };
  if (official) descriptor.official = true;
  return descriptor;
}
