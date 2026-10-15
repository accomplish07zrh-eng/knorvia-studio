// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// JSON 列的编解码：写入方向把「缺席」统一成 NULL，读取方向把「缺席」还原成 undefined。
//
// 约定一：只有 undefined 与 null 视为缺席；0、false、"" 都是有效 JSON 值。
// 约定二：编码结果不包含 undefined（列类型是 TEXT/NULL），因此根标量与 Symbol
//         仍走原生 JSON.stringify，由调用方按列语义决定是否接受。
// 约定三：解码入口的入参可能是旧库里的空串，因此凡假值一律按缺席处理；
//         必需文档不会经过这里，它们的校验由各自的 schema 负责。

export function encodeJson(value: unknown): string | null {
  const absent = value === undefined || value === null;
  if (absent) return null;
  return JSON.stringify(value) as string;
}

export function decodeJson<T>(value: string | null): T | undefined {
  const present = Boolean(value);
  if (!present) return undefined;
  return JSON.parse(value as string) as T;
}
