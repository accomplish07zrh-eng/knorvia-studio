// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export function encodeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  // 既有返回声明不包含 undefined；根函数和 Symbol 仍保留原生编码结果。
  return JSON.stringify(value) as string;
}

export function decodeJson<T>(value: string | null): T | undefined {
  // 兼容声明之外的旧调用：所有假值都表示缺席；必需文档不经过此入口。
  if (!value) return undefined;
  return JSON.parse(value) as T;
}
