import { MicrocompactTrigger, type MicrocompactBoundaryPayload } from "@knorvia/contracts";
import type { CompactModelMessage } from "./manual.js";
export declare const MICROCOMPACT_CLEARED_TOOL_RESULT_PREFIX = "[Old tool result content cleared]";
export declare const MICROCOMPACT_CLEARED_TOOL_RESULT_MESSAGE = "[Old tool result content cleared]";
export declare const DEFAULT_MICROCOMPACT_KEEP_RECENT_TOOL_RESULTS = 5;
export declare const DEFAULT_MICROCOMPACT_MIN_TOKEN_SAVINGS = 256;
export declare const DEFAULT_MICROCOMPACT_THRESHOLD_RATIO = 0.9;
export declare const DEFAULT_MICROCOMPACT_THRESHOLD_BUFFER_TOKENS = 2000;
export declare const DEFAULT_MICROCOMPACT_COMPACTABLE_TOOLS: readonly ["Read", "Bash", "Grep", "Glob", "WebFetch", "WebSearch", "Edit", "Write", "ApplyPatch"];
export interface LocalMicrocompactPolicyConfig {
    enabled?: boolean;
    thresholdTokens?: number;
    idleThresholdMinutes?: number;
    keepRecentToolResults?: number;
    compactableToolNames?: readonly string[];
    clearErrorResults?: boolean;
    minTokenSavings?: number;
}
export interface LocalMicrocompactMessage extends CompactModelMessage {
    isError?: boolean;
    toolCalls?: Array<{
        id: string;
        input: unknown;
        name: string;
    }>;
    toolCallId?: string;
    toolName?: string;
}
export type LocalMicrocompactBoundaryPayload = Omit<MicrocompactBoundaryPayload, "traceId" | "turnId">;
export interface LocalMicrocompactDecision {
    estimatedTokenCount: number;
    reason: "disabled" | "not_triggered" | "no_candidates" | "nothing_to_clear" | "below_min_savings" | "applied";
    thresholdTokens?: number;
    trigger?: MicrocompactTrigger;
}
export interface LocalMicrocompactResult<T extends LocalMicrocompactMessage> {
    decision: LocalMicrocompactDecision;
    messages: T[];
    payload?: LocalMicrocompactBoundaryPayload;
}
export declare function buildDefaultMicrocompactThreshold(autoCompactThreshold: number): number;
export declare function maybeLocalMicrocompactMessages<T extends LocalMicrocompactMessage>(input: {
    config?: LocalMicrocompactPolicyConfig;
    lastAssistantCompletedAtMs?: number;
    messages: readonly T[];
    nowMs?: number;
}): LocalMicrocompactResult<T>;
