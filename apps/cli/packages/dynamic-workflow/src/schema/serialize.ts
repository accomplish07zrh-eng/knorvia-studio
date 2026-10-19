// SPDX-License-Identifier: Apache-2.0
// Knorvia dynamic-workflow deterministic schema serializer.
// Produces stable, normalized JSON text by recursively ordering object keys.

import type { JsonSchema } from "./types.js";

// 深度排布对象字段，保持数组元素与叶子节点顺序。
function sortSchemaNode(val: unknown): unknown {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((elem) => sortSchemaNode(elem));
  }
  const source = val as Record<string, unknown>;
  const sortedTarget: Record<string, unknown> = {};
  const sortedPropNames = Object.keys(source).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const prop of sortedPropNames) {
    sortedTarget[prop] = sortSchemaNode(source[prop]);
  }
  return sortedTarget;
}

// 序列化 JSON Schema 为具有确定性键序与 2 空格缩进的文本，末尾附带单个换行。
export function serializeSchema(schema: JsonSchema): string {
  const normalized = sortSchemaNode(schema);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
