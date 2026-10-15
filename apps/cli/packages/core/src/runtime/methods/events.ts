// SPDX-License-Identifier: Apache-2.0
// 事件创建与追加入口：管线、sink 通知与汇总接线在 support/（event-pipeline / sink-notify /
// append-summary），这里保持兼容导出面（含 ensureSessionPersisted 转出口）。
import type { SessionEvent, SessionEventType, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  appendPipelineEvent,
  createPipelineEvent,
  type EventPipelinePorts,
} from "./support/event-pipeline.js";
import { notifySessionEventSinks } from "./support/sink-notify.js";

export { ensureSessionPersisted } from "./events-session.js";

/** 从运行时取管线端口面。 */
const portsOf = (runtime: AgentRuntimeInternal): EventPipelinePorts =>
  ({
    eventStore: runtime.eventStore,
    eventSinks: runtime.eventSinks,
    sessionId: runtime.sessionId,
    logger: runtime.logger,
  }) as unknown as EventPipelinePorts;

export function createEvent(
  this: AgentRuntimeInternal,
  type: SessionEventType,
  payload: unknown,
  traceContext: TraceContext,
): SessionEvent {
  return createPipelineEvent(portsOf(this), type, payload, traceContext);
}

export function isSessionPersisted(this: AgentRuntimeInternal): boolean {
  return this.sessionPersisted;
}

export async function appendEvent(
  this: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  await appendPipelineEvent(this, portsOf(this), event, traceContext);
}

export async function notifyEventSinks(
  this: AgentRuntimeInternal,
  event: SessionEvent,
  traceContext: TraceContext,
): Promise<void> {
  await notifySessionEventSinks({
    sinks: this.eventSinks,
    event,
    traceContext,
    warn: (message, fields) => {
      this.logger?.warn(message, fields);
    },
  });
}
