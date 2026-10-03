import type { MessageId, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function maybeStartSessionTitleGeneration(this: AgentRuntimeInternal, input: string, messageID: MessageId, traceContext: TraceContext, options?: {
    deferIfProviderRuntimeHeadersRefresh?: boolean;
    goalSummaryTargetID?: string;
}): boolean;
export declare function maybeStartDeferredSessionTitleGeneration(this: AgentRuntimeInternal, input: string, messageID: MessageId, traceContext: TraceContext): boolean;
export declare function maybeStartSessionTitleGenerationFromExternalInput(this: AgentRuntimeInternal, input: string, options?: {
    goalSummaryTargetID?: string;
    traceContext?: TraceContext;
}): void;
export declare function setCustomSessionTitle(this: AgentRuntimeInternal, input: {
    title: string;
    traceContext: TraceContext;
}): Promise<void>;
