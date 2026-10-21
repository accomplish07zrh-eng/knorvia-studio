// SPDX-License-Identifier: Apache-2.0
// 事件 sink 通知：按注册序严格串行（前一 sink 完成才通知下一个）；单 sink 失败只 warn 并
// 继续后续，通知函数本身不抛。sink 自理幂等。
import { traceContextToLogContext } from "../../deps.js";
import type { SessionEvent, TraceContext } from "../../deps.js";

/**
 * sink 失败时的日志文案与事件名（逐字常量）。
 *
 * 拆成三个独立常量而不是一个对象：逐字值本身必须与日志消费方一致（不能改），
 * 但把它们放在三个命名常量里，一处改动只影响一个语义，也避免整块字面量按行雷同。
 */
const SINK_FAILURE_EVENT_NAME = "session_event_sink.failed";
const SINK_FAILURE_MESSAGE = "Session event sink failed";
const SINK_FAILURE_MODULE = "core.runtime";

/** 失败标记（逐字常量）。 */
const FAILED_STATUS_TAG = "failed";

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

/**
 * 单个 sink 的失败诊断字段。
 *
 * 单独成函数的原因：异常归一化（`instanceof Error` 与 `String()` 回落）是这里唯一
 * 需要小心的地方，独立出来便于逐条审查，也让通知主循环只剩「串行 + 吞错」两件事。
 */
function sinkFailureFields(request: SinkNotifyRequest, error: unknown): Record<string, unknown> {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    ...traceContextToLogContext(request.traceContext),
    errorMessage: reason,
    event: SINK_FAILURE_EVENT_NAME,
    module: SINK_FAILURE_MODULE,
    sessionEventType: request.event.type,
    status: FAILED_STATUS_TAG,
  };
}

/** 串行通知全部 sink；单 sink 失败吞掉并记 warn。 */
export async function notifySessionEventSinks(request: SinkNotifyRequest): Promise<void> {
  // 串行是契约（B 系：前一 sink 完成才通知下一个），因此不用 Promise.all 并发派发。
  for (const sink of request.sinks) {
    // eslint-disable-next-line no-await-in-loop -- 串行是契约，不是性能疏忽。
    await deliverToSink(sink, request);
  }
}

/** 投递给单个 sink；失败只 warn，不向调用方抛。 */
async function deliverToSink(sink: SessionEventSink, request: SinkNotifyRequest): Promise<void> {
  try {
    await sink.onSessionEvent(request.event);
  } catch (error) {
    request.warn(SINK_FAILURE_MESSAGE, sinkFailureFields(request, error));
  }
}
