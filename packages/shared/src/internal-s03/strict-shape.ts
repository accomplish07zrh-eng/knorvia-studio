// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";

/** strict 对象：协议面多出来的字段直接拒绝。 */
export function strictFields<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object(shape).strict();
}

export const nonEmptyText = z.string().min(1);

export function clippedText(maxChars: number) {
  return z.string().max(maxChars);
}

export const yesNo = z.boolean();

/** 协议枚举写成逗号分隔的名单，顺序即线上取值顺序。 */
export function enumFromCsv<T extends string>(csv: string) {
  const values = csv.split(",") as [T, ...T[]];
  return z.enum(values);
}
