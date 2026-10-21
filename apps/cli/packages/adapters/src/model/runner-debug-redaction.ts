// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
//
// 模型 IO 调试记录的脱敏器。
//
// 三类处理，按优先级从高到低：
//   ① **键名命中敏感词** → 整个值替换成固定标记，不看值本身；
//   ② **键名是媒体字段且值是字符串** → 只保留长度，不回显内容（体积本身就是线索）；
//   ③ 其余递归下钻：数组逐项、对象逐键；同一个对象第二次遇到时标记为循环引用。
//
// 键顺序按原对象顺序重建 —— 调试记录的可读性依赖「字段次序与原始一致」。

import { redactAnthropicRequestMetadata } from "./anthropic-request-metadata.js";

/** 键名命中这些片段就整体脱敏（大小写不敏感）。 */
const CREDENTIAL_KEY = /(authorization|api[-_]?key|token|secret|cookie|password|user_?id)/i;

/** 媒体字段：值只报长度。 */
const MEDIA_KEY = /^(data|dataUrl|image|video|audio)$/i;

/** 三个替换标记。 */
const REDACTED = "[REDACTED]";
const CIRCULAR = "[CIRCULAR]";
const mediaMask = (length: number): string => `[REDACTED_MEDIA:${length}]`;

/** 还需继续下钻的类型（数组与普通对象）；其余直接返回原值。 */
function isBranch(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** 逐键重建对象，保持原键顺序。 */
function mapValues(
  source: object,
  visit: (entry: unknown, key: string) => unknown,
): Record<string, unknown> {
  const rebuilt: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) rebuilt[key] = visit(entry, key);
  return rebuilt;
}

function sanitize(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (CREDENTIAL_KEY.test(key)) return REDACTED;

  const mediaString = MEDIA_KEY.test(key) && typeof value === "string";
  if (mediaString) return mediaMask((value as string).length);

  if (!isBranch(value)) return value;
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, key, seen));
  return mapValues(value, (entry, name) => sanitize(entry, name, seen));
}

export function sanitizeModelIODebugRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return redactAnthropicRequestMetadata(sanitize(record)) as Record<string, unknown>;
}
