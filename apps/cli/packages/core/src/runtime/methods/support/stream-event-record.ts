// SPDX-License-Identifier: Apache-2.0
// 流式事件落盘：一次「建事件 → 持久化 → 入数组」的固定次序。持久化完成才算写入成功，
// 数组归调用方；写入失败原样冒泡，由队列层记为队列级失败。
import { SessionEventType } from "../../deps.js";
import type { ModelStreamingPayload, SessionEvent, TraceContext } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";

/** 落库事件类型：流式载荷一律以 ModelStreaming 记录。 */
const STREAM_EVENT_TYPE = SessionEventType.ModelStreaming;

/** 一次落盘请求：端口面、载荷、追踪与调用方数组一次给齐。 */
export interface StreamingEventWrite {
  /** 事件端口面（建事件与追加都走它）。 */
  runtime: AgentRuntimeInternal;
  /** 待落盘的流式载荷。 */
  payload: ModelStreamingPayload;
  /** 追踪上下文。 */
  traceContext: TraceContext;
  /** 调用方持有的事件数组。 */
  events: SessionEvent[];
}

/** 记录一条流式事件：次序即契约，任何一步失败都不动事件数组。 */
export async function recordStreamingEvent(request: StreamingEventWrite): Promise<void> {
  // 第一步：构造事件本体（标识与时间戳由会话事件工厂补齐）。
  const built = request.runtime.createEvent(
    STREAM_EVENT_TYPE,
    request.payload,
    request.traceContext,
  );
  // 第二步：持久化完成才继续；失败原样上抛给调用链。
  await request.runtime.appendEvent(built, request.traceContext);
  // 第三步：调用方数组只收已持久化完成的事件。
  request.events.push(built);
}
