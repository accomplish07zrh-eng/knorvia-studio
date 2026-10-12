// SPDX-License-Identifier: Apache-2.0
// 错误链序列化：把 cause 链拍平成 SerializedLogError 链，深度与环引用各有终态节点。
import type { SerializedLogError } from "./serialize.js";

const DEPTH_LIMIT = 8;

/** 只接受纯对象上下文（原型为 null 或 Object.prototype）。 */
function asPlainObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) return undefined;
  return value as Record<string, unknown>;
}

/** 取字符串字段；空串也算有值（与旧的三元判定一致）。 */
function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const found = record[key];
  return typeof found === "string" ? found : undefined;
}

function stackField(record: Record<string, unknown>, withStack: boolean): string | undefined {
  if (!withStack) return undefined;
  return stringField(record, "stack");
}

/** 一环的错误信息：name/message 有默认值，code/type/stack/context 按需带上。 */
function describeError(
  input: unknown,
  includeStack: boolean,
): { node: SerializedLogError; next: unknown } {
  if (input === null || typeof input !== "object") {
    return { next: undefined, node: { message: String(input), name: "UnknownError" } };
  }
  const record = input as Record<string, unknown>;
  const node: SerializedLogError = {
    message: stringField(record, "message") ?? String(input),
    name: stringField(record, "name") ?? "Error",
  };
  for (const slot of ["code", "type"] as const) {
    const text = stringField(record, slot);
    if (text !== undefined && text.length > 0) node[slot] = text;
  }
  const stack = stackField(record, includeStack);
  if (stack !== undefined) node.stack = stack;
  const plain = asPlainObject(record.context);
  if (plain !== undefined) node.context = plain;
  return { next: record.cause, node };
}

/** 两种终态：深度超限与环引用，各自有固定的 name/message。 */
const TERMINAL_NODES: Record<"circular" | "depth", SerializedLogError> = {
  depth: {
    message: "Error cause chain exceeded the serialization depth limit.",
    name: "ErrorCauseDepthLimit",
  },
  circular: {
    message: "Error cause chain contained a circular reference.",
    name: "ErrorCauseCircularReference",
  },
};

/** 展开一环：两种终态查表，其余交给 describeError。 */
function nextNode(
  record: unknown,
  index: number,
  seen: WeakSet<object>,
  includeStack: boolean,
): { cause: unknown; node: SerializedLogError } {
  if (index > DEPTH_LIMIT) return { cause: undefined, node: TERMINAL_NODES.depth };
  const revisits = record !== null && typeof record === "object" && seen.has(record);
  if (revisits) return { cause: undefined, node: TERMINAL_NODES.circular };
  if (record !== null && typeof record === "object") seen.add(record);
  const { node, next } = describeError(record, includeStack);
  return { cause: next, node };
}

interface Chain {
  head?: SerializedLogError;
  last?: SerializedLogError;
}

/** 逐环拼接：head 只写一次，末节点的 cause 指向后一环。 */
function extend(chain: Chain, node: SerializedLogError): void {
  const previous = chain.last;
  if (previous === undefined) chain.head = node;
  else previous.cause = node;
}

/**
 * 序列化错误链：从 `error` 起沿 `cause` 走到底，深度超限或出现环时用终态节点收尾。
 * `seen` 与 `depth` 允许调用方跨多次调用复用，因此默认值只在最外层生效。
 */
export function serializeLogError(
  error: unknown,
  includeStack: boolean,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): SerializedLogError {
  const chain: Chain = {};
  let record = error;
  let index = depth;
  while (true) {
    const { cause, node } = nextNode(record, index, seen, includeStack);
    extend(chain, node);
    if (cause === undefined) break;
    chain.last = node;
    record = cause;
    index += 1;
  }
  return chain.head!;
}
