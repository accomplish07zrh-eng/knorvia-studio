// SPDX-License-Identifier: Apache-2.0
// 活跃会话分支裁剪：runtime resume、cold projection 与 stable fork 共用同一段逻辑（B7）。
//
// 组织方式（替换阶段的自主决定）：把「保留哪些消息」与「从哪条消息起追加」拆成两个纯函数，
// 主函数只负责按选项顺序组合，避免旧实现里四层嵌套分支继续增长。
import type { MessageId } from "../interfaces/shared.js";
import type { ActiveConversationBranchOptions } from "./payload-schemas.js";

type Identified = { info: { id: MessageId } };

// 从指定下标起的消息副本；下标无效时返回空数组。
function tailFrom<T>(messages: readonly T[], index: number): T[] {
  if (index < 0) return [];
  return [...messages.slice(index)];
}

// 保留集合：给了 keptMessageIds 就按 id 取（未知 id 忽略），否则取目标之前的消息；
// 目标不在列表里时保留原列表（调用方随后按 created/branch cut 决定追加）。
function collectKept<T extends Identified>(
  messages: readonly T[],
  options: ActiveConversationBranchOptions,
  indexById: Map<MessageId, T>,
  targetIndex: number,
): T[] {
  const keptIds = options.rewindKeptMessageIds;
  if (keptIds) {
    const collected: T[] = [];
    for (const messageId of keptIds) {
      const message = indexById.get(messageId);
      if (message !== undefined) collected.push(message);
    }
    return collected;
  }
  if (targetIndex < 0) return [...messages];
  return [...messages.slice(0, targetIndex)];
}

export function selectActiveConversationBranch<T extends Identified>(
  messages: readonly T[],
  options: ActiveConversationBranchOptions = {},
): T[] {
  const targetId = options.rewindTargetMessageId;
  if (!targetId) return [...messages];

  const indexById = new Map<MessageId, T>();
  for (const message of messages) indexById.set(message.info.id, message);
  const targetIndex = messages.findIndex((message) => message.info.id === targetId);
  const kept = collectKept(messages, options, indexById, targetIndex);

  // branch cut 游标直接指向提交前 transcript 尾部；之后追加的 canonical message 属于新分支，
  // 旧分支仍留在 append-only store 里。
  const cutId = options.branchCutAfterMessageId;
  if (cutId) {
    const cutIndex = messages.findIndex((message) => message.info.id === cutId);
    return cutIndex < 0 ? kept : [...kept, ...messages.slice(cutIndex + 1)];
  }

  const createdId = options.rewindCreatedMessageId;
  if (!createdId) {
    // 没有 created 消息：keptIds 场景只返回保留集合；否则目标缺失时返回原列表。
    if (options.rewindKeptMessageIds) return kept;
    return targetIndex < 0 ? [...messages] : kept;
  }
  const createdIndex = messages.findIndex((message) => message.info.id === createdId);
  return [...kept, ...tailFrom(messages, createdIndex)];
}
