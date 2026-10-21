// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { redactAnthropicRequestMetadata } from "./anthropic-request-metadata.js";

/** 敏感键：值整体替换成固定标记。 */
const SECRET_KEY = /(authorization|api[-_]?key|token|secret|cookie|password|user_?id)/i;

/** 媒体键：只保留原始长度，不回显内容。 */
const MEDIA_KEY = /^(data|dataUrl|image|video|audio)$/i;

/** 三种替换标记。 */
const REDACTED = "[REDACTED]";
const CIRCULAR = "[CIRCULAR]";

/** 对象是否还需要继续下钻（数组与普通对象要，其它不用）。 */
function isTraversable(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

/** 按原键顺序重建对象：逐条赋值以保持插入顺序。 */
function rebuildRecord(
  source: object,
  key: string,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const rebuilt: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(source)) {
    rebuilt[name] = sanitize(entry, name, seen);
  }
  return rebuilt;
}

function sanitize(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (MEDIA_KEY.test(key) && typeof value === "string") return `[REDACTED_MEDIA:${value.length}]`;
  if (!isTraversable(value)) return value;
  if (seen.has(value)) return CIRCULAR;

  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, key, seen));
  return rebuildRecord(value, key, seen);
}

export function sanitizeModelIODebugRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return redactAnthropicRequestMetadata(sanitize(record)) as Record<string, unknown>;
}
