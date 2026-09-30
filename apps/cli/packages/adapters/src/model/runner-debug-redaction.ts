// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import { redactAnthropicRequestMetadata } from "./anthropic-request-metadata.js";

const SECRET_KEY = /(authorization|api[-_]?key|token|secret|cookie|password|user_?id)/i;
const MEDIA_KEY = /^(data|dataUrl|image|video|audio)$/i;
function sanitize(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (MEDIA_KEY.test(key) && typeof value === "string") return `[REDACTED_MEDIA:${value.length}]`;
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, key, seen));
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => [name, sanitize(entry, name, seen)]),
  );
}
export function sanitizeModelIODebugRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return redactAnthropicRequestMetadata(sanitize(record)) as Record<string, unknown>;
}
