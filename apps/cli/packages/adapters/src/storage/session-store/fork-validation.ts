// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { ForkCommitBundle, MessagePart } from "@knorvia/contracts";

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function checkMessageReference(value: unknown, label: string, messageIds: Set<string>): void {
  if (typeof value === "string" && !messageIds.has(value)) {
    throw new Error(`Fork bundle ${label} is not child-local: ${value}`);
  }
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
  checkMessageReference(
    boundary?.lastSummarizedMessageId,
    "compact lastSummarizedMessageId",
    messageIds,
  );
  for (const id of boundary?.summaryMessageIds ?? []) {
    checkMessageReference(id, "compact summaryMessageId", messageIds);
  }
  for (const id of boundary?.attachmentMessageIds ?? []) {
    checkMessageReference(id, "compact attachmentMessageId", messageIds);
  }
  for (const id of boundary?.hookResultMessageIds ?? []) {
    checkMessageReference(id, "compact hookResultMessageId", messageIds);
  }
  checkMessageReference(
    boundary?.preservedSegment?.headMessageId,
    "compact preserved head",
    messageIds,
  );
  checkMessageReference(
    boundary?.preservedSegment?.anchorMessageId,
    "compact preserved anchor",
    messageIds,
  );
  checkMessageReference(
    boundary?.preservedSegment?.tailMessageId,
    "compact preserved tail",
    messageIds,
  );
}

export function validateForkBundleContents(bundle: ForkCommitBundle): void {
  const childId = String(bundle.child.id);
  const result = objectRecord(bundle.commandFact.ack.result);
  const forkResult =
    result?.type === "forkAssistant" ||
    result?.type === "createSelectionSideSession" ||
    (result?.type === "editUserQuery" && result.disposition === "fork");
  if (
    !forkResult ||
    typeof result?.sessionId !== "string" ||
    !result.sessionId.trim() ||
    result.sessionId.trim() !== childId
  ) {
    throw new Error("Fork bundle command result is missing, invalid, or not child-local");
  }

  const messageIds = new Set(bundle.messages.map((message) => String(message.info.id)));
  const targetIds = new Set<string>();
  if (bundle.goal) targetIds.add(String(bundle.goal.source.targetID));
  for (const message of bundle.messages) {
    const messageId = String(message.info.id);
    if (String(message.info.sessionID) !== childId) {
      throw new Error("Fork bundle message session is not child-local");
    }
    if (message.info.role === "assistant" && !messageIds.has(String(message.info.parentID))) {
      throw new Error("Fork bundle assistant parent is not child-local");
    }
    const anchor = message.info.anchor;
    for (const id of anchor?.orderedMessageIds ?? []) {
      checkMessageReference(id, "anchor orderedMessageId", messageIds);
    }
    checkMessageReference(anchor?.boundaryMessageId, "anchor boundaryMessageId", messageIds);
    if (anchor?.goalBoundary?.kind === "snapshot") {
      if (String(anchor.goalBoundary.target.sessionID) !== childId) {
        throw new Error("Fork bundle anchor goal session is not child-local");
      }
      targetIds.add(String(anchor.goalBoundary.target.targetID));
    }
    for (const part of message.parts) {
      if (String(part.sessionID) !== childId || String(part.messageID) !== messageId) {
        throw new Error("Fork bundle part owner is not child-local");
      }
      checkPartReferences(part, messageIds, targetIds);
      if (part.type === "tool" && part.state.status === "completed") {
        for (const attachment of part.state.attachments ?? []) {
          if (
            String(attachment.sessionID) !== childId ||
            String(attachment.messageID) !== messageId
          ) {
            throw new Error("Fork bundle tool attachment owner is not child-local");
          }
        }
      }
    }
  }
  if (bundle.goal && String(bundle.goal.source.sessionID) !== childId) {
    throw new Error("Fork bundle goal session is not child-local");
  }
  for (const entry of bundle.entries) {
    if (String(entry.sessionID) !== childId) {
      throw new Error("Fork bundle verifier entry session is not child-local");
    }
    const payload = objectRecord(objectRecord(entry.data)?.payload);
    checkMessageReference(
      payload?.anchorAssistantMessageId,
      "verifier assistant anchor",
      messageIds,
    );
    if (typeof payload?.targetId === "string" && !targetIds.has(payload.targetId)) {
      throw new Error("Fork bundle verifier target is not child-local");
    }
  }
}
