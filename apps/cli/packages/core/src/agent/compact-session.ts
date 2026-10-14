// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 活动会话消息与压缩保留段：给冷恢复算出「从最后一个压缩边界起」的消息切片。
import type { CompactBoundaryPayload, MessagePart, MessageWithParts } from "@knorvia/contracts";
import { invalidateRuntimeTokenUsage } from "./message-history.js";

/** 活动切片从边界消息本身开始算；不要求保留段时直接返回该切片。 */
export const compactActiveSessionMessages = (
  messages: MessageWithParts[],
  boundaryIndex: number,
  includePreservedSegment: boolean,
): MessageWithParts[] => {
  const active = messages.slice(boundaryIndex);
  if (!includePreservedSegment) return active;

  const boundary = findCompactBoundary(messages[boundaryIndex]!);
  const preserved = collectPreservedMessages(messages, boundaryIndex, boundary);
  if (preserved.length === 0) return active;

  const anchorId = boundary?.preservedSegment?.anchorMessageId;
  const anchorAt = active.findIndex((message) => message.info.id === anchorId);
  const insertAt = anchorAt >= 0 ? anchorAt + 1 : 1;
  return active.slice(0, insertAt).concat(preserved, active.slice(insertAt));
};

/** compaction part 的窄化判定：有边界载荷的才算。 */
type CompactionMarkerPart = Extract<MessagePart, { type: "compaction" }>;

const isCompactionMarker = (part: MessagePart): part is CompactionMarkerPart =>
  part.type === "compaction" && Boolean(part.compactBoundary);

/** 边界载荷来自消息里的 compaction part（可能没有）。 */
function findCompactBoundary(message: MessageWithParts): CompactBoundaryPayload | undefined {
  const marker = message.parts.find(isCompactionMarker);
  return marker?.compactBoundary;
}

/** 保留段 = head..tail 之间可保留的消息，按原序返回并清掉助手侧的 token 用量。 */
function collectPreservedMessages(
  messages: MessageWithParts[],
  boundaryIndex: number,
  boundary: CompactBoundaryPayload | undefined,
): MessageWithParts[] {
  const preservedSegment = boundary?.preservedSegment;
  if (preservedSegment === undefined) return [];

  const headAt = messages.findIndex(
    (message) => message.info.id === preservedSegment.headMessageId,
  );
  const tailAt = messages.findIndex(
    (message) => message.info.id === preservedSegment.tailMessageId,
  );
  const rangeUsable = headAt >= 0 && tailAt >= headAt && tailAt < boundaryIndex;
  if (!rangeUsable) return [];

  const preserved: MessageWithParts[] = [];
  for (const message of messages.slice(headAt, tailAt + 1)) {
    if (!isCompactPreservableSessionMessage(message)) continue;
    preserved.push(withInvalidatedUsage(message));
  }
  return preserved;
}

/** 助手消息的 token 用量在压缩后失效；其余角色原样返回同一个对象。 */
function withInvalidatedUsage(message: MessageWithParts): MessageWithParts {
  if (message.info.role !== "assistant") return message;
  const info = { ...message.info, tokens: invalidateRuntimeTokenUsage(message.info.tokens) };
  return { ...message, info };
}

/** 能否进入保留段：UI timeline 的 assistant 不算模型轮，隐藏语义与压缩 part 一律排除。 */
export const isCompactPreservableSessionMessage = (message: MessageWithParts): boolean => {
  if (message.info.semantics?.providerVisibility === "hidden") return false;
  const carriesCompactionPart = message.parts.some((part) => part.type === "compaction");
  if (carriesCompactionPart) return false;
  // 已选中的回信、任务结果与 attachment 并未进入 summary，冷恢复不能据此再丢一次。
  if (message.info.role === "assistant" && message.info.error) return false;
  const role = message.info.role;
  return role === "user" || role === "assistant";
};

/** 活动压缩边界 part：有载荷的直接算，没有载荷的只有缺 timelineStatus 才算。 */
export const isActiveCompactionBoundaryPart = (part: MessagePart): boolean => {
  if (part.type !== "compaction") return false;
  return Boolean(part.compactBoundary) || !part.timelineStatus;
};
