import type { CompactBoundaryPayload, CompactPhase, CompactPreservedSegment, CompactReason, CompactTrigger as CompactTriggerValue, MessageId, ModelMessageContent, TraceContext } from "@knorvia/contracts";
export interface CompactModelMessage {
    role: string;
    content: ModelMessageContent;
    toolCalls?: readonly {
        name: string;
        input: unknown;
    }[];
}
export interface TokenUsageLike {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface BuildManualCompactBoundaryInput {
    autoCompactThreshold?: number;
    boundaryId: string;
    compactReason?: CompactReason;
    customInstructions?: string;
    keptMessageCount?: number;
    lastSummarizedMessageId?: MessageId;
    phase?: CompactPhase;
    postCompactTokenCount?: number;
    preservedSegment?: CompactPreservedSegment;
    preCompactTokenCount: number;
    summarizedMessageCount: number;
    summaryMessageId: MessageId;
    traceContext: TraceContext;
    trigger?: CompactTriggerValue;
    truePostCompactTokenCount?: number;
    willRetriggerNextTurn?: boolean;
}
export declare const MAX_COMPACT_PROMPT_TOO_LONG_RETRIES = 3;
export declare const COMPACT_PROMPT_TOO_LONG_RETRY_MARKER = "[earlier conversation truncated for compaction retry]";
export declare const COMPACT_PROMPT_TOO_LONG_USER_MESSAGE = "Conversation too long to compact automatically. Try /compact again after narrowing the active context.";
export declare function getMessagesToSummarize(messages: readonly CompactModelMessage[]): CompactModelMessage[];
export declare function hasEnoughMessagesToCompact(messages: readonly CompactModelMessage[]): boolean;
export declare function buildManualCompactBoundary(input: BuildManualCompactBoundaryInput): CompactBoundaryPayload;
export declare function estimateMessageTokens(messages: readonly CompactModelMessage[]): number;
export declare function getUsageTotalTokens(usage?: TokenUsageLike): number;
export declare function createCompactBoundaryId(randomUUID?: () => string): string;
