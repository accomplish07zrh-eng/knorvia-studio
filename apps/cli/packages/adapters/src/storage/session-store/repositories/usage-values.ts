// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 用量计数的归一：把任意 JSON 值收敛成非负整数。
//
// 约定一：非数字、NaN、Infinity 一律记 0，不做四舍五入也不抛错。
// 约定二：负数记 0；小数向下取整，避免累计出「半次调用」。
// 约定三：调用方拿到的永远是可直接累加的整数，不需要再做类型判断。
// 约定四：这里不区分「0」与「缺失」的语义差异，缺失去重由写入侧负责。
// 约定五：函数是纯函数，不读取配置也不写日志，便于在 schema 校验里复用。
// 约定六：返回值范围与 SQLite INTEGER 列一致，不会溢出。

export function usageCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}
