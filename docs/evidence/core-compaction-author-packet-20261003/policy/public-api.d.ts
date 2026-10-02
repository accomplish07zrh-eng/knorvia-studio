import type { CompactModelMessage } from "./manual.js";
import type { LocalMicrocompactPolicyConfig } from "./microcompact.js";
export declare const DEFAULT_COMPACT_CONTEXT_WINDOW = 200000;
export declare const DEFAULT_AUTOCOMPACT_OUTPUT_RESERVE_TOKENS = 32000;
export declare const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20000;
export declare const AUTOCOMPACT_BUFFER_TOKENS = 13000;
export declare const DEFAULT_AUTOCOMPACT_THRESHOLD_PERCENT = 100;
export declare const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;
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
    reason: "disabled" | "not_enough_messages" | "circuit_breaker" | "below_threshold" | "above_threshold";
}
export declare function getEffectiveContextWindowSize(config?: AutoCompactPolicyConfig): number;
export declare function getAutoCompactOutputReserveTokens(config?: AutoCompactPolicyConfig): number;
export declare function getAutoCompactThreshold(config?: AutoCompactPolicyConfig): number;
export declare function shouldAutoCompact(input: {
    messages: readonly CompactModelMessage[];
    config?: AutoCompactPolicyConfig;
    consecutiveFailures?: number;
    tokenOverride?: AutoCompactTokenOverride;
}): AutoCompactDecision;
