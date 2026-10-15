// SPDX-License-Identifier: Apache-2.0
// 超长重试的选择与摘要截断（B26 的超长半边）。
// 差距解析：从错误链里找 `<实际> tokens > <上限>`（兼容千分位逗号），遍历
// message/errorDetails/details/body 与 cause/lastError/error，最多 6 层、防环。
// 超长续压：按「新到旧累计直到覆盖差距」算出要多保留的组数并推进保留进度，推不动返回 null；
// 首次超长要求 >3 组且能解析差距，保留数从 1 起步再加覆盖量；摘要重试截断从最旧开始丢组，
// 尝试次数到上限直接 null 并 warn。所有不满足条件的输入返回 null，不抛异常。
import {
  COMPACT_PROMPT_TOO_LONG_RETRY_MARKER,
  MAX_COMPACT_PROMPT_TOO_LONG_RETRIES,
  traceContextToLogContext,
  type CompactTrigger,
  type TraceContext,
} from "../../deps.js";
import {
  cloneRuntimeMessageEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";
import {
  entryRole,
  estimateRuntimeEntryTokens,
  groupEntries,
  hasEnoughRuntimeEntriesToCompact,
  isContextPrefix,
  isRetryMarker,
  selectCompactEntries,
  shouldPreserveRecent,
  splitEntries,
  type CompactEntrySelection,
} from "./entry-selection.js";

export interface CompactRetryLogger {
  warn(message: string, context?: Record<string, unknown>): void; // 只用 warn 一条
}

// 超长续压的请求面（字段名是兼容接口）。
export interface PromptTooLongContinueInput {
  entries: /* 当前压缩条目 */ readonly RuntimeMessageEntry[];
  promptTooLongCause: /* 超长错误链，差距从这里解析 */ unknown;
  trigger: CompactTrigger;
  useMidConversationSystem?: /* 投影开关：中途系统提醒归位 */ boolean;
  currentGroupsPreserved: /* 已保留的轮次数 */ number;
}

// 首次超长的请求面（字段名是兼容接口）。
export interface PromptTooLongInitialInput {
  entries: /* 当前压缩条目 */ readonly RuntimeMessageEntry[];
  promptTooLongCause: /* 超长错误链，差距从这里解析 */ unknown;
  trigger: CompactTrigger;
  useMidConversationSystem?: /* 投影开关：中途系统提醒归位 */ boolean;
}

// 一组助手起始轮次的只读条目。
type RoundGroup = readonly RuntimeMessageEntry[];

// 两条 warn 文案（逐字冻结）。
const RETRY_LIMIT_NOTICE = "Compact summary prompt was too long; retry limit reached";
const RETRY_DROP_NOTICE = "Compact summary prompt was too long; retrying with older rounds dropped";

// 差距文法：`<实际> tokens > <上限>`，两侧数字允许千分位逗号。
const TOKEN_GAP_PATTERN = /(\d[\d,]*)\s*tokens?\s*>\s*(\d[\d,]*)/i;
const THOUSANDS_SEPARATORS = /,/g;

// 错误链下钻时依次探查的文本字段。
const TEXT_FIELDS = ["message", "errorDetails", "details", "body"] as const;

function readTokenDeficit(raw: string): number | undefined {
  const match = TOKEN_GAP_PATTERN.exec(raw);
  if (match === null) return undefined;
  const [actual, limit] = [match[1], match[2]].map((part) =>
    Number(part.replace(THOUSANDS_SEPARATORS, "")),
  );
  const wellFormed = Number.isFinite(actual) && Number.isFinite(limit) && actual > limit;
  return wellFormed ? Math.ceil(actual - limit) : undefined;
}

// 错误链差距解析：文本字段逐个探查后沿 cause/lastError/error 下钻；
// 递归限 7 层（level 0..6），环路必然在限内走完并放弃，视为无差距。
function readChainDeficit(cause: unknown, level = 0): number | undefined {
  if (typeof cause === "string") return readTokenDeficit(cause);
  if (cause === null || typeof cause !== "object" || level > 6) return undefined;
  const fields = cause as Record<string, unknown>;
  for (const field of TEXT_FIELDS) {
    const value = fields[field];
    if (typeof value === "string") {
      const gap = readTokenDeficit(value);
      if (gap !== undefined) return gap;
    }
  }
  return readChainDeficit(fields.cause ?? fields.lastError ?? fields.error, level + 1);
}

// 覆盖差距所需的组数：从新到旧累计估算，覆盖到就停；
// 几乎要丢光（≥ 总组数-1）时退化成「至少留一半」的保守值。
function coverageCount(costs: readonly number[], groups: number, deficit: number): number {
  if (deficit <= 0 || groups <= 0) return 0;
  const newestFirst = [...costs].reverse();
  let budget = 0;
  let picked = 0;
  while (picked < groups && budget < deficit) {
    budget += newestFirst[picked] ?? 0;
    picked += 1;
  }
  const nearlyAll = picked >= groups - 1;
  return nearlyAll ? Math.max(1, Math.floor(groups / 2)) : Math.max(1, picked);
}

export const selectCompactEntriesAfterPromptTooLong = (
  input: PromptTooLongContinueInput,
): CompactEntrySelection | null => {
  const rounds = splitEntries(input.entries).groups;
  const cap = rounds.length - 1;
  const eligible = shouldPreserveRecent(input.trigger) && rounds.length >= 2;
  if (!eligible || input.currentGroupsPreserved >= cap) return null;
  const reviewed = rounds.slice(0, rounds.length - input.currentGroupsPreserved);
  if (reviewed.length < 2) return null;

  const deficit = readChainDeficit(input.promptTooLongCause);
  let step = 1;
  if (deficit !== undefined) {
    const costs = reviewed.map((round) =>
      estimateRuntimeEntryTokens(round, {
        useMidConversationSystem: input.useMidConversationSystem,
      }),
    );
    step = coverageCount(costs, reviewed.length, deficit);
  }
  const targetCount = Math.min(cap, input.currentGroupsPreserved + step);
  if (targetCount <= input.currentGroupsPreserved) return null;
  const pick = selectCompactEntries({
    entries: input.entries,
    minimumGroupsToPreserve: targetCount,
    trigger: input.trigger,
  });
  return hasEnoughRuntimeEntriesToCompact(pick.entriesForSummary) ? pick : null;
};

export const selectCompactEntriesForInitialPromptTooLong = (
  input: PromptTooLongInitialInput,
): CompactEntrySelection | null => {
  const rounds = splitEntries(input.entries).groups;
  const eligible = shouldPreserveRecent(input.trigger) && rounds.length > 3;
  if (!eligible) return null;
  const deficit = readChainDeficit(input.promptTooLongCause);
  if (deficit === undefined) return null;

  const costs = rounds.map((round) =>
    estimateRuntimeEntryTokens(round, {
      useMidConversationSystem: input.useMidConversationSystem,
    }),
  );
  // 最新一组天然保留：差距先扣掉它的体量，剩下的才从旧往新覆盖。
  const coveredByNewest = costs[costs.length - 1] ?? 0;
  const remainingDeficit = deficit - coveredByNewest;
  if (remainingDeficit <= 0) return null;
  const extra = coverageCount(costs.slice(0, -1), rounds.length - 1, remainingDeficit);
  const pick = selectCompactEntries({
    entries: input.entries,
    minimumGroupsToPreserve: 1 + extra,
    trigger: input.trigger,
  });
  return hasEnoughRuntimeEntriesToCompact(pick.entriesForSummary) ? pick : null;
};

// 从最旧轮次累计估算，覆盖差距即停，返回要丢的组数。
function dropCountFor(rounds: readonly RoundGroup[], deficit: number, mid?: boolean): number {
  let covered = 0;
  let cursor = 0;
  while (cursor < rounds.length && covered < deficit) {
    covered += estimateRuntimeEntryTokens(rounds[cursor], { useMidConversationSystem: mid });
    cursor += 1;
  }
  return cursor;
}

// 摘要截断：前缀保留在最前；差距可解析就从最旧累计丢到覆盖，否则固定丢 20% 组数；
// 丢完若以助手开头，补一条重试标记用户条目（纯用户条目，不带 metadata）。
function truncateSummaryEntries(
  entries: readonly RuntimeMessageEntry[],
  cause: unknown,
  useMidConversationSystem: boolean | undefined,
): RuntimeMessageEntry[] | null {
  const firstBody = entries.findIndex((item) => !isContextPrefix(item));
  const boundary = firstBody === -1 ? entries.length : firstBody;
  const keptPrefix = entries.slice(0, boundary).map((item) => cloneRuntimeMessageEntry(item));
  const body = entries.slice(boundary);
  const withoutMarker = body.length > 0 && isRetryMarker(body[0]) ? body.slice(1) : body;
  const rounds = groupEntries(withoutMarker);
  if (rounds.length < 2) return null;

  const deficit = readChainDeficit(cause);
  const wanted =
    deficit === undefined
      ? Math.max(1, Math.floor(rounds.length * 0.2))
      : dropCountFor(rounds, deficit, useMidConversationSystem);
  const dropCount = Math.min(wanted, rounds.length - 1);
  if (dropCount < 1) return null;

  const survivors = rounds
    .slice(dropCount)
    .flat()
    .map((item) => cloneRuntimeMessageEntry(item));
  if (survivors.length === 0) return null;
  if (entryRole(survivors[0]) === "assistant") {
    survivors.unshift({ message: { role: "user", content: COMPACT_PROMPT_TOO_LONG_RETRY_MARKER } });
  }
  return [...keptPrefix, ...survivors];
}

export const truncateCompactSummaryRequestEntriesAfterPromptTooLong = (request: {
  attempt: number;
  cause: unknown;
  entriesForSummary: readonly RuntimeMessageEntry[];
  logger?: CompactRetryLogger;
  traceContext: TraceContext;
  useMidConversationSystem?: boolean;
}): RuntimeMessageEntry[] | null => {
  if (request.attempt >= MAX_COMPACT_PROMPT_TOO_LONG_RETRIES) {
    request.logger?.warn(RETRY_LIMIT_NOTICE, {
      ...traceContextToLogContext(request.traceContext),
      attempt: request.attempt,
      event: "compact.prompt_too_long.retry_limit", // 事件名逐字冻结
      maxAttempts: MAX_COMPACT_PROMPT_TOO_LONG_RETRIES,
      module: "core.runtime", // 模块归属是观测契约字段
      remainingMessages: request.entriesForSummary.length,
    });
    return null; // 到上限不再截断
  }
  const truncated = truncateSummaryEntries(
    request.entriesForSummary,
    request.cause,
    request.useMidConversationSystem,
  );
  if (truncated === null) return null; // 截不动就不重试
  request.logger?.warn(RETRY_DROP_NOTICE, {
    ...traceContextToLogContext(request.traceContext),
    attempt: request.attempt + 1,
    droppedMessages: request.entriesForSummary.length - truncated.length,
    event: "compact.prompt_too_long.retry", // 事件名逐字冻结
    maxAttempts: MAX_COMPACT_PROMPT_TOO_LONG_RETRIES,
    module: "core.runtime", // 模块归属是观测契约字段
    remainingMessages: truncated.length,
  });
  return truncated;
};
