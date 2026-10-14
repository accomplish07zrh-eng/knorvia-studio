// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// compact 自动压缩策略的计算模块：窗口换算、输出预留、阈值与五分支决策都集中在这里。
// 公开面（冻结常量、兼容类型与四个导出函数）见 ./policy.js，本模块只接收已归一化的默认值。
import { DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY } from "@knorvia/shared";
import { estimateMessageTokens, hasEnoughMessagesToCompact } from "./manual.js";
import type { CompactModelMessage } from "./manual.js";
import type {
  AutoCompactDecision,
  AutoCompactPolicyConfig,
  AutoCompactTokenOverride,
  AutoCompactTokenSource,
} from "./policy.js";

/** 公开面在调用时传入的运行期默认值，是阈值与兜底次数的唯一来源。 */
export interface AutoCompactRuntimeDefaults {
  buffer: number;
  failureLimit: number;
  maxOutputReserve: number;
  percent: number;
  reserveCeiling: number;
  windowSize: number;
}

/** 决策里与分支无关的公共字段。 */
type DecisionBase = Omit<AutoCompactDecision, "shouldCompact" | "reason">;

/** 有效上下文窗口：窗口大小扣除输出预留，结果不小于 0。 */
export function effectiveContextWindowFor(
  config: AutoCompactPolicyConfig,
  defaults: AutoCompactRuntimeDefaults,
): number {
  const windowSize = floorIfUsable(config.contextWindow) ?? defaults.windowSize;
  const reserve = Math.min(outputReserveFor(config, defaults), windowSize);
  return Math.max(0, windowSize - reserve);
}

/** 输出预留：取配置的输出上限（缺省 32K），再压到上限 21K 以内。 */
export function outputReserveFor(
  config: AutoCompactPolicyConfig,
  defaults: AutoCompactRuntimeDefaults,
): number {
  const requested = floorIfUsable(config.maxOutputTokens) ?? defaults.maxOutputReserve;
  return Math.min(requested, defaults.reserveCeiling);
}

/** 自动压缩阈值：有效窗口扣除缓冲余量，结果不小于 0。 */
export function autoCompactThresholdFor(
  config: AutoCompactPolicyConfig,
  defaults: AutoCompactRuntimeDefaults,
): number {
  const buffer = floorIfUsable(config.bufferTokens) ?? defaults.buffer;
  return Math.max(0, effectiveContextWindowFor(config, defaults) - buffer);
}

/**
 * 五分支决策，判定顺序固定：禁用 → 消息不足 → 熔断 → 低于阈值 → 达到阈值。
 * 达到阈值即压缩（tokenCount >= threshold）；provider 用量只透传到决策字段，不参与判定。
 */
export function decideAutoCompact(
  config: AutoCompactPolicyConfig | undefined,
  messages: readonly CompactModelMessage[],
  consecutiveFailures: number | undefined,
  override: AutoCompactTokenOverride | undefined,
  defaults: AutoCompactRuntimeDefaults,
): AutoCompactDecision {
  const policy = config ?? {};
  const windowSize = floorIfUsable(policy.contextWindow) ?? defaults.windowSize;
  const effectiveWindow = effectiveContextWindowFor(policy, defaults);
  const reserve = Math.min(outputReserveFor(policy, defaults), windowSize);
  const threshold = autoCompactThresholdFor(policy, defaults);
  const estimated = estimateMessageTokens(messages);
  const tokenCount = override?.tokenCount ?? estimated;
  const decidedSource: AutoCompactTokenSource = override?.source ?? "estimate";
  const base = buildDecisionBase(
    windowSize,
    effectiveWindow,
    estimated,
    reserve,
    threshold,
    defaults.percent,
    tokenCount,
    decidedSource,
    floorIfUsable(policy.maxOutputTokens),
    override,
  );

  const switchedOff = policy.enabled === false;
  if (switchedOff) {
    return finishDecision(base, false, "disabled");
  }
  if (!hasEnoughMessagesToCompact(messages)) {
    return finishDecision(base, false, "not_enough_messages");
  }
  const failureLimit = floorIfUsable(policy.maxConsecutiveFailures) ?? defaults.failureLimit;
  if ((consecutiveFailures ?? 0) >= failureLimit) {
    return finishDecision(base, false, "circuit_breaker");
  }
  const underThreshold = tokenCount < threshold;
  if (underThreshold) {
    return finishDecision(base, false, "below_threshold");
  }
  return finishDecision(base, true, "above_threshold");
}

/** 公共字段逐项写入：字段顺序与旧实现的公共投影一致，避免序列化顺序变化。 */
function buildDecisionBase(
  windowSize: number,
  effectiveWindow: number,
  estimated: number,
  reserve: number,
  threshold: number,
  percent: number,
  tokenCount: number,
  tokenSource: AutoCompactTokenSource,
  maxOutputTokens: number | undefined,
  override: AutoCompactTokenOverride | undefined,
): DecisionBase {
  const base = {} as DecisionBase;
  base.contextWindow = windowSize;
  base.effectiveContextWindow = effectiveWindow;
  base.estimatedTokenCount = estimated;
  base.providerCacheReadTokens = override?.cacheReadTokens;
  base.providerCacheWriteTokens = override?.cacheWriteTokens;
  base.maxOutputTokens = maxOutputTokens;
  base.modelContextBudgetStrategy = DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY;
  base.outputReserveTokens = reserve;
  base.providerBaseTokenCount = override?.baseTokenCount;
  base.providerContextUsageTokenCount = override?.contextUsageTokenCount;
  base.providerIncrementalTokenCount = override?.incrementalTokenCount;
  base.providerOutputTokens = override?.outputTokens;
  base.threshold = threshold;
  base.thresholdPercent = percent;
  base.tokenCount = tokenCount;
  base.tokenSource = tokenSource;
  return base;
}

function finishDecision(
  base: DecisionBase,
  shouldCompact: boolean,
  reason: AutoCompactDecision["reason"],
): AutoCompactDecision {
  return { ...base, shouldCompact, reason };
}

/** 负数、非数与缺省一律视作「未配置」。 */
function floorIfUsable(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const usable = Number.isFinite(value) && value >= 0;
  return usable ? Math.floor(value) : undefined;
}
