// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30.
// Reimplemented from specs/knorvia-logging-runtime.md; source review remains open.

import type { LogContext, LogEntry, LogRedactor } from "@knorvia/contracts";
import { redactDiagnosticText } from "@knorvia/shared";

export interface SerializedLogError {
  name: string;
  message: string;
  code?: string;
  type?: string;
  stack?: string;
  context?: Record<string, unknown>;
  cause?: SerializedLogError;
}

export type SerializableLogEntry = Record<string, unknown>;

const MAX_DEPTH = 8;
const HIDDEN_KEY = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token)/i;
const RESERVED_CONTEXT = [
  "durationMs",
  "event",
  "module",
  "parentSpanId",
  "sessionId",
  "spanId",
  "status",
  "toolCallId",
  "traceId",
  "turnId",
] as const;
const RESERVED_SET: ReadonlySet<string> = new Set(RESERVED_CONTEXT);
const ENTRY_ORDER = [
  "timestamp",
  "level",
  "event",
  "module",
  "message",
  "traceId",
  "spanId",
  "parentSpanId",
  "sessionId",
  "turnId",
  "toolCallId",
  "durationMs",
  "status",
  "context",
  "error",
] as const;
const STATES: ReadonlySet<unknown> = new Set([
  "started",
  "waiting",
  "completed",
  "failed",
  "cancelled",
]);

function assignOwn(target: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

type Visit = { read: () => unknown; depth: number; write: (value: unknown) => void };
type ArrayFrame = {
  array: unknown[];
  result: unknown[];
  index: number;
  depth: number;
};

export class DefaultLogRedactor implements LogRedactor {
  redact(input: unknown): unknown {
    let output: unknown;
    const identities = new WeakSet<object>();
    const pending: (Visit | ArrayFrame)[] = [
      {
        read: () => input,
        depth: 0,
        write: (value) => {
          output = value;
        },
      },
    ];
    while (pending.length) {
      const visit = pending.pop()!;
      if ("array" in visit) {
        const index = visit.index++;
        if (visit.index < visit.result.length) pending.push(visit);
        if (index in visit.array) {
          pending.push({
            depth: visit.depth,
            read: () => visit.array[index],
            write: (item) => assignOwn(visit.result, index, item),
          });
        }
        continue;
      }
      const value = visit.read();
      if (visit.depth > MAX_DEPTH) {
        visit.write("[Redacted:DepthLimit]");
        continue;
      }
      if (typeof value === "string") {
        visit.write(redactDiagnosticText(value));
        continue;
      }
      if (value === null || typeof value !== "object") {
        visit.write(value);
        continue;
      }
      if (identities.has(value)) {
        visit.write("[Redacted:Circular]");
        continue;
      }
      identities.add(value);
      if (Array.isArray(value)) {
        const result = new Array<unknown>(value.length);
        visit.write(result);
        // 修复：逐索引继续，避免为稀疏空槽预建闭包；250000 槽曾额外占用约 192 MiB。
        if (result.length) {
          pending.push({
            array: value,
            result,
            index: 0,
            depth: visit.depth + 1,
          });
        }
      } else {
        const result: Record<string, unknown> = {};
        const members = Object.entries(value);
        visit.write(result);
        for (const [key] of members) assignOwn(result, key, undefined);
        for (let index = members.length - 1; index >= 0; index--) {
          const [key, item] = members[index]!;
          if (HIDDEN_KEY.test(key)) assignOwn(result, key, "[Redacted]");
          else
            pending.push({
              depth: visit.depth + 1,
              read: () => item,
              write: (next) => assignOwn(result, key, next),
            });
        }
      }
    }
    return output;
  }
}

export function stripReservedContext(context: LogContext): Record<string, unknown> | undefined {
  // 保留旧解构的 getter 顺序；rest 只读取未保留的可枚举自有属性。
  for (const key of RESERVED_CONTEXT) void context[key];
  const rest: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(context)) {
    if (typeof key === "string" && RESERVED_SET.has(key)) continue;
    if (Object.getOwnPropertyDescriptor(context, key)?.enumerable)
      assignOwn(rest, key, context[key as string]);
  }
  return Object.keys(rest).length ? rest : undefined;
}

export function toSerializableEntry(entry: LogEntry, redactor: LogRedactor): SerializableLogEntry {
  const result: SerializableLogEntry = {};
  for (const field of ENTRY_ORDER) {
    let value: unknown;
    switch (field) {
      case "timestamp":
        value = entry.timestamp.toISOString();
        break;
      case "level":
        value = entry.levelName.toLowerCase();
        break;
      case "message":
      case "context":
      case "error":
        value = redactor.redact(entry[field]);
        break;
      default:
        value = entry[field];
    }
    if (value !== undefined) assignOwn(result, field, value);
  }
  return result;
}

export function formatConsoleLine(entry: LogEntry): string {
  const parts = [entry.levelName.toLowerCase(), `[${entry.module ?? "log"}]`];
  if (entry.traceId) parts.push(`trace=${entry.traceId.slice(0, 8)}`);
  if (entry.event) parts.push(`event=${entry.event}`);
  parts.push(redactDiagnosticText(entry.message));
  return parts.join(" ");
}

export function isLogStatus(value: unknown): value is LogEntry["status"] {
  return STATES.has(value);
}

function errorNode(
  input: unknown,
  includeStack: boolean,
): { node: SerializedLogError; next: unknown } {
  if (input === null || typeof input !== "object")
    return { node: { name: "UnknownError", message: String(input) }, next: undefined };
  const record = input as Record<string, unknown>;
  const next = record.cause;
  const node: SerializedLogError = {
    name: typeof record.name === "string" ? record.name : "Error",
    message: typeof record.message === "string" ? record.message : String(input),
  };
  for (const field of ["code", "type"] as const) {
    const value = record[field];
    if (typeof value === "string" && value.length) node[field] = value;
  }
  const context = record.context;
  if (includeStack && typeof record.stack === "string") node.stack = record.stack;
  if (context !== null && typeof context === "object") {
    const prototype = Object.getPrototypeOf(context);
    if (prototype === null || prototype === Object.prototype)
      node.context = context as Record<string, unknown>;
  }
  return { node, next };
}

export function serializeLogError(
  error: unknown,
  includeStack: boolean,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): SerializedLogError {
  let input = error;
  let currentDepth = depth;
  let root: SerializedLogError | undefined;
  let tail: SerializedLogError | undefined;
  for (;;) {
    let node: SerializedLogError;
    let next: unknown;
    if (currentDepth > MAX_DEPTH) {
      node = {
        name: "ErrorCauseDepthLimit",
        message: "Error cause chain exceeded the serialization depth limit.",
      };
    } else if (input !== null && typeof input === "object" && seen.has(input)) {
      node = {
        name: "ErrorCauseCircularReference",
        message: "Error cause chain contained a circular reference.",
      };
    } else {
      if (input !== null && typeof input === "object") seen.add(input);
      ({ node, next } = errorNode(input, includeStack));
    }
    if (tail) tail.cause = node;
    else root = node;
    if (next === undefined) return root!;
    tail = node;
    input = next;
    currentDepth++;
  }
}
