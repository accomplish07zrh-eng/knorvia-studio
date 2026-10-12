// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30.
// Reimplemented from specs/knorvia-logging-runtime.md; source review remains open.

import type { LogContext, LogEntry, LogRedactor } from "@knorvia/contracts";
import { redactDiagnosticText } from "@knorvia/shared";

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

const MAX_DEPTH = 8;
const HIDDEN_KEY = /(?:api[-_]?key|authorization|cookie|credential|password|secret|token)/i;

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

const DEPTH_SENTINEL = "[Redacted:DepthLimit]";
const CIRCULAR_SENTINEL = "[Redacted:Circular]";
const HIDDEN_SENTINEL = "[Redacted]";

function assignOwn(into: object, key: PropertyKey, value: unknown): void {
  Object.defineProperty(into, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

type Visit = { depth: number; read: () => unknown; write: (value: unknown) => void };
type ArrayFrame = {
  array: unknown[];
  depth: number;
  index: number;
  result: unknown[];
};
type Frame = Visit | ArrayFrame;

function isArrayFrame(frame: Frame): frame is ArrayFrame {
  return "array" in frame;
}

export class DefaultLogRedactor implements LogRedactor {
  redact(input: unknown): unknown {
    let redacted: unknown;
    const seen = new WeakSet<object>();
    const stack: Frame[] = [
      {
        depth: 0,
        read: () => input,
        write: (value) => {
          redacted = value;
        },
      },
    ];
    while (stack.length) {
      const frame = stack.pop()!;
      if (isArrayFrame(frame)) {
        expandArray(frame, stack);
        continue;
      }
      const value = frame.read();
      if (frame.depth > MAX_DEPTH) {
        frame.write(DEPTH_SENTINEL);
        continue;
      }
      if (typeof value === "string") {
        frame.write(redactDiagnosticText(value));
        continue;
      }
      if (value === null || typeof value !== "object") {
        frame.write(value);
        continue;
      }
      if (seen.has(value)) {
        frame.write(CIRCULAR_SENTINEL);
        continue;
      }
      seen.add(value);
      if (Array.isArray(value)) expandNewArray(frame, value, stack);
      else expandNewObject(frame, value, stack);
    }
    return redacted;
  }
}

/** 稀疏数组逐索引推进：不为空槽预建闭包（250000 槽曾额外占用约 192 MiB）。 */
function expandArray(frame: ArrayFrame, stack: Frame[]): void {
  const index = frame.index++;
  if (frame.index < frame.result.length) stack.push(frame);
  if (index in frame.array) {
    stack.push({
      depth: frame.depth,
      read: () => frame.array[index],
      write: (item) => assignOwn(frame.result, index, item),
    });
  }
}

function expandNewArray(frame: Visit, value: unknown[], stack: Frame[]): void {
  const copy = new Array<unknown>(value.length);
  frame.write(copy);
  if (copy.length === 0) return;
  stack.push({ array: value, depth: frame.depth + 1, index: 0, result: copy });
}

/** 对象：先占位全部键（保持键序），再从后往前压栈，隐藏键直接打码。 */
function expandNewObject(frame: Visit, value: object, stack: Frame[]): void {
  const copy: Record<string, unknown> = {};
  const pairs = Object.entries(value);
  frame.write(copy);
  for (const [key] of pairs) assignOwn(copy, key, undefined);
  for (let index = pairs.length - 1; index >= 0; index -= 1) {
    const [key, item] = pairs[index]!;
    if (HIDDEN_KEY.test(key)) {
      assignOwn(copy, key, HIDDEN_SENTINEL);
      continue;
    }
    stack.push({
      depth: frame.depth + 1,
      read: () => item,
      write: (next) => assignOwn(copy, key, next),
    });
  }
}

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

export function toSerializableEntry(entry: LogEntry, redactor: LogRedactor): SerializableLogEntry {
  const result: SerializableLogEntry = {};
  for (const field of ENTRY_ORDER) {
    const value = converterFor(field)(entry, redactor);
    if (value !== undefined) assignOwn(result, field, value);
  }
  return result;
}

function converterFor(field: string): (entry: LogEntry, redactor: LogRedactor) => unknown {
  const direct = FIELD_CONVERTERS[field];
  if (direct !== undefined) return direct;
  if (REDACTED_FIELDS.has(field)) return (entry, redactor) => redactor.redact(entry[field]);
  return (entry) => entry[field];
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

/** 只接受纯对象上下文（原型为 null 或 Object.prototype），其余忽略。 */
function plainContext(inner: unknown): Record<string, unknown> | undefined {
  if (inner === null || typeof inner !== "object") return undefined;
  const proto = Object.getPrototypeOf(inner);
  if (proto !== null && proto !== Object.prototype) return undefined;
  return inner as Record<string, unknown>;
}

function errorNode(
  input: unknown,
  includeStack: boolean,
): { node: SerializedLogError; next: unknown } {
  if (input === null || typeof input !== "object") {
    return { next: undefined, node: { message: String(input), name: "UnknownError" } };
  }
  const source = input as Record<string, unknown>;
  const cause = source.cause;
  const step: SerializedLogError = {
    message: typeof source.message === "string" ? source.message : String(input),
    name: typeof source.name === "string" ? source.name : "Error",
  };
  for (const slot of ["code", "type"] as const) {
    const candidate = source[slot];
    if (typeof candidate === "string" && candidate.length) step[slot] = candidate;
  }
  if (includeStack && typeof source.stack === "string") step.stack = source.stack;
  const inner = plainContext(source.context);
  if (inner !== undefined) step.context = inner;
  return { next: cause, node: step };
}

const DEPTH_LIMIT_NODE: SerializedLogError = {
  message: "Error cause chain exceeded the serialization depth limit.",
  name: "ErrorCauseDepthLimit",
};

const CIRCULAR_NODE: SerializedLogError = {
  message: "Error cause chain contained a circular reference.",
  name: "ErrorCauseCircularReference",
};

export function serializeLogError(
  error: unknown,
  includeStack: boolean,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): SerializedLogError {
  let source = error;
  let level = depth;
  let head: SerializedLogError | undefined;
  let last: SerializedLogError | undefined;
  for (;;) {
    let step: SerializedLogError;
    let cause: unknown;
    if (level > MAX_DEPTH) {
      step = DEPTH_LIMIT_NODE;
    } else if (source !== null && typeof source === "object" && seen.has(source)) {
      step = CIRCULAR_NODE;
    } else {
      if (source !== null && typeof source === "object") seen.add(source);
      ({ node: step, next: cause } = errorNode(source, includeStack));
    }
    if (last === undefined) head = step;
    else last.cause = step;
    if (cause === undefined) return head!;
    last = step;
    source = cause;
    level += 1;
  }
}
