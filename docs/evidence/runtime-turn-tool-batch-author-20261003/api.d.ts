import type { MessageId, ModelToolCall, TraceContext } from "../deps.js";
import type { RuntimeModelTextResult, StreamedToolExecutionResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
export declare function executeToolCallsForModelStep(this: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
    streamedToolResults?: StreamedToolExecutionResult[];
    toolCalls: ModelToolCall[];
}): Promise<"continue" | "break">;
