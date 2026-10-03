import type { ModelInputMessage, Model, ModelToolContract } from "@knorvia/contracts";
import type { ExecutableToolCall, ToolExecutionResult } from "../tool/types.js";
interface MemoryAgentLoopResult {
    messages: ModelInputMessage[];
    turns: number;
}
export declare function runMemoryAgentLoop(input: {
    abortSignal?: AbortSignal;
    executeTool: (toolCall: ExecutableToolCall, options: {
        abortSignal?: AbortSignal;
    }) => Promise<ToolExecutionResult>;
    maxTurns: number;
    messages: readonly ModelInputMessage[];
    model: Model;
    rootDir: string;
    tools: readonly ModelToolContract[];
    workingDirectory: string;
    workspaceRoot: string;
}): Promise<MemoryAgentLoopResult>;
export {};
