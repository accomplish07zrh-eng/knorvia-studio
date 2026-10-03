import {
  createCoreError,
  CoreErrorType,
  selectActiveConversationBranch,
  type MessageId,
  type MessageWithParts,
  type SessionInfo,
} from "../deps.js";
import type { StableConversationForkTarget } from "../types.js";

export function stableForkError(message: string, context?: Record<string, unknown>) {
  return createCoreError(CoreErrorType.InvalidStateTransition, message, {
    context: context ?? {},
    recoverable: true,
  });
}

export function forkSourceMessagesForSession(
  parentMessages: MessageWithParts[],
  parentSession: SessionInfo,
): MessageWithParts[] {
  return selectActiveConversationBranch(parentMessages, {
    branchCutAfterMessageId: parentSession.revert?.branchCutAfterMessageID,
    rewindCreatedMessageId: parentSession.revert?.createdMessageID,
    rewindKeptMessageIds: parentSession.revert?.keptMessageIDs,
    rewindTargetMessageId: parentSession.revert?.targetMessageID,
  });
}

export function resolveForkHistoryEndIndex(
  messages: MessageWithParts[],
  targetIndex: number,
  expandAssistantTurn: boolean,
): number {
  const target = messages[targetIndex];
  if (!expandAssistantTurn || target?.info.role !== "assistant") return targetIndex + 1;
  let end = targetIndex + 1;
  while (end < messages.length) {
    const next = messages[end].info;
    if (next.role !== "assistant" || next.parentID !== target.info.parentID) break;
    end += 1;
  }
  return end;
}

export function buildForkHistoryMessages(
  parentMessages: MessageWithParts[],
  forkSourceMessages: MessageWithParts[],
  targetIndex: number,
  forkHistoryEndIndex: number,
): MessageWithParts[] {
  const history = forkSourceMessages.slice(0, forkHistoryEndIndex);
  const target = forkSourceMessages[targetIndex]?.info;
  if (
    target?.role !== "assistant" ||
    !target.parentID ||
    history.some((message) => message.info.id === target.parentID)
  )
    return history;
  const hasBoundary = history.some((message) =>
    message.parts.some(
      (part) =>
        part.type === "compaction" && (Boolean(part.compactBoundary) || !part.timelineStatus),
    ),
  );
  if (!hasBoundary) return history;
  const parent = parentMessages.find((message) => message.info.id === target.parentID);
  if (
    parent?.info.role === "user" &&
    parent.info.synthetic !== true &&
    parent.info.visibility !== "model-only" &&
    !parent.info.source &&
    !parent.info.summary &&
    !parent.parts.some(
      (part) =>
        part.type === "compaction" && (Boolean(part.compactBoundary) || !part.timelineStatus),
    )
  ) {
    history.unshift(parent);
  }
  return history;
}

export function historyBeforeInput(
  source: MessageWithParts[],
  targetMessageId: MessageId,
): MessageWithParts[] {
  const index = source.findIndex((message) => message.info.id === targetMessageId);
  if (index < 0)
    throw stableForkError(`Fork target input not found: ${targetMessageId}`, { targetMessageId });
  if (source[index].info.role !== "user")
    throw stableForkError("Fork-before-input target is not a user message", { targetMessageId });
  return source.slice(0, index);
}

export function stableForkHistory(
  source: MessageWithParts[],
  target: StableConversationForkTarget,
): MessageWithParts[] {
  const ids = target.orderedMessageIds;
  const boundaryMessageId = target.boundaryMessageId;
  if (!ids.length || ids[ids.length - 1] !== boundaryMessageId) {
    throw stableForkError("Stable fork target has an invalid boundary", { boundaryMessageId });
  }
  if (new Set(ids).size !== ids.length)
    throw stableForkError("Stable fork target contains duplicate message ids");
  const activeIndices = new Map<string, number>();
  source.forEach((message, index) => activeIndices.set(String(message.info.id), index));
  const start = activeIndices.get(ids[0]);
  if (start === undefined)
    throw stableForkError("Stable fork target is not an active transcript segment", {
      messageId: ids[0],
    });
  for (let offset = 0; offset < ids.length; offset += 1) {
    if (String(source[start + offset]?.info.id) !== ids[offset]) {
      throw stableForkError("Stable fork target is not a contiguous active transcript segment", {
        messageId: ids[offset],
      });
    }
  }
  const boundary = source[start + ids.length - 1].info;
  if (boundary.role !== "assistant" || boundary.error) {
    throw stableForkError("Stable fork boundary is not a completed assistant message", {
      boundaryMessageId,
    });
  }
  return source.slice(0, start + ids.length);
}
