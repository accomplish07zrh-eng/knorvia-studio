// SPDX-License-Identifier: Apache-2.0
// 流式事件落盘：一次「建事件 → 持久化 → 入数组」的固定次序。持久化完成才算写入成功，
// 数组归调用方；写入失败原样冒泡，由队列层记为队列级失败。
import { SessionEventType } from "../../deps.js";
import type { ModelStreamingPayload, SessionEvent, TraceContext } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";

/**
 * 落库事件类型：流式载荷一律以 ModelStreaming 记录。
 *
 * 取自共享枚举而非常量字面量：枚举改名时这里会编译失败，比一个字符串常量更早暴露。
 */
const streamPayloadEventType = SessionEventType.ModelStreaming;

/** 落盘所需的事件端口面（建事件与追加都走它）。 */
export type StreamingEventPort = AgentRuntimeInternal;

/** 落盘所需的追踪上下文。 */
export type StreamingEventTrace = TraceContext;

/** 调用方持有的事件数组（本函数只追加，不拥有它）。 */
export type StreamingEventSink = SessionEvent[];

/**
 * 一次落盘请求：端口面、载荷、追踪与调用方数组一次给齐。
 *
 * 四个成员各自有独立语义，因此用具名类型别名而非内联接口——读签名时不必回头看字段含义。
 */
export interface StreamingEventWrite {
  /** 事件端口面（建事件与追加都走它）。 */
  runtime: StreamingEventPort;
  /** 待落盘的流式载荷。 */
  payload: ModelStreamingPayload;
  /** 追踪上下文。 */
  traceContext: StreamingEventTrace;
  /** 调用方持有的事件数组。 */
  events: StreamingEventSink;
}

/**
 * 记录一条流式事件：次序即契约，任何一步失败都不动事件数组。
 *
 * 三步不可交换：
 *   1. 构造事件本体（标识与时间戳由会话事件工厂补齐）；
 *   2. 持久化——**完成才算写入成功**，失败原样上抛，由队列层记队列级失败；
 *   3. 只有已持久化完成的事件才进调用方数组。
 */
export async function recordStreamingEvent(request: StreamingEventWrite): Promise<void> {
  const built = request.runtime.createEvent(
    streamPayloadEventType,
    request.payload,
    request.traceContext,
  );
  await request.runtime.appendEvent(built, request.traceContext);
  request.events.push(built);
}
