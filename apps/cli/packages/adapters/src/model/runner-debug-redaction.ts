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

/** 一次下钻的上下文：当前值、它所在的键名、以及已访问对象集合。 */
type Visit = { value: unknown; key: string; seen: WeakSet<object> };

/** 键名命中这些片段就整体脱敏（大小写不敏感）。 */
const CREDENTIAL_KEY = /(authorization|api[-_]?key|token|secret|cookie|password|user_?id)/i;

/** 媒体字段名（整名匹配）：值只报长度，不回显内容。 */
const MEDIA_FIELD = /^(data|dataUrl|image|video|audio)$/i;

/** 三个替换标记。 */
const REDACTED = "[REDACTED]";
const CIRCULAR = "[CIRCULAR]";
const mediaMask = (length: number): string => `[REDACTED_MEDIA:${length}]`;

/** 调试记录的短别名（签名里出现两次）。 */
type DebugRecord = Record<string, unknown>;

/** 还需继续下钻的类型（数组与普通对象）；其余直接返回原值。 */
function isBranch(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** 逐键重建对象，保持原键顺序。 */
function mapValues(source: object, visit: (entry: unknown, key: string) => unknown): DebugRecord {
  const rebuilt: DebugRecord = {};
  for (const key of Object.keys(source)) rebuilt[key] = visit(Reflect.get(source, key), key);
  return rebuilt;
}

/** 递归脱敏：敏感键整体替换，媒体键只报长度，其余按类型下钻。 */
function sanitize({ value, key, seen }: Visit): unknown {
  if (CREDENTIAL_KEY.test(key)) return REDACTED;

  const mediaString = MEDIA_FIELD.test(key) && typeof value === "string";
  if (mediaString) return mediaMask((value as string).length);

  if (!isBranch(value)) return value;
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);

  const descend = (entry: unknown, name: string): unknown =>
    sanitize({ value: entry, key: name, seen });
  return Array.isArray(value)
    ? value.map((entry) => descend(entry, key))
    : mapValues(value, descend);
}

export function sanitizeModelIODebugRecord(record: DebugRecord): DebugRecord {
  return redactAnthropicRequestMetadata(
    sanitize({ value: record, key: "", seen: new WeakSet() }),
  ) as DebugRecord;
}
