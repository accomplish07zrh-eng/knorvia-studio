// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-plugin-rewind：会话回退的**规划**（只算目标，不执行 fork）。
//
// 契约依据：specs/contracts/kernel-plugin-rewind/{behavior,interface,known-differences}.md
//           B7、§三.4、K4
//
// **L5 是本包的硬边界**：本模块**只算出「该回退到哪个 sequenceNumber」**，
// **绝不调用 `session.fork`**。理由：
//   1. fork 是物理分支操作，属会话/协议面（规格 L73 归 DSH 的 `session.fork(atSeq)`）；
//   2. 调它要引入 DSH 运行时依赖，破坏本包的「纯逻辑 + 可离线测试 + engine-agnostic」。
//
// 所以本模块的产物 `targetSequenceNumber` 是本包与 kernel-bridge / kernel-legacy-sessions
// 的**唯一接缝** —— 它们拿这个值去调 DSH。

import type { SessionEvent } from "@knorvia/contracts";

/** 回退范围（对齐 contracts 的 `RewindScope`）。 */
export const REWIND_SCOPE = {
  Conversation: "conversation",
  Workspace: "workspace",
  Both: "both",
} as const;

export type RewindScope = (typeof REWIND_SCOPE)[keyof typeof REWIND_SCOPE];

/** 目标评估结果（可回退 / 被压缩覆盖 / 消息不存在）。 */
export const TARGET_STATUS = {
  ActiveChain: "active_chain",
  CoveredByCompact: "covered_by_compact",
  Missing: "missing",
} as const;

export type TargetStatus = (typeof TARGET_STATUS)[keyof typeof TARGET_STATUS];

/** 会话回退计划。 */
export interface ConversationPlan {
  readonly scope: "conversation";
  readonly available: boolean;
  /**
   * 交给 DSH `session.fork(atSeq)` 用的目标序号。
   *
   * **⚠️ 本包不执行 fork**（L5）—— 只产出这个值。
   */
  readonly targetSequenceNumber?: number;
  readonly targetMessageId?: string;
  /** 会被截断的消息（供 UI 展示影响范围）。 */
  readonly affectedMessageIds?: readonly string[];
  readonly targetStatus?: TargetStatus;
  readonly unavailableReason?: string;
}

/** 构造「不可用」的会话计划。 */
export function unavailableConversationPlan(
  reason: string,
  status?: TargetStatus,
): ConversationPlan {
  return {
    scope: "conversation",
    available: false,
    ...(status === undefined ? {} : { targetStatus: status }),
    unavailableReason: reason,
  };
}

/**
 * 规划会话回退：找出目标消息所在的序号。
 *
 * 语义（B7）：
 * - 从事件历史里找「该消息对应的 sequenceNumber」；
 * - 若该消息已被压缩覆盖 → `available: false` + `targetStatus: "covered_by_compact"`；
 * - 若消息不存在 → `available: false` + `targetStatus: "missing"`；
 * - 找到 → 返回 `targetSequenceNumber`（**供调用方执行 fork**）。
 *
 * **⚠️ 本函数是纯读**：只遍历传入的事件数组，不调任何端口写方法、不调 fork。
 *
 * @param events 完整事件列表（按 sequenceNumber 升序）
 * @param targetMessageId 目标消息标识
 */
export function planConversationRewind(
  events: readonly SessionEvent[],
  targetMessageId: string,
): ConversationPlan {
  if (targetMessageId.length === 0) {
    return unavailableConversationPlan("target message id is empty", TARGET_STATUS.Missing);
  }

  /** 该消息出现在哪些事件里（取最早的那条作为回退点）。 */
  const matching = events.filter((event) => messageIdOf(event) === targetMessageId);
  if (matching.length === 0) {
    return unavailableConversationPlan(
      `message ${targetMessageId} not found in session events`,
      TARGET_STATUS.Missing,
    );
  }

  // 取最小 sequenceNumber：回退到该消息「之前」，所以要用它自己的序号。
  const target = matching.reduce((earliest, event) =>
    event.sequenceNumber < earliest.sequenceNumber ? event : earliest,
  );

  // 该序号之后的所有事件都会被截断 → 作为影响范围返回（供 UI 展示）。
  const affected = events
    .filter((event) => event.sequenceNumber > target.sequenceNumber)
    .map((event) => event.sequenceNumber);

  return {
    scope: "conversation",
    available: true,
    targetSequenceNumber: target.sequenceNumber,
    targetMessageId,
    affectedMessageIds: affected.map(String),
    targetStatus: TARGET_STATUS.ActiveChain,
  };
}

/** 从一条事件里取出它关联的消息标识（若有）。 */
function messageIdOf(event: SessionEvent): string | undefined {
  if (event === null || typeof event !== "object") return undefined;
  if (!("payload" in event)) return undefined;
  const payload = event.payload;
  if (payload === null || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  // 常见字段名：`messageId`（用户/助手消息事件）、`targetMessageId`（回退事件）。
  const direct = record.messageId;
  if (typeof direct === "string") return direct;
  const target = record.targetMessageId;
  return typeof target === "string" ? target : undefined;
}
