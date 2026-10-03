import type { SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
export { projectExecutionErrorPayload } from "../../errors/error-payload.js";
interface TurnAbortScope {
    dispose: () => void;
    signal: AbortSignal;
}
export declare function createExternalTurnFaultError(code: string, message?: string): Error;
export declare function createTurnAbortScope(parentSignal?: AbortSignal): TurnAbortScope;
export declare function throwIfTurnAborted(signal?: AbortSignal): void;
export declare function createTurnFailureError(error: unknown, abortSignal: AbortSignal | undefined, fallbackMessage: string): any;
export declare function createTurnCancelledError(error: unknown): any;
export declare function appendTurnOutcomeEvent(runtime: AgentRuntimeInternal, params: {
    coreError: ReturnType<typeof createTurnFailureError>;
    events: SessionEvent[];
    durationMs: number;
    turnPhase: string;
    inputId?: string;
    traceContext: TraceContext;
    fallbackMessage: string;
    logEvent: string;
    logLabel: string;
    preserveQueueAutoDrainOnCancel?: boolean;
    backgroundSubagentResultConsumed?: boolean;
    workflowResultConsumed?: boolean;
    historyRoundCount?: number;
}): Promise<void>;
export declare function isTurnCancellationError(error: unknown, abortSignal?: AbortSignal): boolean;
