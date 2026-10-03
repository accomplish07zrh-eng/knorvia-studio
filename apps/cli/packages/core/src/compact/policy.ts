import { DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY } from "@knorvia/shared";
import {
  estimateMessageTokens,
  hasEnoughMessagesToCompact,
  type CompactModelMessage,
} from "./manual.js";
import type { LocalMicrocompactPolicyConfig } from "./microcompact.js";

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

function normalizeNonnegativeInteger(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

export function getEffectiveContextWindowSize(config: AutoCompactPolicyConfig = {}): number {
  const contextWindow =
    normalizeNonnegativeInteger(config.contextWindow) ?? DEFAULT_COMPACT_CONTEXT_WINDOW;
  const reserve = Math.min(getAutoCompactOutputReserveTokens(config), contextWindow);
  return Math.max(0, contextWindow - reserve);
}

export function getAutoCompactOutputReserveTokens(config: AutoCompactPolicyConfig = {}): number {
  const maxOutputTokens =
    normalizeNonnegativeInteger(config.maxOutputTokens) ??
    DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS;
  return Math.min(maxOutputTokens, 21000);
}

export function getAutoCompactThreshold(config: AutoCompactPolicyConfig = {}): number {
  const effectiveContextWindow = getEffectiveContextWindowSize(config);
  const bufferTokens =
    normalizeNonnegativeInteger(config.bufferTokens) ?? AUTOCOMPACT_BUFFER_TOKENS;
  return Math.max(0, effectiveContextWindow - bufferTokens);
}

export function shouldAutoCompact(input: {
  messages: readonly CompactModelMessage[];
  config?: AutoCompactPolicyConfig;
  consecutiveFailures?: number;
  tokenOverride?: AutoCompactTokenOverride;
}): AutoCompactDecision {
  const config = input.config ?? {};
  const contextWindow =
    normalizeNonnegativeInteger(config.contextWindow) ?? DEFAULT_COMPACT_CONTEXT_WINDOW;
  const effectiveContextWindow = getEffectiveContextWindowSize(config);
  const outputReserveTokens = Math.min(getAutoCompactOutputReserveTokens(config), contextWindow);
  const threshold = getAutoCompactThreshold(config);
  const thresholdPercent = DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT;
  const estimatedTokenCount = estimateMessageTokens(input.messages);
  const tokenCount = input.tokenOverride?.tokenCount ?? estimatedTokenCount;
  const tokenSource = input.tokenOverride?.source ?? "estimate";

  // 对象属性会把来源字面量拓宽为 string；用公开决策字段契约约束五个分支的共同投影。
  const common: Omit<AutoCompactDecision, "shouldCompact" | "reason"> = {
    contextWindow,
    effectiveContextWindow,
    estimatedTokenCount,
    providerCacheReadTokens: input.tokenOverride?.cacheReadTokens,
    providerCacheWriteTokens: input.tokenOverride?.cacheWriteTokens,
    maxOutputTokens: normalizeNonnegativeInteger(config.maxOutputTokens),
    modelContextBudgetStrategy: DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY,
    outputReserveTokens,
    providerBaseTokenCount: input.tokenOverride?.baseTokenCount,
    providerContextUsageTokenCount: input.tokenOverride?.contextUsageTokenCount,
    providerIncrementalTokenCount: input.tokenOverride?.incrementalTokenCount,
    providerOutputTokens: input.tokenOverride?.outputTokens,
    threshold,
    thresholdPercent,
    tokenCount,
    tokenSource,
  };

  if (config.enabled === false) {
    return { ...common, shouldCompact: false, reason: "disabled" };
  }
  if (!hasEnoughMessagesToCompact(input.messages)) {
    return { ...common, shouldCompact: false, reason: "not_enough_messages" };
  }
  const maximumFailures =
    normalizeNonnegativeInteger(config.maxConsecutiveFailures) ??
    MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES;
  if ((input.consecutiveFailures ?? 0) >= maximumFailures) {
    return { ...common, shouldCompact: false, reason: "circuit_breaker" };
  }
  if (tokenCount < threshold) {
    return { ...common, shouldCompact: false, reason: "below_threshold" };
  }
  return { ...common, shouldCompact: true, reason: "above_threshold" };
}
