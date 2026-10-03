import type { ModelMessageContent, ToolCallId, ToolSchedule, ToolExecutionResult } from "../deps.js";
export declare function emptyTokenUsageInfo(): ReturnType<typeof toTokenUsageInfo>;
export declare function toTokenUsageInfo(usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}): {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
        read: number;
        write: number;
    };
};
export declare function toRecordInput(input: unknown): Record<string, unknown>;
export declare function stringifyToolResultOutput(result: ToolExecutionResult): string;
export declare function modelContentForToolResult(result: ToolExecutionResult): ModelMessageContent;
export declare function isErrorForToolResult(result: ToolExecutionResult): boolean;
export declare function stringifyForEstimation(value: unknown): string;
export declare function parseMcpToolName(name: string): {
    serverName: string;
    toolName: string;
} | undefined;
export declare function findParallelGroupIndex(schedule: ToolSchedule, toolCallId: ToolCallId): number;
