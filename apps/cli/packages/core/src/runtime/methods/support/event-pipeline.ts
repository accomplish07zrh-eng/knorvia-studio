// SPDX-License-Identifier: Apache-2.0
// 事件创建与追加管线：单事件严格顺序 append → durable → usage → sinks →（汇总命中即返回）/
// 冲刷汇总 → appended debug。生命周期事件另带 started/completed（或 failed）日志序列；
// 失败带 phase 标记后原样重抛。
import { createSessionEvent, traceContextToLogContext } from "../../deps.js";
import type { SessionEvent, TraceContext } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { persistDurableEvent } from "./durable-dispatch.js";
import { recordToolUsageFromEvent } from "../usage-observability.js";
import { admitAppendSummary, flushAppendSummaries, type SummaryLogPort } from "./append-summary.js";
import { notifySessionEventSinks, type SessionEventSink } from "./sink-notify.js";

/** 生命周期事件类型集（逐字；带 started/completed 日志序列）。 */
const LIFECYCLE_TYPES = new Set(
  "session_title_updated turn_started model_request model_complete turn_complete turn_error".split(
    " ",
  ),
);

/** 管线日志文案与事件名（逐字常量）。 */
const PIPELINE_LOG_TEXT = {
  appended: "Session event appended",
  appendedEvent: "event_store.appended",
  completed: "Session event persistence completed",
  completedEvent: "session.event.persistence.completed",
  failed: "Session event persistence failed",
  failedEvent: "session.event.persistence.failed",
  module: "core.runtime",
  started: "Session event persistence started",
  startedEvent: "session.event.persistence.started",
} as const;

/** 管线 phase 标记（逐字常量，用于失败定位）。 */
const PHASE_STORE_APPEND = "event_store.append";
const PHASE_DURABLE = "session_event.persist_durable";
const PHASE_USAGE = "session_event.record_usage";
const PHASE_SINKS = "session_event.notify_sinks";

/** 低频事件的汇总冲刷理由（逐字常量）。 */
const LOW_FREQUENCY_REASON = "low_frequency_event";

/** 失败标记（逐字常量）。 */
const FAILED_TAG = "failed";

/** 当前毫秒时刻（单点取样入口）。 */
const clockNow = (): number => Date.now();

/** 管线所需的运行时端口面。 */
export interface EventPipelinePorts {
  /** 会话事件存储（append 产生序号）。 */
  eventStore: { append(event: SessionEvent): Promise<SessionEvent> };
  /** 有序 sink 表。 */
  eventSinks: Iterable<SessionEventSink>;
  /** 会话 id。 */
  sessionId: string;
  /** 日志出口。 */
  logger?: SummaryLogPort & {
    info: (message: string, fields: Record<string, unknown>) => void;
    warn: (message: string, fields: Record<string, unknown>) => void;
    debug: (message: string, fields: Record<string, unknown>) => void;
  };
}

/** 建事件：类型/会话/负载 + turnId/traceId 身份。 */
export function createPipelineEvent(
  ports: EventPipelinePorts,
  type: string,
  payload: unknown,
  traceContext: TraceContext,
): SessionEvent {
  return createSessionEvent(type as never, ports.sessionId as never, payload, {
    turnId: traceContext.turnId as never,
    traceId: traceContext.traceId as never,
  });
}

/** 一条事件走完整管线；任一步失败：生命周期 warn（带 phase）后原样重抛。 */
export async function appendPipelineEvent(
  runtime: AgentRuntimeInternal,
  ports: EventPipelinePorts,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  const lifecycle = LIFECYCLE_TYPES.has(event.type);
  const { type: sessionEventType } = event;
  const startedAt = clockNow();
  let phase = PHASE_STORE_APPEND;
  const log = ports.logger;
  if (lifecycle) {
    log?.info(PIPELINE_LOG_TEXT.started, {
      ...traceContextToLogContext(traceContext),
      event: PIPELINE_LOG_TEXT.startedEvent,
      module: PIPELINE_LOG_TEXT.module,
      sessionEventType,
      status: "started",
    });
  }
  try {
    const storedEvent = await ports.eventStore.append(event);
    const { sequenceNumber: storedSequence, type: storedType } = storedEvent;
    phase = PHASE_DURABLE;
    await persistDurableEvent(runtime, storedEvent, traceContext);
    phase = PHASE_USAGE;
    await recordToolUsageFromEvent(runtime, storedEvent, traceContext);
    phase = PHASE_SINKS;
    await notifySessionEventSinks({
      sinks: ports.eventSinks,
      event: storedEvent,
      traceContext,
      warn: (message, fields) => {
        log?.warn(message, fields);
      },
    });
    if (lifecycle) {
      log?.info(PIPELINE_LOG_TEXT.completed, {
        ...traceContextToLogContext(traceContext),
        durationMs: clockNow() - startedAt,
        event: PIPELINE_LOG_TEXT.completedEvent,
        module: PIPELINE_LOG_TEXT.module,
        sessionEventSequenceNumber: storedSequence,
        sessionEventType: storedType,
        status: "completed",
      });
    }
    const summaryPort = {
      debug: (message: string, fields: Record<string, unknown>) => log?.debug(message, fields),
    };
    if (admitAppendSummary(runtime, storedEvent, traceContext, summaryPort)) return;
    flushAppendSummaries(runtime, traceContext, LOW_FREQUENCY_REASON, summaryPort);
    log?.debug(PIPELINE_LOG_TEXT.appended, {
      ...traceContextToLogContext(traceContext),
      event: PIPELINE_LOG_TEXT.appendedEvent,
      module: PIPELINE_LOG_TEXT.module,
      sessionEventSequenceNumber: storedSequence,
      sessionEventType: storedType,
    });
  } catch (error) {
    if (lifecycle) {
      log?.warn(PIPELINE_LOG_TEXT.failed, {
        ...traceContextToLogContext(traceContext),
        durationMs: clockNow() - startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
        event: PIPELINE_LOG_TEXT.failedEvent,
        module: PIPELINE_LOG_TEXT.module,
        phase,
        sessionEventType,
        status: FAILED_TAG,
      });
    }
    throw error;
  }
}
