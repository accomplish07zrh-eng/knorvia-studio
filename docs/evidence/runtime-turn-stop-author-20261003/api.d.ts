import type { MessageId, Model, TraceContext } from "../deps.js";
import type { RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { type RegularTurnLoopState } from "./turn-loop-state.js";
interface AssistantPersistenceAnchor {
    latestAssistantMessageId: AgentRuntimeInternal["latestAssistantMessageId"];
    latestAssistantTurnId: AgentRuntimeInternal["latestAssistantTurnId"];
    latestConversationMessageId: AgentRuntimeInternal["latestConversationMessageId"];
}
export declare function captureAssistantPersistenceAnchor(runtime: AgentRuntimeInternal): AssistantPersistenceAnchor;
export declare function persistCompletedAssistantStep(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantPersistenceAnchor: AssistantPersistenceAnchor;
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    includeEmptyAssistant: boolean;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
}): Promise<boolean>;
export declare function persistOutputTokenLimitErrorCarrier(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    error: {
        data: Record<string, unknown>;
        name: string;
    };
    finishReason: string;
    model: Model;
    modelTraceContext: TraceContext;
}): Promise<void>;
export declare function finishModelStepWithoutToolCalls(this: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantPersistenceAnchor: AssistantPersistenceAnchor;
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
}): Promise<"continue" | "break">;
export {};
