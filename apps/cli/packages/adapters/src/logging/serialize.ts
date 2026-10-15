// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30.
// Reimplemented from specs/knorvia-logging-runtime.md; source review remains open.

import type { LogContext, LogEntry, LogRedactor } from "@knorvia/contracts";
import { redactDiagnosticText } from "@knorvia/shared";
import { assignOwn } from "./log-redactor.js";

/** 错误序列化的基础字段（不含递归的 cause）。 */
interface ErrorFields {
  code?: string;
  context?: Record<string, unknown>;
  message: string;
  name: string;
  stack?: string;
  type?: string;
}

/** 错误序列化形状：字段全集固定，`cause` 递归指向下一环。 */
export type SerializedLogError = ErrorFields & { cause?: SerializedLogError };

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
const STATUS_SET: ReadonlySet<unknown> = new Set(
  "started waiting completed failed cancelled".split(" "),
);

/** 三个字段要过脱敏器，其余按原值输出。 */
const REDACTED_FIELDS = new Set<string>(["message", "context", "error"]);

const FIELD_CONVERTERS: Record<string, (record: LogEntry) => unknown> = {
  timestamp: (record) => record.timestamp.toISOString(),
  level: (record) => record.levelName.toLowerCase(),
};

/** 保留旧解构的 getter 顺序；只取未保留的可枚举自有属性。 */
function extractExtras(fields: LogContext): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const reserved of Reflect.ownKeys(fields)) {
    if (typeof reserved === "string" && RESERVED_SET.has(reserved)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(fields, reserved);
    if (descriptor?.enumerable) assignOwn(extras, reserved, fields[reserved as string]);
  }
  return extras;
}

function converterFor(field: string): (record: LogEntry, masker: LogRedactor) => unknown {
  const direct = FIELD_CONVERTERS[field];
  if (direct !== undefined) return direct;
  if (REDACTED_FIELDS.has(field))
    return (record, masker) => masker.redact((record as unknown as Record<string, unknown>)[field]);
  return (record) => (record as unknown as Record<string, unknown>)[field];
}

export function stripReservedContext(fields: LogContext): Record<string, unknown> | undefined {
  for (const reserved of RESERVED_CONTEXT) void fields[reserved];
  const extras = extractExtras(fields);
  return Object.keys(extras).length > 0 ? extras : undefined;
}

export function toSerializableEntry(record: LogEntry, masker: LogRedactor): SerializableLogEntry {
  const result: SerializableLogEntry = {};
  for (const slot of ENTRY_ORDER) {
    const value = converterFor(slot)(record, masker);
    if (value !== undefined) assignOwn(result, slot, value);
  }
  return result;
}

/** 控制台单行：级别 + 模块，可选 trace/event，最后是脱敏后的消息。 */
export function formatConsoleLine(record: LogEntry): string {
  const segments = [record.levelName.toLowerCase(), `[${record.module ?? "log"}]`];
  const optional = [
    // traceId 按类型过滤后可能是任意 JSON 值：只有非空字符串才截取展示。
    typeof record.traceId === "string" && record.traceId
      ? `trace=${record.traceId.slice(0, 8)}`
      : undefined,
    record.event ? `event=${record.event}` : undefined,
  ];
  for (const part of optional) {
    if (part !== undefined) segments.push(part);
  }
  segments.push(redactDiagnosticText(record.message));
  return segments.join(" ");
}

export function isLogStatus(value: unknown): value is LogEntry["status"] {
  return STATUS_SET.has(value);
}

// 实现下沉：脱敏器在 log-masker，错误链序列化在 log-error-node；导出名保持不变。
export { DefaultLogRedactor } from "./log-redactor.js";
export { serializeLogError } from "./log-error-node.js";
