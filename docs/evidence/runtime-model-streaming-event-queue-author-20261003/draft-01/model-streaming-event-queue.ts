import type { ModelStreamingPayload, SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

interface ModelStreamingEventQueue {
    drain(): Promise<void>;
    enqueue(payload: ModelStreamingPayload): void;
    maybeApplyBackpressure(): Promise<void>;
}

export function createModelStreamingEventQueue(params: {
    events: SessionEvent[];
    highWaterMark?: number;
    runtime: AgentRuntimeInternal;
    traceContext: TraceContext;
}): ModelStreamingEventQueue {
    const highWaterMark = params.highWaterMark ?? 128;
    let pending = 0;
    let failure: unknown;
    let tail: Promise<void> = Promise.resolve();

    async function awaitQueuedWrites(): Promise<void> {
        await tail;
        if (failure) {
            throw failure;
        }
    }

    function enqueue(payload: ModelStreamingPayload): void {
        if (failure) {
            throw failure;
        }
        pending += 1;
        tail = tail
            .then(async () => {
                if (failure) {
                    return;
                }
                await params.runtime.emitModelStreamingEvent(
                    payload,
                    params.traceContext,
                    params.events,
                );
            })
            .catch((reason: unknown) => {
                failure ??= reason;
            })
            .finally(() => {
                pending -= 1;
            });
    }

    return {
        async drain(): Promise<void> {
            await awaitQueuedWrites();
        },
        enqueue,
        async maybeApplyBackpressure(): Promise<void> {
            if (failure) {
                throw failure;
            }
            if (pending < highWaterMark) {
                return;
            }
            await awaitQueuedWrites();
        },
    };
}
