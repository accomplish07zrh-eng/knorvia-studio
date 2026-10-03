import type { TokenUsageInfo } from "@knorvia/contracts";
export interface PersistedTokenUsageBaseline {
    cacheReadTokens: number;
    cacheWriteTokens: number;
    contextUsageTokens?: number;
    inputTokens: number;
    outputTokens: number;
}
export declare function persistedTokenUsageBaseline(tokens: TokenUsageInfo | undefined): PersistedTokenUsageBaseline | undefined;
