// SPDX-License-Identifier: Apache-2.0
// Knorvia value comparison and representation utilities for workflow schema validation.

// 递归判定两项 JSON 数据在内容上是否严格相等。
export function isEqualJson(first: unknown, second: unknown): boolean {
  if (Object.is(first, second)) return true;
  if (!first || !second || typeof first !== "object" || typeof second !== "object") {
    return false;
  }
  const aIsArr = Array.isArray(first);
  const bIsArr = Array.isArray(second);
  if (aIsArr !== bIsArr) return false;
  if (aIsArr) {
    const listA = first as unknown[];
    const listB = second as unknown[];
    return listA.length === listB.length && listA.every((v, i) => isEqualJson(v, listB[i]));
  }
  const dictA = first as Record<string, unknown>;
  const dictB = second as Record<string, unknown>;
  const keysA = Object.keys(dictA);
  const keysB = Object.keys(dictB);
  return (
    keysA.length === keysB.length &&
    keysA.every(
      (k) => Object.prototype.hasOwnProperty.call(dictB, k) && isEqualJson(dictA[k], dictB[k]),
    )
  );
}

// 将任意被校验值格式化为简短的描述文本，供违规报告展示。
export function formatSummary(val: unknown): string {
  if (val === null) return "null";
  if (Array.isArray(val)) return `array(${val.length})`;
  const typeStr = typeof val;
  if (typeStr === "string") {
    const s = val as string;
    const preview = s.length > 20 ? `${s.slice(0, 20)}…` : s;
    return `string ${JSON.stringify(preview)}`;
  }
  if (typeStr === "number" || typeStr === "boolean") return `${typeStr} ${val}`;
  if (typeStr === "object" || typeStr === "undefined") return typeStr;
  return typeStr;
}
