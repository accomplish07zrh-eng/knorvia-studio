// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { JsonSchema } from "../model/index.js";

export const TOOL_JSON_SCHEMA_VERSION = "https://json-schema.org/draft/2020-12/schema";
const REFERENCE_KEYS = ["$schema", "$id", "$ref", "$defs", "definitions"] as const;
const CHILD_KEYS = ["items", "additionalProperties", "oneOf", "anyOf", "allOf"] as const;

const record = (value: unknown): value is JsonSchema =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function literalType(values: unknown[]): string | undefined {
  const kinds = new Set<string>();
  let unsupported = false;
  // 内存 schema 可能是稀疏数组；既有 every 语义跳过空位，但不跳过显式 undefined。
  values.forEach((value) => {
    const kind = value === null ? "null" : typeof value;
    if (kind === "number") kinds.add(Number.isInteger(value) ? "integer" : "number");
    else if (kind === "string" || kind === "boolean" || kind === "null") kinds.add(kind);
    else unsupported = true;
  });
  if (unsupported || values.length === 0) return undefined;
  if (kinds.size === 0) return "string";
  if (kinds.has("number")) kinds.delete("integer");
  return kinds.size === 1 ? kinds.values().next().value : undefined;
}

function inferredType(schema: JsonSchema): string | undefined {
  if (record(schema.properties) || Array.isArray(schema.required)) return "object";
  if (schema.items !== undefined || [schema.minItems, schema.maxItems].some(isNumber))
    return "array";
  if (Array.isArray(schema.enum)) return literalType(schema.enum);
  if ("const" in schema) return literalType([schema.const]);
  if ([schema.minLength, schema.maxLength].some(isNumber)) return "string";
  if ([schema.minimum, schema.maximum].some(isNumber)) return "number";
  return undefined;
}

function isNumber(value: unknown): boolean {
  return typeof value === "number";
}

function completeShape(schema: JsonSchema): void {
  if (schema.type === undefined) {
    const inferred = inferredType(schema);
    if (inferred !== undefined) schema.type = inferred;
  }
  const types = new Set(Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (types.has("object") && !record(schema.properties)) {
    if (schema.additionalProperties === undefined) schema.properties = {};
    else if (record(schema.additionalProperties) && schema.propertyNames === undefined) {
      schema.propertyNames = { type: "string" };
    }
  }
  // 联合 type 的补全顺序也保留：旧公开 schema 先发 object 字段，再发 array 字段。
  if (types.has("array") && schema.items === undefined) schema.items = {};
}

function* normalizeNode(node: JsonSchema): Generator<unknown> {
  for (const key of REFERENCE_KEYS) delete node[key];
  if (record(node.properties)) {
    for (const child of Object.values(node.properties)) yield child;
  }
  for (const key of CHILD_KEYS) yield node[key];
  if (Array.isArray(node.anyOf) && node.oneOf === undefined) {
    node.oneOf = node.anyOf;
    delete node.anyOf;
  }
  completeShape(node);
}

export function normalizeToolJsonSchema(schema: JsonSchema): JsonSchema {
  // 显式保存每层迭代位置，保留旧深度优先次序；反向压入全部节点会改变跨角色别名的结果。
  // 按身份去重防止循环，生成器只产出下一条边，不互相递归，深层结构不再耗尽调用栈。
  const pending: Iterator<unknown>[] = [[schema].values()];
  const visited = new WeakSet<object>();
  while (pending.length) {
    const edge = pending[pending.length - 1]!.next();
    if (edge.done) {
      pending.pop();
      continue;
    }
    const current = edge.value;
    if (current === null || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    pending.push(Array.isArray(current) ? current.values() : normalizeNode(current as JsonSchema));
  }
  return schema;
}

export function toToolJsonSchema(schema: ZodTypeAny): JsonSchema {
  const generated = zodToJsonSchema(schema, {
    target: "jsonSchema7",
    effectStrategy: "input",
    $refStrategy: "none",
  }) as JsonSchema;
  const normalized = normalizeToolJsonSchema(generated);
  normalized.$schema = TOOL_JSON_SCHEMA_VERSION;
  return normalized;
}
