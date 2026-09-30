// SPDX-License-Identifier: Apache-2.0
// Knorvia Studio contributors, 2026-09-30; provenance review pending.

import type { LogContext, LogEntry, LogLevel } from "@knorvia/contracts";
import { LogLevelName } from "@knorvia/contracts";
import { isLogStatus, serializeLogError, stripReservedContext } from "./serialize.js";

const STRING_CONTEXT_FIELDS = [
  "event",
  "module",
  "sessionId",
  "turnId",
  "spanId",
  "parentSpanId",
  "toolCallId",
] as const;

export function projectLogEntry(
  category: string,
  level: LogLevel,
  message: string,
  context: LogContext,
  error: Error | undefined,
  includeStack: boolean,
): LogEntry {
  const entry: LogEntry = { timestamp: new Date(), level, levelName: LogLevelName[level], message };
  for (const field of STRING_CONTEXT_FIELDS) {
    const value = typeof context[field] === "string" ? context[field] : undefined;
    if (value !== undefined) entry[field] = value;
    else if (field === "module") entry.module = category;
    if (field === "module") entry.traceId = context.traceId;
  }
  if (typeof context.durationMs === "number") entry.durationMs = context.durationMs;
  if (isLogStatus(context.status)) entry.status = context.status;
  entry.context = stripReservedContext(context);
  if (error) entry.error = serializeLogError(error, includeStack);
  return entry;
}
