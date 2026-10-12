// SPDX-License-Identifier: Apache-2.0
// Knorvia Studio contributors, 2026-09-30; provenance review pending.

import type { LogContext, LogEntry, LogLevel } from "@knorvia/contracts";
import { LogLevelName } from "@knorvia/contracts";
import { isLogStatus, serializeLogError, stripReservedContext } from "./serialize.js";

/** 逐字段直取到条目顶层的上下文字段；其余字段进 `context` 子对象。 */
type TextField =
  | "event"
  | "module"
  | "sessionId"
  | "turnId"
  | "spanId"
  | "parentSpanId"
  | "toolCallId";

/** 与契约字段同名，空格分隔一次声明；顺序即写入顺序。 */
const STRING_CONTEXT_FIELDS = "event module sessionId turnId spanId parentSpanId toolCallId".split(
  " ",
) as readonly TextField[];

const MODULE_FIELD: TextField = "module";

function asText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** durationMs 与 status 只在类型正确时落到条目上。 */
function applyOptional(entry: LogEntry, context: LogContext): void {
  if (typeof context.durationMs === "number") entry.durationMs = context.durationMs;
  if (isLogStatus(context.status)) entry.status = context.status;
}

export function projectLogEntry(
  category: string,
  level: LogLevel,
  message: string,
  context: LogContext,
  error: Error | undefined,
  includeStack: boolean,
): LogEntry {
  const entry: LogEntry = {
    level,
    levelName: LogLevelName[level],
    message,
    timestamp: new Date(),
  };
  for (const field of STRING_CONTEXT_FIELDS) {
    const text = asText(context[field]);
    if (text !== undefined) entry[field] = text;
    else if (field === MODULE_FIELD) entry.module = category;
  }
  // traceId 随 module 字段一起写入；字段表内没有其它字段会覆盖它。
  entry.traceId = context.traceId;
  applyOptional(entry, context);
  entry.context = stripReservedContext(context);
  if (error !== undefined) entry.error = serializeLogError(error, includeStack);
  return entry;
}
