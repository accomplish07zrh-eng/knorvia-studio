// SPDX-License-Identifier: Apache-2.0
// 旗标画像的紧凑声明器：把「纯开关旗标」与「带值旗标」分开声明，
// 合成遍历器可消费的画像表。开关串按空格分词，带值项用 [旗标, 取值语义] 对声明。
import type { SafeFlagValue } from "./policy-shapes.js";

export function flagChart(
  switches: string,
  valued: ReadonlyArray<readonly [string, SafeFlagValue]> = [],
): Readonly<Record<string, SafeFlagValue>> {
  const chart: Record<string, SafeFlagValue> = {};
  for (const flag of switches.split(" ")) {
    if (flag) chart[flag] = "none";
  }
  for (const [flag, kind] of valued) chart[flag] = kind;
  return chart;
}
