import type { ModelUsage } from "../deps.js";
export declare function readRawFinishReason(providerMetadata: Record<string, unknown> | undefined): string | undefined;
export declare function isContextExceededFinishReason(finishReason: string | undefined, rawFinishReason: string | undefined): boolean;
export declare function createModelContextExceededFinishError(input: {
    finishReason: string | undefined;
    rawFinishReason: string | undefined;
}): any;
export declare function createCompactRapidRefillError(input: {
    consecutiveRapidRefills: number;
    maxConsecutiveRapidRefills: number;
    toolTurnThreshold: number;
    toolTurnsSinceCompact: number;
}): any;
export declare function isSuspiciousEmptyModelResult(finishReason: string | undefined, responseLength: number, toolCallCount: number, usage?: ModelUsage): boolean;
export declare function buildSuspiciousEmptyDiagnostics(input: {
    finishReason: string | undefined;
    providerMetadata: Record<string, unknown> | undefined;
    rawFinishReason: string | undefined;
    outboundHeaderKeys?: string[];
}): Record<string, unknown>;
export declare function finalizeSuspiciousEmptyModelResult(input: {
    finishReason: string | undefined;
    model: {
        modelId: string;
        providerId: string;
    };
    providerMetadata: Record<string, unknown> | undefined;
    rawFinishReason: string | undefined;
}): void;
export declare function normalizeStreamError(error: unknown): Error;
export declare function isModelContextExceededError(error: unknown): boolean;
export declare function isModelMediaTooLargeError(error: unknown): boolean;
