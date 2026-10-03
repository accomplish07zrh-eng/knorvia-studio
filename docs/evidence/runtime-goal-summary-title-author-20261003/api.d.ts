import type { TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function maybeStartGoalSummaryTitleGeneration(this: AgentRuntimeInternal, input: string, targetID: string, options?: {
    traceContext?: TraceContext;
}): boolean;
export declare function persistGeneratedGoalSummaryTitle(this: AgentRuntimeInternal, input: {
    targetID: string;
    title: string;
    traceContext: TraceContext;
}): Promise<void>;
export declare function persistFallbackGoalSummaryTitle(this: AgentRuntimeInternal, input: {
    objective: string;
    reason: string;
    targetID: string;
    traceContext: TraceContext;
}): Promise<void>;
