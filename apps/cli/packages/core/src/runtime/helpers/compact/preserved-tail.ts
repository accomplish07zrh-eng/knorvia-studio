// SPDX-License-Identifier: Apache-2.0
// 压缩保留区间的持久化选择（B27）。
// 保留轮次 ≤0 直接返回 `keptMessageCount: 0`（根本不读存储）；否则并发读会话消息与会话记录，
// 按回滚点过滤活跃消息再过可保留性，复用与压缩一致的助手分组取**最后 N 组**，产出
// {anchor=摘要 id, head=首条 id, tail=末条 id} 的保留区间与保留条数。
// 纯条目统计只数「非 queryScope 的助手/用户条目」以及来源属于可持久化系统提醒的附件条目
// （无 SessionStore 时仅用于统计，不能用此数量选择持久化区间）。
import type {
  CompactPreservedSegment,
  MessageId,
  SessionId,
  SessionStorePort,
} from "@knorvia/contracts";
import { isCompactPreservableSessionMessage } from "../../../agent/compact-session.js";
import { activeSessionMessages } from "../../../agent/session-history-hydrator.js";
import {
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import { groupByAssistantStartedRounds } from "../../../compact/rounds.js";
import { SYSTEM_REMINDER_PERSISTED_SOURCES } from "../../../system-reminder/source.js";

export interface PersistedTailRequest {
  sessionStore: /* 会话存储端口 */ SessionStorePort;
  sessionId: /* 会话 id */ SessionId;
  summaryMessageId: /* 摘要消息 id，作为区间锚点 */ MessageId;
  groupsPreserved: /* 要保留的助手轮次数 */ number;
}

export interface PersistedTailResult {
  preservedSegment?: CompactPreservedSegment;
  keptMessageCount: number;
}

export const selectPersistedCompactTail = async (
  request: PersistedTailRequest,
): Promise<PersistedTailResult> => {
  if (request.groupsPreserved <= 0) return { keptMessageCount: 0 };
  // 消息与会话记录并发读取（行为契约）。
  const [messages, record] = await Promise.all([
    request.sessionStore.messages({ sessionID: request.sessionId }),
    request.sessionStore.getSession(request.sessionId),
  ]);
  const rollback = record?.revert;
  const hydrated = activeSessionMessages(messages, {
    branchCutAfterMessageId: rollback?.branchCutAfterMessageID,
    rewindCreatedMessageId: rollback?.createdMessageID,
    rewindKeptMessageIds: rollback?.keptMessageIDs,
    rewindTargetMessageId: rollback?.targetMessageID,
  });
  // 回滚点之后的消息先剔掉，再过「可持久化」筛选。
  const visible = hydrated.filter((stored) => isCompactPreservableSessionMessage(stored));
  // 数量口径只信助手分组的选定结果：runtime 与存储两侧的 user/attachment 计数天然不齐，
  // synthetic 来源一变还会再错位。
  const rounds = groupByAssistantStartedRounds(visible, (stored) => stored.info.role);
  const tailMessages = rounds.slice(-request.groupsPreserved).flat();
  if (tailMessages.length === 0) return { keptMessageCount: 0 };
  const preservedSegment = {
    anchorMessageId: request.summaryMessageId,
    headMessageId: tailMessages[0]!.info.id,
    tailMessageId: tailMessages.at(-1)!.info.id,
  };
  return {
    keptMessageCount: tailMessages.length,
    preservedSegment,
  };
};

// 纯条目统计：非 queryScope 的助手/用户条目 + 可持久化系统提醒的附件条目。
export const countCompactPreservedRuntimeMessages = (
  items: readonly RuntimeMessageEntry[],
): number => {
  let counted = 0;
  for (const item of items) {
    const countable = isRuntimeAttachmentEntry(item)
      ? SYSTEM_REMINDER_PERSISTED_SOURCES.some((source) => source === item.metadata.source)
      : !item.queryScope && (item.message.role === "assistant" || item.message.role === "user");
    if (countable) counted += 1;
  }
  return counted;
};
