// SPDX-License-Identifier: Apache-2.0
// 流式事件落盘入口：记录次序在 support/stream-event-record.ts，这里保持兼容导出面。
import type { ModelStreamingPayload, SessionEvent, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { recordStreamingEvent } from "./support/stream-event-record.js";

export async function emitModelStreamingEvent(
  this: AgentRuntimeInternal,
  payload: ModelStreamingPayload,
  traceContext: TraceContext,
  events: SessionEvent[],
): Promise<void> {
  await recordStreamingEvent({ runtime: this, payload, traceContext, events });
}
