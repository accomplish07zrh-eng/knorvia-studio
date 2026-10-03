import type { MessageId, Model, ToolCallId, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { type RegularTurnLoopState } from "./turn-loop-state.js";
export declare const START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE = "Start Plan is busy and automatic model stream recovery reached the maximum retry count.";
interface StreamRecoveryAttempt {
    maxRetries: number;
    retryNumber: number;
}
export declare function hasStreamRecoveryBudget(state: RegularTurnLoopState): boolean;
export declare function isStartPlanBusyStreamRecoveryFailure(error: unknown): boolean;
export declare function createStartPlanBusyAutoRetryExhaustedError(error: unknown): Error;
export declare function beginStreamRecoveryAttempt(state: RegularTurnLoopState): StreamRecoveryAttempt;
export declare function beginStartPlanBusyAdmissionRetryAttempt(state: RegularTurnLoopState): StreamRecoveryAttempt;
export declare function getStartPlanBusyAdmissionRetryDelayMs(input: {
    error: unknown;
    providerId: string;
    state: RegularTurnLoopState;
    turnNumber: number;
}): number | undefined;
export declare function emitStreamRecoveryStarted(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    traceContext: TraceContext;
}, error: unknown, recoveryAttempt: StreamRecoveryAttempt): Promise<void>;
export declare function emitStreamRecoveryRetryEvents(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    traceContext: TraceContext;
}, recovery: StreamRecoveryAttempt & {
    discardedReasoningBytes: number;
    discardedTextBytes: number;
    reason: "latest_committed_tool_result" | "no_tool_committed";
    toolCallIds: ToolCallId[];
}): Promise<void>;
export declare function recoverPartialAssistantOutputFailure(input: {
    abortController: AbortController;
    assistantCreatedAt: number;
    discardedReasoningBytes: number;
    discardedTextBytes: number;
    error: unknown;
    options: {
        assistantMessageId: MessageId;
        failedRequestId?: string;
        model: Model;
        traceContext: TraceContext;
    };
    runtime: AgentRuntimeInternal;
    state: RegularTurnLoopState;
    turnAbortListener: () => void;
}): Promise<boolean>;
export {};
