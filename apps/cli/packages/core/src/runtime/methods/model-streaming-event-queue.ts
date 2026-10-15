// SPDX-License-Identifier: Apache-2.0
// 流式事件写入队列入口：串行尾链、背压与失败缓存在 support/write-queue.ts，这里接线端口面。
import type { ModelStreamingPayload, SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { createStreamingWriteQueue, type StreamingQueuePayload } from "./support/write-queue.js";

/** 队列句柄：入队（同步登记）、排空、背压三出口。 */
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
  return createStreamingWriteQueue({
    writeCeiling: params.highWaterMark,
    write: (payload: StreamingQueuePayload) =>
      params.runtime.emitModelStreamingEvent(
        payload as unknown as ModelStreamingPayload,
        params.traceContext,
        params.events,
      ),
  }) as unknown as ModelStreamingEventQueue;
}
