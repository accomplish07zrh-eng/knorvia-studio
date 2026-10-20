// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话库里 JSON 文本列的进出转换。
//
// 写出去的时候，「没有值」统一落成 SQL NULL —— 列类型是 TEXT，塞不进 undefined。
// 读回来的时候，NULL 与空串都还原成「没有值」；空串是历史版本留下的形态，必须照样认。
//
// 两条不能破的边界：
// 1. 只有 undefined 与 null 算「没有值」，0、false、空字符串都是有意义的 JSON 值；
// 2. 读入口放过假值，所以必需文档不走这里 —— 它们的合法性由各自的 schema 判定。

/** 列类型允许的写出形态：文本，或表示「没有值」的 NULL。 */
type ColumnText = string | null;

/** 该值在列里是否等价于「没有值」。 */
function isAbsent(candidate: unknown): boolean {
  return candidate === undefined || candidate === null;
}

/** 写出方向：给定任意值，产出要落进 TEXT 列的内容（「没有值」时为 NULL）。 */
export function encodeJson(payload: unknown): ColumnText {
  if (isAbsent(payload)) return null;
  // stringify 对函数与 Symbol 返回 undefined，这类值不该落进 TEXT 列。
  return JSON.stringify(payload) as string;
}

/** 读入方向：给定列内容，产出反序列化后的值（「没有值」时为 undefined）。 */
export function decodeJson<T>(stored: ColumnText): T | undefined {
  // 旧库里这一列可能是 NULL、空串，甚至真的少给（未类型化的旧数据）——三者都按「没有值」处理。
  // 解析交给 JSON 自己抛错，不在这一层吞。
  if (!stored) return undefined;
  return JSON.parse(stored) as T;
}
