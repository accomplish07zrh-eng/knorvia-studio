// SPDX-License-Identifier: Apache-2.0
// 错误链序列化：把 cause 链拍平成 SerializedLogError 链，深度与环引用各有终态节点。
import type { SerializedLogError } from "./serialize.js";

const MAX_DEPTH = 8;

/** 纯对象上下文才保留（原型为 null 或 Object.prototype）。 */
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

/** 展开一环：两种终态直接给常量节点，其余交给 errorNode。 */
function nextNode(
  source: unknown,
  level: number,
  seen: WeakSet<object>,
  includeStack: boolean,
): { cause: unknown; step: SerializedLogError } {
  if (level > MAX_DEPTH) return { cause: undefined, step: DEPTH_LIMIT_NODE };
  if (source !== null && typeof source === "object" && seen.has(source)) {
    return { cause: undefined, step: CIRCULAR_NODE };
  }
  if (source !== null && typeof source === "object") seen.add(source);
  const { node, next } = errorNode(source, includeStack);
  return { cause: next, step: node };
}

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
    const { cause, step } = nextNode(source, level, seen, includeStack);
    if (last === undefined) head = step;
    else last.cause = step;
    if (cause === undefined) return head!;
    last = step;
    source = cause;
    level += 1;
  }
}
