import type { ModelStreamingPayload, SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
interface ModelStreamingEventQueue {
    drain(): Promise<void>;
    enqueue(payload: ModelStreamingPayload): void;
    maybeApplyBackpressure(): Promise<void>;
}
export declare function createModelStreamingEventQueue(params: {
    events: SessionEvent[];
    highWaterMark?: number;
    runtime: AgentRuntimeInternal;
    traceContext: TraceContext;
}): ModelStreamingEventQueue;
export {};
