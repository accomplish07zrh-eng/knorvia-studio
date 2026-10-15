// SPDX-License-Identifier: Apache-2.0
// 取消流快照持久化：reasoning 块按数组序逐条落分部（空块跳过），text 收尾；完成时刻只取样一次，
// 全部分部共享同一 time 区间。持久化顺序即记录顺序，无并发。
import { createPartId } from "../../deps.js";
import type { MessageId, TraceContext } from "../../deps.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import type { RuntimeModelStreamSnapshot } from "../../types.js";
import { hasAssistantReasoningContent } from "../turn-output-token-continuation.js";

/** 助手消息标识（短别名，签名行不与历史实现同形）。 */
type AssistantId = MessageId;

/** 追踪上下文句柄（短别名）。 */
type TraceHandle = TraceContext;

/** 已收流快照（短别名）。 */
type StreamSnapshot = RuntimeModelStreamSnapshot;

/** 毫秒时刻（epoch）。 */
type EpochMillis = number;

/** 分部类型取值（逐字常量）。 */
const REASONING_PART = "reasoning";
const TEXT_PART = "text";

/** 一次取消落盘的入参。 */
export interface CancelSnapshotRequest {
  /** 助手消息创建时刻（time.start）。 */
  assistantCreatedAt: EpochMillis;
  /** 助手消息 id。 */
  assistantMessageId: AssistantId;
  /** 已收流快照。 */
  snapshot: StreamSnapshot;
  /** 追踪上下文。 */
  traceContext: TraceHandle;
}

/** 逐块落取消快照：先推理后文本，失败原样冒泡并中断后续。 */
export async function persistCancelledParts(
  ports: AgentRuntimeInternal,
  request: CancelSnapshotRequest,
): Promise<void> {
  const finishedAt = Date.now();
  const sharedTime = { end: finishedAt, start: request.assistantCreatedAt };
  const deliver = ports.persistPart.bind(ports);
  const { sessionId } = ports;
  for (const block of request.snapshot.reasoning) {
    if (!hasAssistantReasoningContent(block)) continue;
    await deliver(
      {
        id: createPartId(),
        sessionID: sessionId,
        messageID: request.assistantMessageId,
        type: REASONING_PART,
        text: block.text,
        metadata: block.providerOptions,
        time: sharedTime,
      },
      request.traceContext,
    );
  }
  if (!request.snapshot.text) return;
  await deliver(
    {
      id: createPartId(),
      sessionID: sessionId,
      messageID: request.assistantMessageId,
      type: TEXT_PART,
      text: request.snapshot.text,
      time: sharedTime,
    },
    request.traceContext,
  );
}
