// SPDX-License-Identifier: Apache-2.0
// 执行器的三个小助手：形状判定、输入摘要与 hook 值预览。
//
// 都是纯函数，不读环境也不抛错；摘要与预览都设长度上限，避免把超大输入写进事件或日志。

/** 未知形状的输入值。 */
type UnknownValue = unknown;
/** 摘要用的形状对象。 */
type InputSummary = Record<string, unknown>;

const NULL_INPUT_SUMMARY: InputSummary = { type: "null" };
const EMPTY_PREVIEW = "";

function arraySummary(length: number): InputSummary {
  return { type: "array", length };
}

function stringSummary(length: number): InputSummary {
  return { type: "string", length };
}

const INPUT_KEY_LIMIT = 20;
const HOOK_VALUE_PREVIEW_LIMIT = 4_000;

export function isRecord(value: UnknownValue): value is Record<string, unknown> {
  if (value === null) return false;
  if (typeof value !== "object") return false;
  return !Array.isArray(value);
}

// 只描述形状，不回传内容：数组给长度、对象给前若干个键、字符串给长度、其余给类型名。
export function summarizeInput(input: UnknownValue): Record<string, unknown> {
  if (Array.isArray(input)) return arraySummary(input.length);
  if (input === null) return NULL_INPUT_SUMMARY;
  switch (typeof input) {
    case "object":
      return {
        type: "object",
        keys: Object.keys(input as Record<string, unknown>).slice(0, INPUT_KEY_LIMIT),
      };
    case "string":
      return stringSummary(input.length);
    default:
      return { type: typeof input };
  }
}

// 字符串原样返回；其余值尝试 JSON 序列化，失败时退化成 String()。
function serializeHookValue(value: UnknownValue): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

export function previewHookValue(value: UnknownValue): string {
  const serialized = serializeHookValue(value);
  if (serialized.length === 0) return EMPTY_PREVIEW;
  if (serialized.length <= HOOK_VALUE_PREVIEW_LIMIT) return serialized;
  return `${serialized.slice(0, HOOK_VALUE_PREVIEW_LIMIT)}...[truncated]`;
}
