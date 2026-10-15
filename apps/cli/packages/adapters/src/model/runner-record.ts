// SPDX-License-Identifier: Apache-2.0
// 记录字段读取小工具：调试记录与错误链上的字段一律「类型不符即视为缺失」，
// 不做隐式转换；数字版本额外要求有限数（NaN/Infinity 一律丢弃）。

function asString(candidate: unknown): string | undefined {
  return typeof candidate === "string" ? candidate : undefined;
}

function asFiniteNumber(candidate: unknown): number | undefined {
  if (typeof candidate !== "number") return undefined;
  return Number.isFinite(candidate) ? candidate : undefined;
}

export function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return candidate !== null && typeof candidate === "object";
}

export function asRecord(candidate: unknown): Record<string, unknown> {
  return isRecord(candidate) ? candidate : {};
}

export function stringProperty(source: Record<string, unknown>, field: string): string | undefined {
  return asString(source[field]);
}

export function numberProperty(
  source: Record<string, unknown> | undefined,
  field: string,
): number | undefined {
  return asFiniteNumber(source?.[field]);
}

export function stringMetadata(value: unknown): string | undefined {
  return asString(value);
}
