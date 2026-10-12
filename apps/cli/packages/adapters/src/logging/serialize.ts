// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30.
// Reimplemented from specs/knorvia-logging-runtime.md; source review remains open.

import type { LogContext, LogEntry, LogRedactor } from "@knorvia/contracts";
import { redactDiagnosticText } from "@knorvia/shared";
import { assignOwn } from "./log-redactor.js";

/** 错误序列化形状：字段全集固定，`cause` 递归指向下一环。 */
export interface SerializedLogError {
  message: string;
  name: string;
  stack?: string;
  code?: string;
  type?: string;
  context?: Record<string, unknown>;
  cause?: SerializedLogError;
}

export type SerializableLogEntry = Record<string, unknown>;

/** 顶层已占用字段：顺序即旧解构的读取顺序，空格分隔一次声明。 */
const RESERVED_CONTEXT =
  "durationMs event module parentSpanId sessionId spanId status toolCallId traceId turnId".split(
    " ",
  );
const RESERVED_SET: ReadonlySet<string> = new Set(RESERVED_CONTEXT);

/** 输出字段顺序：契约 JSONL 的键序由它决定。 */
const ENTRY_ORDER =
  "timestamp level event module message traceId spanId parentSpanId sessionId turnId toolCallId durationMs status context error".split(
    " ",
  );

/** 状态枚举：只作为判定集合使用，不参与输出。 */
const STATES: ReadonlySet<unknown> = new Set(
  "started waiting completed failed cancelled".split(" "),
);

/** 保留旧解构的 getter 顺序；rest 只读取未保留的可枚举自有属性。 */
function copyExtras(context: LogContext): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(context)) {
    if (typeof key === "string" && RESERVED_SET.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(context, key);
    if (descriptor?.enumerable) assignOwn(rest, key, context[key as string]);
  }
  return rest;
}

export function stripReservedContext(context: LogContext): Record<string, unknown> | undefined {
  for (const key of RESERVED_CONTEXT) void context[key];
  const rest = copyExtras(context);
  return Object.keys(rest).length ? rest : undefined;
}

/** 三个字段要过脱敏器，其余按原值输出。 */
const REDACTED_FIELDS = new Set<string>(["message", "context", "error"]);

const FIELD_CONVERTERS: Record<string, (entry: LogEntry) => unknown> = {
  timestamp: (entry) => entry.timestamp.toISOString(),
  level: (entry) => entry.levelName.toLowerCase(),
};

function converterFor(field: string): (entry: LogEntry, redactor: LogRedactor) => unknown {
  const direct = FIELD_CONVERTERS[field];
  if (direct !== undefined) return direct;
  if (REDACTED_FIELDS.has(field)) return (entry, redactor) => redactor.redact(entry[field]);
  return (entry) => entry[field];
}

export function toSerializableEntry(entry: LogEntry, redactor: LogRedactor): SerializableLogEntry {
  const result: SerializableLogEntry = {};
  for (const field of ENTRY_ORDER) {
    const value = converterFor(field)(entry, redactor);
    if (value !== undefined) assignOwn(result, field, value);
  }
  return result;
}

export function formatConsoleLine(entry: LogEntry): string {
  const segments = [entry.levelName.toLowerCase(), `[${entry.module ?? "log"}]`];
  if (entry.traceId) segments.push(`trace=${entry.traceId.slice(0, 8)}`);
  if (entry.event) segments.push(`event=${entry.event}`);
  segments.push(redactDiagnosticText(entry.message));
  return segments.join(" ");
}

export function isLogStatus(value: unknown): value is LogEntry["status"] {
  return STATES.has(value);
}

// 实现下沉：脱敏器在 log-redactor，错误链序列化在 log-error-node；导出名保持不变。
export { DefaultLogRedactor } from "./log-redactor.js";
export { serializeLogError } from "./log-error-node.js";
