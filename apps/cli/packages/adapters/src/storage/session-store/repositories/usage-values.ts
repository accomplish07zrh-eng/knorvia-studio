// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 用量计数的归一：任何来源的 JSON 值都收敛成一个可以直接累加的非负整数。
//
// 这里刻意宽容：非数字、NaN、Infinity、负数、小数都各自收敛，从不抛错 ——
// 用量数据来自历史库与外部写入，坏值不该让整条读路径失败。小数向下取整，
// 避免累计出「半次调用」；结果落在 SQLite INTEGER 范围内。
// 纯函数：不读配置、不写日志，schema 校验与读路径可以复用。

/** 非数值与不可用数值的替代值。 */
const ZERO_COUNT = 0;

export function usageCount(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value);
  if (!numeric) return ZERO_COUNT;
  const floored = Math.trunc(value as number);
  return floored > ZERO_COUNT ? floored : ZERO_COUNT;
}
