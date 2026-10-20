// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// MCP 工具描述符的归一化：把上游或插件给的任意 tool 对象收敛成契约要求的形状。
//
// 归一约定：
// 一、tool 不是对象时按空对象处理，名字回落 "unknown" —— 上游数据常有缺失，这里不抛错。
// 二、显示名固定为 mcp__<server>__<tool>，两段都做字符净化，避免非法字符流到下游。
// 三、inputSchema 一律补 type: object 与 properties，让下游的 JSON Schema 校验有东西可读。
// 四、annotations 只取四个已知布尔提示位；未知字段丢弃，缺省为 undefined。
// 五、official 只在为真时写入 —— 契约语义是「缺席即非官方」。
// 六、timeoutMs 原样透传，由调用方决定要不要用。

import type { JsonSchema, McpToolAnnotations, McpToolDescriptor } from "@knorvia/contracts";

/** 名字缺失时的回落值。 */
const UNKNOWN_TOOL_NAME = "unknown";

/** 显示名三段之间的分隔符。 */
const TOOL_NAME_SEPARATOR = "__";

/** 显示名的前缀。 */
const DISPLAY_NAME_PREFIX = "mcp";

/** 四个布尔提示位在契约里的字段名。 */
const ANNOTATION_FLAGS = [
  "readOnlyHint",
  "destructiveHint",
  "idempotentHint",
  "openWorldHint",
] as const;

/** 普通对象判定（schema 与 tool 都用它）。 */
function looksLikeSchema(raw: unknown): raw is JsonSchema {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/** 净化一段名字：非法字符换下划线、连续下划线合并、全空回落 unknown。 */
function sanitizeComponent(raw: string): string {
  const replaced = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return replaced.replace(/_+/g, "_") || UNKNOWN_TOOL_NAME;
}

/** 拼显示名：前缀 + 净化后的服务名 + 工具名。 */
function displayNameOf(serverName: string, toolName: string): string {
  const parts = [DISPLAY_NAME_PREFIX, sanitizeComponent(serverName), sanitizeComponent(toolName)];
  return parts.join(TOOL_NAME_SEPARATOR);
}

/** 输入 schema：非对象给空 schema；是对象就补 type 与 properties，保留原有键位。 */
function projectInputSchema(raw: unknown): JsonSchema {
  if (!looksLikeSchema(raw)) {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  // 展开保留 symbol 与自有 __proto__ 数据字段；后续覆盖不移动已有键位。
  const schema: JsonSchema = { ...raw };
  schema.type = "object";
  schema.properties = looksLikeSchema(raw.properties) ? raw.properties : {};
  return schema;
}

/** 布尔提示位：只认真正的布尔值。 */
function asBooleanFlag(raw: unknown): boolean | undefined {
  return typeof raw === "boolean" ? raw : undefined;
}

/** 工具提示：逐位判定，四位都缺时仍返回对象（保持契约形状）。 */
function projectAnnotations(raw: unknown): McpToolAnnotations | undefined {
  if (!looksLikeSchema(raw)) return undefined;
  const annotations = {} as McpToolAnnotations;
  for (const flag of ANNOTATION_FLAGS) annotations[flag] = asBooleanFlag(raw[flag]);
  return annotations;
}

/** 把字段装配成描述符；official 仅在为真时出现。 */
function assembleDescriptor(
  fields: Omit<McpToolDescriptor, "official">,
  official: boolean | undefined,
): McpToolDescriptor {
  if (!official) return { ...fields };
  return { ...fields, official: true };
}

/** 归一的中间结果：先算出各字段，再交给装配函数决定 official 的取舍。 */
function descriptorFields(
  serverName: string,
  payload: JsonSchema,
  timeoutMs: number | undefined,
): Omit<McpToolDescriptor, "official"> {
  const candidateName = payload.name;
  const toolName = typeof candidateName === "string" ? candidateName : UNKNOWN_TOOL_NAME;
  const fields = {} as Omit<McpToolDescriptor, "official">;
  fields.serverName = serverName;
  fields.toolName = toolName;
  fields.name = displayNameOf(serverName, toolName);
  fields.description = typeof payload.description === "string" ? payload.description : undefined;
  fields.timeoutMs = timeoutMs;
  fields.inputSchema = projectInputSchema(payload.inputSchema);
  fields.outputSchema = looksLikeSchema(payload.outputSchema) ? payload.outputSchema : undefined;
  fields.annotations = projectAnnotations(payload.annotations);
  return fields;
}

export function normalizeMcpToolDescriptor(
  serverName: string,
  tool: unknown,
  timeoutMs?: number,
  official?: boolean,
): McpToolDescriptor {
  const payload = looksLikeSchema(tool) ? tool : {};
  return assembleDescriptor(descriptorFields(serverName, payload, timeoutMs), official);
}
