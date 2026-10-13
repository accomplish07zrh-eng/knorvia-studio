// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// compact 自动压缩策略的公开面：冻结的阈值常量、兼容类型与四个导出函数。窗口与阈值的计算都在
// ./policy-internal.js；本模块只负责把公开默认值注入进去。
import type { CompactModelMessage } from "./manual.js";
import type { LocalMicrocompactPolicyConfig } from "./microcompact.js";
import {
  autoCompactThresholdFor,
  decideAutoCompact,
  effectiveContextWindowFor,
  outputReserveFor,
  type AutoCompactRuntimeDefaults,
} from "./policy-internal.js";

export const DEFAULT_COMPACT_CONTEXT_WINDOW = 200000;
export const DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = 32000;
export const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20000;
export const AUTOCOMPACT_BUFFER_TOKENS = 13000;
export const DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT = 100;
export const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;

export interface AutoCompactPolicyConfig {
  enabled?: boolean;
  contextWindow?: number;
  maxOutputTokens?: number;
  modelContextBudgetStrategy?: "legacy" | "preflight-v1";
  summaryReserveTokens?: number;
  bufferTokens?: number;
  thresholdPercentOverride?: number;
  maxConsecutiveFailures?: number;
  microcompact?: LocalMicrocompactPolicyConfig;
}

export type AutoCompactTokenSource = "estimate" | "provider_usage";

export interface AutoCompactTokenOverride {
  baseTokenCount?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  contextUsageTokenCount?: number;
  incrementalTokenCount?: number;
  outputTokens?: number;
  source: Extract<AutoCompactTokenSource, "provider_usage">;
  tokenCount: number;
}

export interface AutoCompactDecision {
  shouldCompact: boolean;
  tokenCount: number;
  tokenSource: AutoCompactTokenSource;
  estimatedTokenCount: number;
  providerCacheReadTokens?: number;
  providerCacheWriteTokens?: number;
  providerBaseTokenCount?: number;
  providerContextUsageTokenCount?: number;
  providerIncrementalTokenCount?: number;
  providerOutputTokens?: number;
  threshold: number;
  contextWindow: number;
  effectiveContextWindow: number;
  maxOutputTokens?: number;
  modelContextBudgetStrategy: "legacy" | "preflight-v1";
  outputReserveTokens: number;
  thresholdPercent: number;
  reason:
    | "disabled"
    | "not_enough_messages"
    | "circuit_breaker"
    | "below_threshold"
    | "above_threshold";
}

/** 输出预留的上限：provider 的窗口由输入输出共享，这里最多只让出 21K。 */
const OUTPUT_RESERVE_CAP_TOKENS = 21000;

const PUBLIC_POLICY_DEFAULTS: AutoCompactRuntimeDefaults = {
  buffer: AUTOCOMPACT_BUFFER_TOKENS,
  failureLimit: MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES,
  maxOutputReserve: DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS,
  percent: DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT,
  reserveCeiling: OUTPUT_RESERVE_CAP_TOKENS,
  windowSize: DEFAULT_COMPACT_CONTEXT_WINDOW,
};

/** 有效上下文窗口 = 窗口大小 − 输出预留，结果不小于 0。 */
export function getEffectiveContextWindowSize(config: AutoCompactPolicyConfig = {}): number {
  return effectiveContextWindowFor(config, PUBLIC_POLICY_DEFAULTS);
}

/** 输出预留 = 配置的输出上限（缺省 32K），再压到 21K 以内。 */
export function getAutoCompactOutputReserveTokens(config: AutoCompactPolicyConfig = {}): number {
  return outputReserveFor(config, PUBLIC_POLICY_DEFAULTS);
}

/** 自动压缩阈值 = 有效上下文窗口 − 缓冲余量（缺省 13K），结果不小于 0。 */
export function getAutoCompactThreshold(config: AutoCompactPolicyConfig = {}): number {
  return autoCompactThresholdFor(config, PUBLIC_POLICY_DEFAULTS);
}

/** 五分支决策：禁用 → 消息不足 → 熔断 → 低于阈值 → 达到阈值即压缩。 */
export function shouldAutoCompact(input: {
  messages: readonly CompactModelMessage[]; // 参与轮次分组与 token 估算的消息
  config?: AutoCompactPolicyConfig; // 策略覆盖：窗口、输出预留、缓冲余量与熔断次数
  consecutiveFailures?: number; // 已连续失败的压缩次数，达到上限即熔断
  tokenOverride?: AutoCompactTokenOverride; // provider 用量覆盖，只影响决策字段
}): AutoCompactDecision {
  return decideAutoCompact(
    input.config,
    input.messages,
    input.consecutiveFailures,
    input.tokenOverride,
    PUBLIC_POLICY_DEFAULTS,
  );
}
