import type { MessageId, Model, ModelToolCall, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StreamedToolExecutionResult } from "../types.js";
import { type RegularTurnLoopState } from "./turn-loop-state.js";
interface StreamingToolCoordinator {
    accept(toolCall: ModelToolCall): void;
    abandon(reason: "cancelled" | "model_failed"): Promise<void>;
    drain(toolCalls: readonly ModelToolCall[]): Promise<StreamedToolExecutionResult[]>;
    recordReasoningDelta(text: string): void;
    recordTextDelta(text: string): void;
    recoverFromModelFailure(error: unknown, assistantCreatedAt: number, options?: {
        failedRequestId?: string;
    }): Promise<boolean>;
}
export declare function createStreamingToolCoordinator(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantMessageId: MessageId;
    model: Model;
    traceContext: TraceContext;
}): StreamingToolCoordinator;
export {};
