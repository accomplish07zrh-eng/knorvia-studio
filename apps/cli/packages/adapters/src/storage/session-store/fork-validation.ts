// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 分叉包内容校验：所有被引用的事实（消息、分片、附件、目标）都必须落在 child 内。
// 9 条错误文案与全部属性/字段名都是对外可观察契约，逐字保留。

import type { ForkCommitBundle, MessagePart } from "@knorvia/contracts";

/** 压缩分片的边界形状：从契约联合里取出 compaction 分支对应字段。 */
type CompactionBoundary = Extract<MessagePart, { type: "compaction" }>["compactBoundary"];

/** 对象收窄：null 与数组都不算记录。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object") return undefined;
  return Array.isArray(value) ? undefined : (value as Record<string, unknown>);
}

function checkMessageReference(value: unknown, label: string, messageIds: Set<string>): void {
  if (typeof value !== "string") return;
  if (messageIds.has(value)) return;
  throw new Error(`Fork bundle ${label} is not child-local: ${value}`);
}

/** 逐个检查一组消息引用（anchor 列表、summary 列表等共用）。 */
function checkMessageList(
  values: readonly string[] | undefined,
  label: string,
  messageIds: Set<string>,
): void {
  for (const id of values ?? []) checkMessageReference(id, label, messageIds);
}

/** 压缩分片：边界上的五组引用与保留片段的首/锚/尾。 */
function checkCompactionBoundary(boundary: CompactionBoundary, messageIds: Set<string>): void {
  if (boundary === undefined) return;
  checkMessageReference(
    boundary.lastSummarizedMessageId,
    "compact lastSummarizedMessageId",
    messageIds,
  );
  checkMessageList(boundary.summaryMessageIds, "compact summaryMessageId", messageIds);
  checkMessageList(boundary.attachmentMessageIds, "compact attachmentMessageId", messageIds);
  checkMessageList(boundary.hookResultMessageIds, "compact hookResultMessageId", messageIds);
  checkMessageReference(
    boundary.preservedSegment?.headMessageId,
    "compact preserved head",
    messageIds,
  );
  checkMessageReference(
    boundary.preservedSegment?.anchorMessageId,
    "compact preserved anchor",
    messageIds,
  );
  checkMessageReference(
    boundary.preservedSegment?.tailMessageId,
    "compact preserved tail",
    messageIds,
  );
}

function checkPartReferences(
  part: MessagePart,
  messageIds: Set<string>,
  targetIds: Set<string>,
): void {
  if (part.type === "timeline") {
    checkMessageReference(part.anchorMessageId, "timeline anchorMessageId", messageIds);
    if (part.timelineType === "context_compaction") {
      checkMessageReference(part.summaryMessageId, "timeline summaryMessageId", messageIds);
    }
    if (part.timelineType === "goal_verification") targetIds.add(String(part.targetId));
  }
  if (part.type !== "compaction") return;
  checkMessageReference(part.tail_start_id, "compaction tail_start_id", messageIds);
  checkMessageReference(part.summaryMessageId, "compaction summaryMessageId", messageIds);
  const boundary = part.compactBoundary;
  checkCompactionBoundary(boundary, messageIds);
}

/** commandFact 的 ack.result 必须是 fork 类结果，且会话就是本次 child。 */
function assertForkResult(bundle: ForkCommitBundle, childId: string): void {
  const ack = asRecord(bundle.commandFact.ack.result);
  const forked =
    ack?.type === "forkAssistant" ||
    ack?.type === "createSelectionSideSession" ||
    (ack?.type === "editUserQuery" && ack.disposition === "fork");
  const sameSession =
    typeof ack?.sessionId === "string" &&
    Boolean(ack.sessionId.trim()) &&
    ack.sessionId.trim() === childId;
  if (!forked || !sameSession) {
    throw new Error("Fork bundle command result is missing, invalid, or not child-local");
  }
}

function assertAnchorLocal(
  anchor: ForkCommitBundle["messages"][number]["info"]["anchor"],
  childId: string,
  messageIds: Set<string>,
  targetIds: Set<string>,
): void {
  checkMessageList(anchor?.orderedMessageIds, "anchor orderedMessageId", messageIds);
  checkMessageReference(anchor?.boundaryMessageId, "anchor boundaryMessageId", messageIds);
  if (anchor?.goalBoundary?.kind !== "snapshot") return;
  if (String(anchor.goalBoundary.target.sessionID) !== childId) {
    throw new Error("Fork bundle anchor goal session is not child-local");
  }
  targetIds.add(String(anchor.goalBoundary.target.targetID));
}

function assertAttachmentsLocal(part: MessagePart, childId: string, messageId: string): void {
  if (part.type !== "tool" || part.state.status !== "completed") return;
  for (const attachment of part.state.attachments ?? []) {
    const sameOwner =
      String(attachment.sessionID) === childId && String(attachment.messageID) === messageId;
    if (!sameOwner) throw new Error("Fork bundle tool attachment owner is not child-local");
  }
}

/** 单条消息：自身、assistant 父指针、anchor 目标与全部分片都要 child 本地。 */
function assertMessageLocal(
  message: ForkCommitBundle["messages"][number],
  childId: string,
  messageIds: Set<string>,
  targetIds: Set<string>,
): void {
  const messageId = String(message.info.id);
  if (String(message.info.sessionID) !== childId) {
    throw new Error("Fork bundle message session is not child-local");
  }
  if (message.info.role === "assistant" && !messageIds.has(String(message.info.parentID))) {
    throw new Error("Fork bundle assistant parent is not child-local");
  }
  assertAnchorLocal(message.info.anchor, childId, messageIds, targetIds);
  for (const part of message.parts) {
    if (String(part.sessionID) !== childId || String(part.messageID) !== messageId) {
      throw new Error("Fork bundle part owner is not child-local");
    }
    checkPartReferences(part, messageIds, targetIds);
    assertAttachmentsLocal(part, childId, messageId);
  }
}

/** 校验器行：payload 里的锚点与目标 id 也要能对上。 */
function assertEntriesLocal(
  bundle: ForkCommitBundle,
  childId: string,
  messageIds: Set<string>,
  targetIds: Set<string>,
): void {
  for (const entry of bundle.entries) {
    if (String(entry.sessionID) !== childId) {
      throw new Error("Fork bundle verifier entry session is not child-local");
    }
    const body = asRecord(asRecord(entry.data)?.payload);
    checkMessageReference(body?.anchorAssistantMessageId, "verifier assistant anchor", messageIds);
    if (typeof body?.targetId === "string" && !targetIds.has(body.targetId)) {
      throw new Error("Fork bundle verifier target is not child-local");
    }
  }
}

export function validateForkBundleContents(bundle: ForkCommitBundle): void {
  const childId = String(bundle.child.id);
  assertForkResult(bundle, childId);

  const messageIds = new Set(bundle.messages.map((message) => String(message.info.id)));
  const targetIds = new Set<string>();
  if (bundle.goal) targetIds.add(String(bundle.goal.source.targetID));
  for (const message of bundle.messages) {
    assertMessageLocal(message, childId, messageIds, targetIds);
  }
  if (bundle.goal && String(bundle.goal.source.sessionID) !== childId) {
    throw new Error("Fork bundle goal session is not child-local");
  }
  assertEntriesLocal(bundle, childId, messageIds, targetIds);
}
