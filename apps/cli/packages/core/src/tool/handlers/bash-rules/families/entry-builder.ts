// SPDX-License-Identifier: Apache-2.0
// 只读子命令条目的声明器：把「前缀 + 画像 + 可选危险性复核」收成一行，
// 多张画像/预设可用 compose 合并。条目数据只描述事实，判定逻辑在主链与遍历器。
import type { BashReadonlyCommandPolicy, SafeFlagValue } from "../policy-shapes.js";

export type ReadonlyEntry = readonly [string, BashReadonlyCommandPolicy];

export type DangerGuard = (subject: string, args: readonly string[]) => boolean;

export function compose(
  ...parts: Readonly<Record<string, SafeFlagValue>>[]
): Readonly<Record<string, SafeFlagValue>> {
  return Object.assign({}, ...parts);
}

export function queryEntry(
  prefix: string,
  image: Readonly<Record<string, SafeFlagValue>>,
  guard?: DangerGuard,
): ReadonlyEntry {
  const policy: BashReadonlyCommandPolicy = { safeFlags: image };
  if (guard) policy.additionalCommandIsDangerousCallback = guard;
  return [prefix, policy];
}
