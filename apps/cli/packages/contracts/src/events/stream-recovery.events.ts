// SPDX-License-Identifier: Apache-2.0
// 流恢复（stream recovery）相关的事件 payload 与投影行。
// 组织方式：先出四张词表与两个常量，再按「被恢复的动作」排序 payload，
// 最后用 extends 复用 payload 字段拼出投影行，避免把同一份字段抄两遍。

import type { MessageId, PartId, ToolCallId } from "../interfaces/shared.js";
import type { ModelToolSideEffectScope } from "../model/index.js";

// ── 一、词表与常量 ────────────────────────────────────────────────

/** 工具是在流结束时才执行，还是在流进行中就地执行。 */
export type StreamingToolExecutionTiming = "end_of_stream" | "during_stream";

/** 流式工具账本一行所处的位置；`recovery_blocked` 之后不再推进。 */
export type StreamingToolLedgerStatus =
  | "tool_input_streaming"
  | "tool_call_closed"
  | "tool_queued"
  | "tool_started"
  | "tool_result_committed"
  | "tool_cancelled"
  | "tool_abandoned"
  | "recovery_blocked";

/** 恢复锚点落在哪种已提交的产物上。 */
export type StreamRecoveryAnchorKind =
  | "assistant_message"
  | "tool_result"
  | "tool_error"
  | "tool_cancelled";

/** 触发一次流恢复的失败大类；`unknown` 表示无法归类，仍按可恢复处理。 */
export type StreamRecoveryFailureKind =
  | "provider_timeout"
  | "provider_network_error"
  | "provider_stream_error"
  | "provider_turn_failed"
  | "unknown";

// 作废半截 assistant 输出时写在 transcript 上的标记。它只是一段被丢弃的 tail，不是本轮失败：
// 压缩与 fork 边界靠 error 字段把半截输出隔离，冷恢复与子会话终态判定必须把它当**非终态**跳过，
// 才能与 live 投影保持一致。
/** 标记的名称，写在被丢弃消息的 `error.name` 上。 */
export const STREAM_RECOVERY_DISCARDED_ERROR_NAME = "StreamRecoveryDiscarded";
/** 标记的 finish 值，用来与被丢弃消息的 `finish` 对应。 */
export const STREAM_RECOVERY_DISCARDED_FINISH = "stream_recovery_discarded";

// ── 二、事件 payload ─────────────────────────────────────────────

/** 流式工具账本的更新：一行工具的完整状态快照。 */
export interface StreamingToolLedgerPayload {
  attemptId: string;
  assistantMessageId: MessageId;
  toolCallId: ToolCallId;
  toolName: string;
  status: StreamingToolLedgerStatus;
  executionTiming: StreamingToolExecutionTiming;
  input?: Record<string, unknown>;
  readOnly?: boolean;
  destructive?: boolean;
  concurrentSafe?: boolean;
  sideEffectScope?: ModelToolSideEffectScope;
  startedAt?: Date;
  committedAt?: Date;
  resultPartId?: PartId;
  recoveryAnchorId?: string;
  blockedReason?: string;
}

/** 选定的恢复锚点：恢复到哪一条已提交产物，以及它覆盖了哪些工具调用。 */
export interface StreamRecoveryAnchorPayload {
  anchorId: string;
  attemptId: string;
  kind: StreamRecoveryAnchorKind;
  assistantMessageId?: MessageId;
  toolCallId?: ToolCallId;
  toolName?: string;
  resultPartId?: PartId;
  committedToolCallIds: ToolCallId[];
  committedAt: Date;
}

/** 一次恢复的开始：失败类别、重试序号与上限。 */
export interface StreamRecoveryStartedPayload {
  attemptId: string;
  assistantMessageId?: MessageId;
  failedRequestId?: string;
  failureKind: StreamRecoveryFailureKind;
  message: string;
  retryNumber: number;
  maxRetries: number;
}

/** 锚点选择结果；`reason` 说明为什么落在这条产物上。 */
export interface StreamRecoveryAnchorSelectedPayload {
  attemptId: string;
  anchorId: string;
  reason: "latest_committed_tool_result" | "latest_committed_message" | "no_tool_committed";
  committedToolCallIds: ToolCallId[];
}

/** 丢弃半截输出：记账被丢掉的正文、推理与工具调用，便于审计「丢了多少」。 */
export interface StreamRecoveryTailDiscardedPayload {
  attemptId: string;
  anchorId: string;
  assistantMessageId?: MessageId;
  discardedTextBytes: number;
  discardedReasoningBytes: number;
  discardedToolCallIds: ToolCallId[];
}

/** 恢复后的重试开始；当前只走 SSE 一种流模式。 */
export interface StreamRecoveryRetryStartedPayload {
  attemptId: string;
  anchorId: string;
  failedRequestId?: string;
  retryNumber: number;
  maxRetries: number;
  streamMode: "sse";
}

/** 恢复被拒绝：原因限三种，其余情况不得自行编造。 */
export interface StreamRecoveryBlockedPayload {
  attemptId: string;
  toolCallId?: ToolCallId;
  toolName?: string;
  reason: "running_side_effect" | "unknown_side_effect" | "non_retryable_failure";
  message: string;
}

// ── 三、投影行 ───────────────────────────────────────────────────

/** 账本投影行 = payload 的全部字段 + 最后更新时间；由归约在每次更新时写入。 */
export interface StreamingToolLedgerProjectionInfo extends StreamingToolLedgerPayload {
  updatedAt: Date;
}

/** 锚点投影行 = payload 的全部字段 + 最后更新时间。 */
export interface StreamRecoveryAnchorProjectionInfo extends StreamRecoveryAnchorPayload {
  updatedAt: Date;
}
