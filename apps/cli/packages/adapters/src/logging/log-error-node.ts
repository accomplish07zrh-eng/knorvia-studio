// SPDX-License-Identifier: Apache-2.0
// 错误链序列化：把 cause 链拍平成 SerializedLogError 链，深度与环引用各有终态节点。
import type { SerializedLogError } from "./serialize.js";

const DEPTH_LIMIT = 8;

/** 只接受纯对象上下文（原型为 null 或 Object.prototype）。 */
function asPlainObject(candidate: unknown): Record<string, unknown> | undefined {
  if (candidate === null || typeof candidate !== "object") return undefined;
  const proto = Object.getPrototypeOf(candidate);
  if (proto !== null && proto !== Object.prototype) return undefined;
  return candidate as Record<string, unknown>;
}

/** 取字符串字段；空串也算有值（与旧的三元判定一致）。 */
function readString(record: Record<string, unknown>, key: string): string | undefined {
  const candidate = record[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function stackOf(record: Record<string, unknown>, includeStack: boolean): string | undefined {
  if (!includeStack) return undefined;
  return readString(record, "stack");
}

/** 一环的错误信息：name/message 有默认值，code/type/stack/context 按需带上。 */
function errorNode(
  input: unknown,
  includeStack: boolean,
): { node: SerializedLogError; next: unknown } {
  if (input === null || typeof input !== "object") {
    return { next: undefined, node: { message: String(input), name: "UnknownError" } };
  }
  const record = input as Record<string, unknown>;
  const node: SerializedLogError = {
    message: readString(record, "message") ?? String(input),
    name: readString(record, "name") ?? "Error",
  };
  for (const slot of ["code", "type"] as const) {
    const text = readString(record, slot);
    if (text !== undefined && text.length > 0) node[slot] = text;
  }
  const stack = stackOf(record, includeStack);
  if (stack !== undefined) node.stack = stack;
  const candidate = asPlainObject(record.context);
  if (candidate !== undefined) node.context = candidate;
  return { next: record.cause, node: node };
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
  record: unknown,
  index: number,
  seen: WeakSet<object>,
  includeStack: boolean,
): { cause: unknown; node: SerializedLogError } {
  if (index > DEPTH_LIMIT) return { cause: undefined, node: DEPTH_LIMIT_NODE };
  if (record !== null && typeof record === "object" && seen.has(record)) {
    return { cause: undefined, node: CIRCULAR_NODE };
  }
  if (record !== null && typeof record === "object") seen.add(record);
  const { node, next } = errorNode(record, includeStack);
  return { cause: next, node: node };
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
