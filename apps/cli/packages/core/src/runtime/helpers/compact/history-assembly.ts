// SPDX-License-Identifier: Apache-2.0
// 压缩后的条目重建（B25 的重建半边）。
// 重建顺序固定：「元数据标记的上下文前缀 + 摘要 + 保留条目 + 压缩后提醒」，全部为克隆；
// 前缀只认 metadata 标记（避免用户 literal <system-reminder> 被文本规则误留），
// 保留的助手条目其 token 用量被标记为失效。同步纯计算，不改入参。
import {
  cloneRuntimeMessageEntry,
  invalidateRuntimeTokenUsage,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import { countContextPrefixMessages } from "../../deps.js";

export interface PostCompactRebuildOptions {
  postCompactReminderEntries?: /* 压缩后提醒：重建的收尾段 */ readonly RuntimeMessageEntry[];
  preservedEntries?: /* 压缩保留条目：token 用量会被标记失效 */ readonly RuntimeMessageEntry[];
}

// 保留条目的克隆：助手条目额外把 token 用量标记失效（保留 ≠ 继续计费）。
function clonePreservedEntry(item: RuntimeMessageEntry): RuntimeMessageEntry {
  const copy = cloneRuntimeMessageEntry(item);
  const usage =
    copy.kind !== "attachment" && copy.message.role === "assistant" ? copy.tokens : undefined;
  if (usage === undefined) {
    return copy;
  }
  return {
    ...copy,
    tokens: invalidateRuntimeTokenUsage(usage),
  } as RuntimeMessageEntry;
}

export const buildPostCompactRuntimeEntries = (
  turnEntries: readonly RuntimeMessageEntry[],
  summary: RuntimeMessageEntry,
  settings: PostCompactRebuildOptions = {},
): RuntimeMessageEntry[] => {
  const headCount = countContextPrefixMessages(turnEntries);
  const headClones = turnEntries.slice(0, headCount).map((item) => cloneRuntimeMessageEntry(item));
  const keptClones = (settings.preservedEntries ?? []).map((item) => clonePreservedEntry(item));
  const reminderClones = (settings.postCompactReminderEntries ?? []).map((item) =>
    cloneRuntimeMessageEntry(item),
  );
  return [...headClones, cloneRuntimeMessageEntry(summary), ...keptClones, ...reminderClones];
};
