import {
  COMPACT_PROMPT_TOO_LONG_RETRY_MARKER,
  MAX_COMPACT_PROMPT_TOO_LONG_RETRIES,
  CompactTrigger,
  countContextPrefixMessages,
  estimateMessageTokens,
  modelMessageContentToText,
  traceContextToLogContext,
  type TraceContext,
} from "../deps.js";
import {
  cloneRuntimeMessageEntry,
  isRuntimeAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";
import { groupByAssistantStartedRounds } from "../../compact/rounds.js";
import { buildProviderRequestMessages } from "./provider-request-messages.js";

interface CompactRetryLogger {
  warn(message: string, context?: Record<string, unknown>): void;
}

export interface CompactEntrySelection {
  entriesForSummary: RuntimeMessageEntry[];
  groupsPreserved: number;
  preservedEntries: RuntimeMessageEntry[];
  totalGroups: number;
}

function entryRole(entry: RuntimeMessageEntry): string {
  return isRuntimeAttachmentEntry(entry) ? "user" : entry.message.role;
}

function isContextPrefix(entry: RuntimeMessageEntry): boolean {
  if (isRuntimeAttachmentEntry(entry)) {
    return entry.metadata.source === "context_prefix" || entry.metadata.source === "skills_listing";
  }
  if (entry.message.role === "system") return true;
  if (entry.message.role !== "user") return false;
  if (entry.metadata) {
    return entry.metadata.source === "context_prefix" || entry.metadata.source === "skills_listing";
  }
  return modelMessageContentToText(entry.message.content)
    .trimStart()
    .startsWith("<system-reminder>");
}

function isRetryMarker(entry: RuntimeMessageEntry): boolean {
  return (
    !isRuntimeAttachmentEntry(entry) &&
    entry.message.role === "user" &&
    modelMessageContentToText(entry.message.content) === COMPACT_PROMPT_TOO_LONG_RETRY_MARKER
  );
}

function groupEntries(entries: readonly RuntimeMessageEntry[]): RuntimeMessageEntry[][] {
  return groupByAssistantStartedRounds(entries, entryRole);
}

function splitEntries(entries: readonly RuntimeMessageEntry[]): {
  prefix: RuntimeMessageEntry[];
  groups: RuntimeMessageEntry[][];
} {
  const cloned = entries.map((entry) => cloneRuntimeMessageEntry(entry));
  const prefixCount = countContextPrefixMessages(cloned);
  const prefix = cloned.slice(0, prefixCount);
  const groups = groupEntries(cloned.slice(prefixCount));
  return { prefix, groups };
}

function shouldPreserveRecent(trigger: CompactTrigger): boolean {
  return trigger === CompactTrigger.Auto || trigger === CompactTrigger.Reactive;
}

function normalizePreservedCount(count: number | undefined): number | undefined {
  return count !== undefined && Number.isFinite(count) && count >= 0
    ? Math.floor(count)
    : undefined;
}

export function selectCompactEntries(input: {
  entries: readonly RuntimeMessageEntry[];
  minimumGroupsToPreserve?: number;
  trigger: CompactTrigger;
}): CompactEntrySelection {
  const { entries, trigger } = input;
  const { prefix, groups } = splitEntries(entries);
  const preserve = shouldPreserveRecent(trigger);
  const base = preserve && groups.length > 1 ? 1 : 0;
  const requested = Math.max(base, normalizePreservedCount(input.minimumGroupsToPreserve) ?? 0);
  const maximum = Math.max(0, groups.length - 1);
  const groupsPreserved = preserve ? Math.min(requested, maximum) : 0;
  const summaryGroups =
    groupsPreserved > 0 ? groups.slice(0, groups.length - groupsPreserved) : groups;
  const preservedGroups = groupsPreserved > 0 ? groups.slice(groups.length - groupsPreserved) : [];
  return {
    entriesForSummary: [...prefix, ...summaryGroups.flat()].map((entry) =>
      cloneRuntimeMessageEntry(entry),
    ),
    groupsPreserved,
    preservedEntries: preservedGroups.flat().map((entry) => cloneRuntimeMessageEntry(entry)),
    totalGroups: groups.length,
  };
}

export function getRuntimeEntriesToSummarize(
  entries: readonly RuntimeMessageEntry[],
): RuntimeMessageEntry[] {
  return entries
    .filter((entry) => !isContextPrefix(entry))
    .map((entry) => cloneRuntimeMessageEntry(entry));
}

export function hasEnoughRuntimeEntriesToCompact(entries: readonly RuntimeMessageEntry[]): boolean {
  const retained = getRuntimeEntriesToSummarize(entries);
  const groups = groupEntries(retained);
  return groups.length >= 2 && retained.some((entry) => entryRole(entry) === "assistant");
}

export function estimateRuntimeEntryTokens(
  entries: readonly RuntimeMessageEntry[],
  options: { useMidConversationSystem?: boolean } = {},
): number {
  const request = buildProviderRequestMessages({
    entries,
    applyCacheControl: false,
    useMidConversationSystem: options.useMidConversationSystem,
  });
  return estimateMessageTokens(request.messages);
}

function parseTokenGap(text: string): number | undefined {
  const match = /(\d[\d,]*)\s*tokens?\s*>\s*(\d[\d,]*)/i.exec(text);
  if (!match) return undefined;
  const actual = Number(match[1].replace(/,/g, ""));
  const limit = Number(match[2].replace(/,/g, ""));
  return Number.isFinite(actual) && Number.isFinite(limit) && actual > limit
    ? Math.ceil(actual - limit)
    : undefined;
}

function extractTokenGap(cause: unknown): number | undefined {
  const seen = new WeakSet<object>();
  let current = cause;
  for (let depth = 0; depth <= 6; depth += 1) {
    if (typeof current === "string") return parseTokenGap(current);
    if (current === null || typeof current !== "object") return undefined;
    if (seen.has(current)) return undefined;
    seen.add(current);
    const record = current as Record<string, unknown>;
    for (const field of ["message", "errorDetails", "details", "body"]) {
      const value = record[field];
      if (typeof value === "string") {
        const gap = parseTokenGap(value);
        if (gap !== undefined) return gap;
      }
    }
    current = record.cause ?? record.lastError ?? record.error;
  }
  return undefined;
}

function newestCoverageCount(
  estimates: readonly number[],
  groupCount: number,
  gap: number,
): number {
  if (gap <= 0 || groupCount <= 0) return 0;
  let covered = 0;
  let counted = 0;
  for (let index = groupCount - 1; index >= 0; index -= 1) {
    covered += estimates[index] ?? 0;
    counted += 1;
    if (covered >= gap) break;
  }
  return counted >= groupCount - 1 ? Math.max(1, Math.floor(groupCount / 2)) : Math.max(1, counted);
}

export function selectCompactEntriesAfterPromptTooLong(input: {
  entries: readonly RuntimeMessageEntry[];
  promptTooLongCause: unknown;
  trigger: CompactTrigger;
  useMidConversationSystem?: boolean;
  currentGroupsPreserved: number;
}): CompactEntrySelection | null {
  const { entries, trigger } = input;
  const { groups } = splitEntries(entries);
  if (!shouldPreserveRecent(trigger) || groups.length < 2) return null;
  const maximum = groups.length - 1;
  if (input.currentGroupsPreserved >= maximum) return null;
  const summaryGroups = groups.slice(0, groups.length - input.currentGroupsPreserved);
  if (summaryGroups.length < 2) return null;
  const useMidConversationSystem = input.useMidConversationSystem;
  const gap = extractTokenGap(input.promptTooLongCause);
  let moveCount = 1;
  if (gap !== undefined) {
    const estimates = summaryGroups.map((group) =>
      estimateRuntimeEntryTokens(group, {
        useMidConversationSystem,
      }),
    );
    moveCount = newestCoverageCount(estimates, summaryGroups.length, gap);
  }
  const nextCount = Math.min(maximum, input.currentGroupsPreserved + moveCount);
  if (nextCount <= input.currentGroupsPreserved) return null;
  const selection = selectCompactEntries({
    entries: input.entries,
    minimumGroupsToPreserve: nextCount,
    trigger: input.trigger,
  });
  return hasEnoughRuntimeEntriesToCompact(selection.entriesForSummary) ? selection : null;
}

export function selectCompactEntriesForInitialPromptTooLong(input: {
  entries: readonly RuntimeMessageEntry[];
  promptTooLongCause: unknown;
  trigger: CompactTrigger;
  useMidConversationSystem?: boolean;
}): CompactEntrySelection | null {
  const { entries, trigger } = input;
  const { groups } = splitEntries(entries);
  if (!shouldPreserveRecent(trigger) || groups.length <= 3) return null;
  const gap = extractTokenGap(input.promptTooLongCause);
  if (gap === undefined) return null;
  const useMidConversationSystem = input.useMidConversationSystem;
  const estimates = groups.map((group) =>
    estimateRuntimeEntryTokens(group, {
      useMidConversationSystem,
    }),
  );
  const alreadyPreserved = estimates[estimates.length - 1] ?? 0;
  const remainingGap = gap - alreadyPreserved;
  if (remainingGap <= 0) return null;
  const additional = newestCoverageCount(estimates.slice(0, -1), groups.length - 1, remainingGap);
  const selection = selectCompactEntries({
    entries: input.entries,
    minimumGroupsToPreserve: 1 + additional,
    trigger: input.trigger,
  });
  return hasEnoughRuntimeEntriesToCompact(selection.entriesForSummary) ? selection : null;
}

function truncateSummaryEntries(
  entries: readonly RuntimeMessageEntry[],
  cause: unknown,
  useMidConversationSystem: boolean | undefined,
): RuntimeMessageEntry[] | null {
  const prefix: RuntimeMessageEntry[] = [];
  let prefixCount = 0;
  while (prefixCount < entries.length && isContextPrefix(entries[prefixCount])) {
    prefix.push(cloneRuntimeMessageEntry(entries[prefixCount]));
    prefixCount += 1;
  }
  const candidates = entries.slice(prefixCount);
  if (candidates.length > 0 && isRetryMarker(candidates[0])) candidates.shift();
  const groups = groupEntries(candidates);
  if (groups.length < 2) return null;
  const gap = extractTokenGap(cause);
  let dropCount = 0;
  if (gap === undefined) {
    dropCount = Math.max(1, Math.floor(groups.length * 0.2));
  } else {
    let covered = 0;
    for (const group of groups) {
      covered += estimateRuntimeEntryTokens(group, {
        useMidConversationSystem,
      });
      dropCount += 1;
      if (covered >= gap) break;
    }
  }
  dropCount = Math.min(dropCount, groups.length - 1);
  if (dropCount < 1) return null;
  const sliced = groups
    .slice(dropCount)
    .flat()
    .map((entry) => cloneRuntimeMessageEntry(entry));
  if (sliced.length === 0) return null;
  if (entryRole(sliced[0]) === "assistant") {
    sliced.unshift({
      message: { role: "user", content: COMPACT_PROMPT_TOO_LONG_RETRY_MARKER },
    });
  }
  return [...prefix, ...sliced];
}

export function truncateCompactSummaryRequestEntriesAfterPromptTooLong(options: {
  attempt: number;
  cause: unknown;
  entriesForSummary: readonly RuntimeMessageEntry[];
  logger?: CompactRetryLogger;
  traceContext: TraceContext;
  useMidConversationSystem?: boolean;
}): RuntimeMessageEntry[] | null {
  if (options.attempt >= MAX_COMPACT_PROMPT_TOO_LONG_RETRIES) {
    options.logger?.warn("Compact summary prompt was too long; retry limit reached", {
      ...traceContextToLogContext(options.traceContext),
      attempt: options.attempt,
      event: "compact.prompt_too_long.retry_limit",
      maxAttempts: MAX_COMPACT_PROMPT_TOO_LONG_RETRIES,
      module: "core.runtime",
      remainingMessages: options.entriesForSummary.length,
    });
    return null;
  }
  const entries = options.entriesForSummary;
  const cause = options.cause;
  const useMidConversationSystem = options.useMidConversationSystem;
  const truncated = truncateSummaryEntries(entries, cause, useMidConversationSystem);
  if (truncated === null) return null;
  options.logger?.warn("Compact summary prompt was too long; retrying with older rounds dropped", {
    ...traceContextToLogContext(options.traceContext),
    attempt: options.attempt + 1,
    droppedMessages: options.entriesForSummary.length - truncated.length,
    event: "compact.prompt_too_long.retry",
    maxAttempts: MAX_COMPACT_PROMPT_TOO_LONG_RETRIES,
    module: "core.runtime",
    remainingMessages: truncated.length,
  });
  return truncated;
}
