import type { ModelUsageSummary, SessionGoal, TargetChangedPayload, TraceContext } from "../deps.js";
import type { TurnResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { TargetContinuationRuntimeCommandOptions } from "../command-queue.js";
export declare function recordTargetChanged(this: AgentRuntimeInternal, input: TargetChangedPayload & {
    traceContext: TraceContext;
}): Promise<void>;
export declare function continueActiveTargetIfIdle(this: AgentRuntimeInternal, options?: {
    traceContext?: TraceContext;
    abortSignal?: AbortSignal;
    inputId?: string;
    intent?: TargetContinuationRuntimeCommandOptions["intent"];
    verifyBeforeContinue?: boolean;
}): Promise<TurnResult | null>;
export declare function executeTargetContinuationCommand(this: AgentRuntimeInternal, options: TargetContinuationRuntimeCommandOptions): Promise<TurnResult | null>;
export declare function targetContinuationCandidate(this: AgentRuntimeInternal, traceContext: TraceContext): Promise<SessionGoal | null>;
export declare function accountTargetTurnCompletion(this: AgentRuntimeInternal, input: {
    inputID: string;
    startedAtMs: number;
    startedTarget: SessionGoal | null;
    traceContext: TraceContext;
    usage?: ModelUsageSummary;
}): Promise<void>;
export declare function startTargetTurnAccounting(this: AgentRuntimeInternal, input: {
    inputID: string;
    startedAtMs: number;
    startedTarget: SessionGoal | null;
    traceContext: TraceContext;
}): Promise<SessionGoal | null>;
export declare function heartbeatTargetTurnAccounting(this: AgentRuntimeInternal, input: {
    inputID: string;
    seenAtMs: number;
    startedTarget: SessionGoal | null;
    traceContext: TraceContext;
}): Promise<void>;
export declare function finishTargetTurnAccounting(this: AgentRuntimeInternal, input: {
    inputID: string;
    endedAtMs: number;
    startedTarget: SessionGoal | null;
    status?: "paused";
    traceContext: TraceContext;
}): Promise<SessionGoal | null>;
export declare function pauseActiveTargetForCancellation(this: AgentRuntimeInternal, traceContext: TraceContext): Promise<void>;
export declare function activatePausedTargetAfterResume(this: AgentRuntimeInternal, traceContext: TraceContext): Promise<SessionGoal | null>;
