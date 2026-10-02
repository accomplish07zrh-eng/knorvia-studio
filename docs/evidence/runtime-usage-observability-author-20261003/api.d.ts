import type { MessageId, Model, SessionEvent, TraceContext, TurnId } from "@knorvia/contracts";
import type { RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
type ModelUsageQuerySource = "main_turn" | "compact" | "session_title" | "goal_completion_verification" | string;
interface RecordModelUsageInput {
    assistantMessageId?: MessageId;
    attemptIndex?: number;
    error?: unknown;
    events: readonly SessionEvent[];
    model: Model;
    networkEventStartIndex: number;
    parentUserMessageId?: MessageId;
    querySource: ModelUsageQuerySource;
    result?: RuntimeModelTextResult;
    startedAt: number;
    status: "completed" | "error" | "cancelled";
    toolCallCount?: number;
    traceContext: TraceContext;
}
interface RecordTurnUsageInput {
    completedAt: number;
    error?: unknown;
    events: readonly SessionEvent[];
    startedAt: number;
    status: "completed" | "error" | "cancelled";
    traceContext: TraceContext;
    turnId: TurnId;
    userMessageId?: MessageId;
}
export declare function recordModelUsageFact(runtime: AgentRuntimeInternal, input: RecordModelUsageInput): Promise<void>;
export declare function recordTurnUsageFact(runtime: AgentRuntimeInternal, input: RecordTurnUsageInput): Promise<void>;
export declare function recordToolUsageFromEvent(runtime: AgentRuntimeInternal, event: SessionEvent, traceContext: TraceContext): Promise<void>;
export {};
