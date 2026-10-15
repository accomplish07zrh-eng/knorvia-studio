// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// MCP 工具描述符归一化：把上游/插件给的任意 tool 对象收敛成契约要求的描述符。
// 约定：
// 一、tool 不是对象时按空对象处理，名字回落为 "unknown"，不抛错（上游数据常缺失）。
// 二、显示名固定为 mcp__<server>__<tool>，两段都做字符净化，避免下游依赖非法字符。
// 三、inputSchema 总是补上 type: object 与 properties，保证下游 JSON Schema 校验可读。
// 四、annotations 只取四个已知布尔提示；未知字段丢弃，缺省为 undefined。
// 五、official 标记仅在为真时写入，保持契约里的「缺席即非官方」语义。
// 六、timeoutMs 原样透传，由调用方决定是否使用。

import type { JsonSchema, McpToolAnnotations, McpToolDescriptor } from "@knorvia/contracts";

const UNKNOWN_TOOL_NAME = "unknown";
const TOOL_NAME_SEPARATOR = "__";

function looksLikeSchema(raw: unknown): raw is JsonSchema {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/** 净化一段名字：非法字符替换为下划线，连续下划线合并，全空则回落 unknown。 */
function sanitizeComponent(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_") || UNKNOWN_TOOL_NAME;
}

/** 输入 schema：非对象时给空对象 schema，是对象时补 type 与 properties。 */
function projectInputSchema(raw: unknown): JsonSchema {
  if (!looksLikeSchema(raw)) {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  // 展开保留 symbol 与自有 __proto__ 数据字段；后续覆盖不移动已有键位。
  const schema: JsonSchema = { ...raw };
  schema.type = "object";
  const declaredProperties = raw.properties;
  schema.properties = looksLikeSchema(declaredProperties) ? declaredProperties : {};
  return schema;
}

function asBooleanFlag(raw: unknown): boolean | undefined {
  return typeof raw === "boolean" ? raw : undefined;
}

/** 工具提示：只保留契约声明的四个布尔位。 */
function projectAnnotations(raw: unknown): McpToolAnnotations | undefined {
  if (!looksLikeSchema(raw)) return undefined;
  return {
    readOnlyHint: asBooleanFlag(raw.readOnlyHint),
    destructiveHint: asBooleanFlag(raw.destructiveHint),
    idempotentHint: asBooleanFlag(raw.idempotentHint),
    openWorldHint: asBooleanFlag(raw.openWorldHint),
  };
}

/** 把已规范化的字段装配成描述符；official 只在为真时写入。 */
function assembleDescriptor(
  fields: Omit<McpToolDescriptor, "official">,
  official: boolean | undefined,
): McpToolDescriptor {
  if (!official) return { ...fields };
  return { ...fields, official: true };
}

export function normalizeMcpToolDescriptor(
  serverName: string,
  tool: unknown,
  timeoutMs?: number,
  official?: boolean,
): McpToolDescriptor {
  const payload = looksLikeSchema(tool) ? tool : {};
  const candidateName = payload.name;
  const toolName = typeof candidateName === "string" ? candidateName : UNKNOWN_TOOL_NAME;
  const displayName = `mcp${TOOL_NAME_SEPARATOR}${sanitizeComponent(serverName)}${TOOL_NAME_SEPARATOR}${sanitizeComponent(toolName)}`;
  return assembleDescriptor(
    {
      serverName,
      toolName,
      name: displayName,
      description: typeof payload.description === "string" ? payload.description : undefined,
      timeoutMs,
      inputSchema: projectInputSchema(payload.inputSchema),
      outputSchema: looksLikeSchema(payload.outputSchema) ? payload.outputSchema : undefined,
      annotations: projectAnnotations(payload.annotations),
    },
    official,
  );
}
