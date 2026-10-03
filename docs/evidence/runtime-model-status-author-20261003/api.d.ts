import type { ModelNetworkStatusEvent, ModelStatusSink, ModelStreamRecoveryStatus, SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
interface ModelStatusSinkOptions {
    onStatus?: (event: ModelNetworkStatusEvent) => void;
    streamRecovery?: ModelStreamRecoveryStatus;
}
export declare function createModelStatusSink(this: AgentRuntimeInternal, traceContext: TraceContext, events: SessionEvent[], options?: ModelStatusSinkOptions): ModelStatusSink;
export declare function logModelNetworkStatus(this: AgentRuntimeInternal, statusEvent: ModelNetworkStatusEvent, traceContext: TraceContext): void;
export {};
