import type { MessageId, ModelSelection, TraceContext } from "../deps.js";
import type { AgentTelemetryCausation } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
export declare const SESSION_TITLE_QUERY_SOURCE = "session_title";
export declare const GOAL_SUMMARY_TITLE_QUERY_SOURCE = "goal_summary_title";
export declare function generateTitleCandidate(this: AgentRuntimeInternal, input: string, options: {
    causation?: AgentTelemetryCausation;
    messageID?: MessageId;
    querySource: string;
    traceContext: TraceContext;
}): Promise<{
    modelSelection: ModelSelection;
    title: string;
    traceContext: TraceContext;
} | null>;
export declare function normalizeTitleInput(input: string): string;
