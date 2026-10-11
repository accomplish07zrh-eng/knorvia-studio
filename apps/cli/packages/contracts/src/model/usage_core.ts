// SPDX-License-Identifier: Apache-2.0
// 用量汇总：token 计数读取、可用性判定与事件序列汇总。
// 组织方式：整数校验统一走带下界的 boundedInteger；「有没有用量」与「逐字段累加」都走字段表。
// 本文件由 model/index.ts 的运行时声明拆出；模型面类型仍从 ./index.js 导出。

import type { ModelUsage, ModelUsageSummary } from "./index.js";

/** 取整并做下界检查：非有限数与越界值一律 undefined。 */
function boundedInteger(value: number | undefined, lowerBound: number): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const truncated = Math.floor(value);
  return truncated >= lowerBound ? truncated : undefined;
}

/** 正整数（下界 1）；0 与负数视为「没报」。 */
export function positiveInteger(value: number | undefined): number | undefined {
  return boundedInteger(value, 1);
}

/** 非负整数（下界 0）。 */
export function nonNegativeInteger(value: number | undefined): number | undefined {
  return boundedInteger(value, 0);
}

/** 单次用量的总 token：优先用 provider 报的总数，否则按输入 + 输出现算。 */
export function getModelUsageTotalTokens(usage?: ModelUsage): number {
  if (usage === undefined) return 0;
  const cacheTokens = (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  const inputTokens = usage.inputTokens ?? cacheTokens;
  return usage.totalTokens ?? inputTokens + (usage.outputTokens ?? 0);
}

/**
 * 进入上下文窗口的输入 token。
 *
 * AI SDK v6 的 Anthropic `inputTokens` 已经是「普通输入 + cache read/write」的 total input，
 * 再叠一次 cacheReadTokens 会把 context meter 与 compact 阈值放大一截，所以先信它。
 */
export function getModelUsageInputWindowTokens(usage?: ModelUsage): number | undefined {
  if (usage === undefined) return undefined;

  const declaredInput = positiveInteger(usage.inputTokens);
  if (declaredInput !== undefined) return declaredInput;

  const declaredTotal = positiveInteger(usage.totalTokens);
  if (declaredTotal !== undefined) {
    const outputTokens = nonNegativeInteger(usage.outputTokens) ?? 0;
    const inputOnly = declaredTotal - outputTokens;
    return inputOnly > 0 ? inputOnly : 0;
  }

  const cacheTokens =
    (nonNegativeInteger(usage.cacheReadTokens) ?? 0) +
    (nonNegativeInteger(usage.cacheWriteTokens) ?? 0);
  return cacheTokens > 0 ? cacheTokens : undefined;
}

/** 上下文用量：输入窗口 + 输出；两者都没有时才回落到总数。 */
export function getModelUsageContextTokens(usage?: ModelUsage): number | undefined {
  if (usage === undefined) return undefined;

  const inputWindow = getModelUsageInputWindowTokens(usage);
  const outputTokens = nonNegativeInteger(usage.outputTokens) ?? 0;
  const windowTokens = (inputWindow ?? 0) + outputTokens;
  if (windowTokens > 0) return windowTokens;

  return positiveInteger(usage.totalTokens);
}

/** 「这条用量里有真东西」的探针表：任一字段有值即算有。 */
const USAGE_PRESENCE_PROBES: ReadonlyArray<(usage: ModelUsage) => boolean> = [
  (usage) => usage.inputTokens !== undefined,
  (usage) => usage.outputTokens !== undefined,
  (usage) => usage.totalTokens !== undefined,
  (usage) => usage.cacheReadTokens !== undefined,
  (usage) => usage.cacheWriteTokens !== undefined,
  (usage) => usage.reasoningTokens !== undefined,
  (usage) => usage.serverToolUse?.webSearchRequests !== undefined,
  (usage) => usage.serverToolUse?.webFetchRequests !== undefined,
];

export function hasModelUsage(usage?: ModelUsage): boolean {
  if (usage === undefined) return false;
  return USAGE_PRESENCE_PROBES.some((probe) => probe(usage));
}

/** 汇总里逐字段累加的计数器名。 */
type UsageSummaryCounter =
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
  | "cacheReadTokens"
  | "cacheWriteTokens"
  | "reasoningTokens"
  | "webFetchRequests"
  | "webSearchRequests";

/** 计数器 → 从单次用量取值的方式；顺序即累加顺序。 */
const USAGE_SUMMARY_ACCUMULATORS: ReadonlyArray<
  readonly [UsageSummaryCounter, (usage: ModelUsage) => number]
> = [
  ["inputTokens", (usage) => usage.inputTokens ?? 0],
  ["outputTokens", (usage) => usage.outputTokens ?? 0],
  ["totalTokens", (usage) => getModelUsageTotalTokens(usage)],
  ["cacheReadTokens", (usage) => usage.cacheReadTokens ?? 0],
  ["cacheWriteTokens", (usage) => usage.cacheWriteTokens ?? 0],
  ["reasoningTokens", (usage) => usage.reasoningTokens ?? 0],
  ["webFetchRequests", (usage) => usage.serverToolUse?.webFetchRequests ?? 0],
  ["webSearchRequests", (usage) => usage.serverToolUse?.webSearchRequests ?? 0],
];

/** 汇总来源固定为 provider：本模块只汇总 provider 报回的用量，不做推断。 */
const USAGE_SUMMARY_SOURCE = "provider";

/** 全零汇总；计数器列表与累加表同源，新增计数只改一处。 */
function emptyUsageSummary(): ModelUsageSummary {
  const summary = { source: USAGE_SUMMARY_SOURCE, modelRequestCount: 0 } as ModelUsageSummary;
  for (const [counter] of USAGE_SUMMARY_ACCUMULATORS) summary[counter] = 0;
  return summary;
}

/** 把若干次用量汇成一份摘要；一次真用量都没有时返回 undefined。 */
export function createModelUsageSummary(
  usages: readonly ModelUsage[],
): ModelUsageSummary | undefined {
  const realUsages = usages.filter(hasModelUsage);
  if (realUsages.length === 0) return undefined;

  const summary = emptyUsageSummary();
  for (const usage of realUsages) {
    // 每次真用量都算一次模型请求；计数与各 token 字段在同一趟循环里累加。
    summary.modelRequestCount += 1;
    for (const [counter, read] of USAGE_SUMMARY_ACCUMULATORS) summary[counter] += read(usage);
  }
  return summary;
}
