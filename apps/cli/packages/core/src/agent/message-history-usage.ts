// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 持久化 token 用量基线：把 provider 的用量信息归一成可落盘的五个字段。
import type { TokenUsageInfo } from "@knorvia/contracts";

export interface PersistedTokenUsageBaseline {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  contextUsageTokens?: number;
  inputTokens: number;
  outputTokens: number;
}

/** 统一取整：非有限值视作未提供。 */
const truncated = (value: number | undefined): number | undefined =>
  value === undefined || !Number.isFinite(value) ? undefined : Math.floor(value);

/** 只在正整数时有意义（input / total / output 用）。 */
const positiveOnly = (value: number | undefined): number | undefined => {
  const integer = truncated(value);
  return integer !== undefined && integer > 0 ? integer : undefined;
};

/** 允许 0（缓存读写用）。 */
const nonnegativeOnly = (value: number | undefined): number | undefined => {
  const integer = truncated(value);
  return integer !== undefined && integer >= 0 ? integer : undefined;
};

/** 输入 token 三级回落：显式 input → total 减 output → 缓存读写之和。 */
function resolveInputTokens(usage: TokenUsageInfo): number | undefined {
  const declared = positiveOnly(usage.input);
  if (declared !== undefined) return declared;

  const total = positiveOnly(usage.total);
  if (total !== undefined) {
    return Math.max(0, total - (nonnegativeOnly(usage.output) ?? 0));
  }

  const cached =
    (nonnegativeOnly(usage.cache.read) ?? 0) + (nonnegativeOnly(usage.cache.write) ?? 0);
  return cached > 0 ? cached : undefined;
}

/** 上下文占用只在能解释成「输入 + 输出」，或 total 不小于输入时才给出。 */
function resolveContextUsage(
  inputTokens: number,
  outputTokens: number,
  total: number | undefined,
): number | undefined {
  if (outputTokens > 0) return inputTokens + outputTokens;
  if (total !== undefined && total >= inputTokens) return total;
  return undefined;
}

/** 输入用量无法确认（缺失或非正）时不产出基线，调用方据此跳过落盘。 */
export const persistedTokenUsageBaseline = (
  usage: TokenUsageInfo | undefined,
): PersistedTokenUsageBaseline | undefined => {
  if (!usage) return undefined;

  const inputTokens = resolveInputTokens(usage);
  const usableInput = inputTokens !== undefined && inputTokens > 0;
  if (!usableInput) return undefined;

  const outputTokens = positiveOnly(usage.output) ?? 0;
  const baseline = {} as PersistedTokenUsageBaseline;
  baseline.cacheReadTokens = nonnegativeOnly(usage.cache.read) ?? 0;
  baseline.cacheWriteTokens = nonnegativeOnly(usage.cache.write) ?? 0;
  const total = positiveOnly(usage.total);
  baseline.contextUsageTokens = resolveContextUsage(inputTokens, outputTokens, total);
  baseline.inputTokens = inputTokens;
  baseline.outputTokens = outputTokens;
  return baseline;
};
