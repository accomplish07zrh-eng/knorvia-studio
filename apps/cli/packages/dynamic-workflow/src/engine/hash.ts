// SPDX-License-Identifier: Apache-2.0
// Knorvia 动态工作流确定性散列与规范化 JSON 序列化。

const FNV_PRIME = 0x01000193;
const FNV_OFFSET_BASIS = 0x811c9dc5;

function serializeInternal(target: unknown): string {
  switch (typeof target) {
    case "bigint":
      throw new TypeError("BigInt cannot be serialized to JSON");
    case "string":
    case "number":
    case "boolean":
      return JSON.stringify(target);
    case "object": {
      if (!target) return "null";
      if (Array.isArray(target)) {
        return `[${target.map((item) => serializeInternal(item)).join(",")}]`;
      }
      const record = target as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const fragments: string[] = [];
      for (const k of keys) {
        const v = record[k];
        if (v !== undefined) {
          fragments.push(JSON.stringify(k) + ":" + serializeInternal(v));
        }
      }
      return "{" + fragments.join(",") + "}";
    }
    default:
      return "null";
  }
}

export function canonicalJson(value: unknown): string {
  return serializeInternal(value);
}

export function fnv1a(input: string): string {
  let acc = FNV_OFFSET_BASIS;
  for (let cursor = 0; cursor < input.length; cursor++) {
    const charVal = input.charCodeAt(cursor);
    acc = Math.imul(acc ^ (charVal & 0xff) ^ ((charVal >>> 8) & 0xff), FNV_PRIME);
  }
  return (acc >>> 0).toString(16).padStart(8, "0");
}

export function inputHash(value: unknown): string {
  const normalized = canonicalJson(value);
  return fnv1a(normalized);
}
