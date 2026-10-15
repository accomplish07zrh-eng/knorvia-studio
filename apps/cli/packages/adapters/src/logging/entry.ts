// SPDX-License-Identifier: Apache-2.0
// Knorvia Studio contributors, 2026-09-30; provenance review pending.

import type { LogContext, LogEntry, LogLevel } from "@knorvia/contracts";
import { LogLevelName } from "@knorvia/contracts";
import { isLogStatus, serializeLogError, stripReservedContext } from "./serialize.js";

type TextField =
  | "event"
  | "module"
  | "sessionId"
  | "turnId"
  | "spanId"
  | "parentSpanId"
  | "toolCallId";

/** 顶层字段名与契约一致；顺序即写入顺序，空格分隔一次声明。 */
const STRING_CONTEXT_FIELDS = "event module sessionId turnId spanId parentSpanId toolCallId".split(
  " ",
) as readonly TextField[];

const MODULE_FIELD: TextField = "module";

function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** 单个文本字段：拿到字符串就写到顶层，否则 module 回落到 category。 */
function applyTextField(entry: LogEntry, key: TextField, value: unknown, category: string): void {
  const text = asText(value);
  if (text !== undefined) {
    entry[key] = text;
    return;
  }
  if (key === MODULE_FIELD) entry.module = category;
}

/** 文本字段整体投影：字段表是唯一顺序来源。 */
function applyTextFields(entry: LogEntry, context: LogContext, category: string): void {
  for (const key of STRING_CONTEXT_FIELDS) applyTextField(entry, key, context[key], category);
}

/** durationMs 与 status 只在类型正确时落到条目上。 */
function applyOptional(entry: LogEntry, context: LogContext): void {
  if (typeof context.durationMs === "number") entry.durationMs = context.durationMs;
  if (isLogStatus(context.status)) entry.status = context.status;
}

/** error 只在存在时挂上，includeStack 语义原样透传。 */
function applyError(entry: LogEntry, error: Error | undefined, includeStack: boolean): void {
  if (error === undefined) return;
  entry.error = serializeLogError(error, includeStack);
}

/**
 * 把一次日志调用投影成 LogEntry：
 * 1) 顶层字段来自字段表（module 缺失时回落到 category）；
 * 2) 可选字段只有类型正确才写入；
 * 3) 其余上下文进 `context`，error 按 includeStack 序列化。
 */
export function projectLogEntry(
  scope: string,
  severity: LogLevel,
  text: string,
  fields: LogContext,
  problem: Error | undefined,
  withStack: boolean,
): LogEntry {
  const entry: LogEntry = {
    level: severity,
    levelName: LogLevelName[severity],
    message: text,
    timestamp: new Date(),
  };
  applyTextFields(entry, fields, scope);
  // traceId 随 module 字段一起写入；字段表内没有其它字段会覆盖它。
  const traceId = fields.traceId;
  entry.traceId = traceId;
  applyOptional(entry, fields);
  const rest = stripReservedContext(fields);
  entry.context = rest;
  applyError(entry, problem, withStack);
  return entry;
}
