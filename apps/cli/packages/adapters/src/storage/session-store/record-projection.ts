// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 从一行 JSON 记录里做字段投影：剔除若干键、追加若干键，其余键连同顺序一起保留。
// 顺序敏感是有原因的 —— 投影结果会被整体写回或比对摘要，键序变化会产生假 diff。
//
// 一个必须守住的细节：`__proto__` 必须当作**普通数据键**处理。
// 用 `obj[key] = value` 赋值会触发原型 setter，把该键悄悄丢掉；所以这里走
// `Object.fromEntries`，它对 `__proto__` 是定义属性而非赋值。

/** 普通对象判定：数组与 null 都不算记录。 */
export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  const isObject = value !== null && typeof value === "object";
  return isObject && !Array.isArray(value);
}

/**
 * 投影：先按 removed 剔除键，再按 fields 追加。
 * 保留键维持原有相对顺序，新键按 fields 的键序追加在后面。
 */
export function projectRecord(
  source: Record<string, unknown>,
  removed: readonly string[] = [],
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  const kept: [string, unknown][] = [];
  for (const [key, value] of Object.entries(source)) {
    if (!removed.includes(key)) kept.push([key, value]);
  }
  // fromEntries 用定义属性写入，`__proto__` 才能作为普通键保留下来。
  return Object.fromEntries([...kept, ...Object.entries(fields)]);
}
