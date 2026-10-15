// SPDX-License-Identifier: Apache-2.0
// 覆盖型 schema 派生：每个字段保持原 schema，只补缺省/null（B13）。
import type { z } from "zod";

/** 嵌套结构由调用方显式派生；这里只做单层字段的 nullable().optional() 包装。 */
export function sparseShape<T extends Record<string, z.ZodType>>(sourceShape: T) {
  const derivedEntries = Object.entries(sourceShape).map(([fieldName, fieldSchema]) => [
    fieldName,
    fieldSchema.nullable().optional(),
  ]);
  return Object.fromEntries(derivedEntries) as {
    [K in keyof T]: z.ZodOptional<z.ZodNullable<T[K]>>;
  };
}
