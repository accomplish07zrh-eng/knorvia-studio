// SPDX-License-Identifier: Apache-2.0
// 压缩条目选择（B26 的基础选择半边）。
// 口径：上下文前缀单列（只认 metadata 标记），剩余按「助手起始轮次」分组；仅自动/反应式触发
// 保留最近轮次（至少 1 组且不超过 总组数-1），手动/部分/会话记忆保留 0 组。所有出口返回的
// 条目都是克隆；token 估算走提供方请求消息投影。同步纯计算，不抛异常、不修改入参。
import {
  COMPACT_PROMPT_TOO_LONG_RETRY_MARKER,
  CompactTrigger,
  countContextPrefixMessages,
  estimateMessageTokens,
  modelMessageContentToText,
} from "../../deps.js";
import {
  cloneRuntimeMessageEntry,
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import { groupByAssistantStartedRounds } from "../../../compact/rounds.js";
import { buildProviderRequestMessages } from "../provider-request-messages.js";

export interface CompactEntrySelection {
  entriesForSummary: RuntimeMessageEntry[];
  groupsPreserved: number;
  preservedEntries: RuntimeMessageEntry[];
  totalGroups: number;
}

// 无 metadata 用户消息的前缀兜底标记（逐字冻结）。
const PREFIX_TEXT_MARKER = "<system-reminder>";

// 「保留最近轮次」只对这两个触发生效。
const PRESERVE_RECENT_TRIGGERS: ReadonlySet<CompactTrigger> = new Set([
  CompactTrigger.Auto,
  CompactTrigger.Reactive,
]);

// 前缀来源：context_prefix 与 skills_listing 两类 metadata 标记。
function isPrefixSource(source: string): boolean {
  return source === "context_prefix" || source === "skills_listing";
}

// 条目的分组角色：附件条目按 user 计（它跟着所属用户轮次走）。
export function entryRole(item: RuntimeMessageEntry): string {
  return isRuntimeAttachmentEntry(item) ? "user" : item.message.role;
}

// 上下文前缀判定：metadata 标记的前缀来源、system 消息；无 metadata 的用户消息退化成
// `<system-reminder>` 文本前缀判定。
export function isContextPrefix(item: RuntimeMessageEntry): boolean {
  if (isRuntimeAttachmentEntry(item)) return isPrefixSource(item.metadata.source);
  if (item.message.role === "system") return true;
  if (item.message.role !== "user") return false;
  if (item.metadata) return isPrefixSource(item.metadata.source);
  return modelMessageContentToText(item.message.content).trimStart().startsWith(PREFIX_TEXT_MARKER);
}

// 超长重试标记条目：纯用户消息且正文等于固定标记串。
export function isRetryMarker(item: RuntimeMessageEntry): boolean {
  if (isRuntimeAttachmentEntry(item) || item.message.role !== "user") return false;
  return modelMessageContentToText(item.message.content) === COMPACT_PROMPT_TOO_LONG_RETRY_MARKER;
}

// 按助手起始轮次分组（复用压缩同一套分组口径）。
export function groupEntries(items: readonly RuntimeMessageEntry[]): RuntimeMessageEntry[][] {
  return groupByAssistantStartedRounds(items, entryRole);
}

// 前缀与轮次分组的切分：整段先克隆，前缀单列、其余分组。
export function splitEntries(items: readonly RuntimeMessageEntry[]): {
  prefix: RuntimeMessageEntry[];
  groups: RuntimeMessageEntry[][];
} {
  const copies = items.map((item) => cloneRuntimeMessageEntry(item));
  const headCount = countContextPrefixMessages(copies);
  const prefix = copies.slice(0, headCount);
  const groups = groupEntries(copies.slice(headCount));
  return { prefix, groups };
}

export function shouldPreserveRecent(trigger: CompactTrigger): boolean {
  return PRESERVE_RECENT_TRIGGERS.has(trigger);
}

// 最少保留组数的清洗：非有限数或负数一律当没给。
function normalizePreservedCount(count: number | undefined): number | undefined {
  if (count === undefined || !Number.isFinite(count) || count < 0) return undefined;
  return Math.floor(count);
}

export const selectCompactEntries = (input: {
  entries: readonly RuntimeMessageEntry[];
  minimumGroupsToPreserve?: number;
  trigger: CompactTrigger;
}): CompactEntrySelection => {
  const { entries, trigger } = input;
  const { prefix, groups } = splitEntries(entries);
  const keepRecent = shouldPreserveRecent(trigger);
  const floor = keepRecent && groups.length > 1 ? 1 : 0;
  const asked = Math.max(floor, normalizePreservedCount(input.minimumGroupsToPreserve) ?? 0);
  const cap = Math.max(0, groups.length - 1);
  const keptGroups = keepRecent ? Math.min(asked, cap) : 0;
  const reviewed = keptGroups > 0 ? groups.slice(0, groups.length - keptGroups) : groups;
  const retained = keptGroups > 0 ? groups.slice(groups.length - keptGroups) : [];
  return {
    entriesForSummary: [...prefix, ...reviewed.flat()].map((item) =>
      cloneRuntimeMessageEntry(item),
    ),
    groupsPreserved: keptGroups,
    preservedEntries: retained.flat().map((item) => cloneRuntimeMessageEntry(item)),
    totalGroups: groups.length,
  };
};

// 供摘要的条目：剔除上下文前缀，逐条克隆。
export const getRuntimeEntriesToSummarize = (
  items: readonly RuntimeMessageEntry[],
): RuntimeMessageEntry[] =>
  items.filter((item) => !isContextPrefix(item)).map((item) => cloneRuntimeMessageEntry(item));

// 是否够压缩：剔除前缀后 ≥2 组且至少含一个助手条目。
export const hasEnoughRuntimeEntriesToCompact = (
  items: readonly RuntimeMessageEntry[],
): boolean => {
  const body = getRuntimeEntriesToSummarize(items);
  const rounds = groupEntries(body);
  return rounds.length >= 2 && body.some((item) => entryRole(item) === "assistant");
};

// token 估算：按提供方请求消息投影后估算。
export const estimateRuntimeEntryTokens = (
  items: readonly RuntimeMessageEntry[],
  settings: { useMidConversationSystem?: boolean } = {},
): number => {
  const projection = buildProviderRequestMessages({
    entries: items,
    applyCacheControl: false,
    useMidConversationSystem: settings.useMidConversationSystem,
  });
  return estimateMessageTokens(projection.messages);
};
