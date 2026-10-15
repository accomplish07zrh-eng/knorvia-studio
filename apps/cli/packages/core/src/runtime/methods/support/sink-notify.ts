// SPDX-License-Identifier: Apache-2.0
// 事件 sink 通知：按注册序严格串行（前一 sink 完成才通知下一个）；单 sink 失败只 warn 并
// 继续后续，通知函数本身不抛。sink 自理幂等。
import { traceContextToLogContext } from "../../deps.js";
import type { SessionEvent, TraceContext } from "../../deps.js";

/** sink 失败日志文案与事件名（逐字常量）。 */
const SINK_FAIL_TEXT = {
  event: "session_event_sink.failed",
  message: "Session event sink failed",
  module: "core.runtime",
} as const;

/** 失败标记（逐字常量）。 */
const FAILED_TAG = "failed";

/** 事件 sink 的最小面。 */
export interface SessionEventSink {
  /** 事件回调。 */
  onSessionEvent(event: SessionEvent): Promise<void> | void;
}

/** 通知入参：sink 表、事件、追踪与日志出口。 */
export interface SinkNotifyRequest {
  /** 有序 sink 表。 */
  sinks: Iterable<SessionEventSink>;
  /** 待通知事件。 */
  event: SessionEvent;
  /** 追踪上下文。 */
  traceContext: TraceContext;
  /** warn 出口。 */
  warn: (message: string, fields: Record<string, unknown>) => void;
}

/** 串行通知全部 sink；单 sink 失败吞掉并记 warn。 */
export async function notifySessionEventSinks(request: SinkNotifyRequest): Promise<void> {
  for (const sink of request.sinks) {
    try {
      await sink.onSessionEvent(request.event);
    } catch (error) {
      request.warn(SINK_FAIL_TEXT.message, {
        ...traceContextToLogContext(request.traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: SINK_FAIL_TEXT.event,
        module: SINK_FAIL_TEXT.module,
        sessionEventType: request.event.type,
        status: FAILED_TAG,
      });
    }
  }
}
