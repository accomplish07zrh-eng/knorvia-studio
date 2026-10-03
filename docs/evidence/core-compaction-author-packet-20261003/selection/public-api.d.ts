import { CompactTrigger } from "../deps.js";
import type { TraceContext } from "../deps.js";
import { type RuntimeMessageEntry } from "../../agent/message-history.js";
interface CompactRetryLogger {
    warn(message: string, context?: Record<string, unknown>): void;
}
export interface CompactEntrySelection {
    entriesForSummary: RuntimeMessageEntry[];
    groupsPreserved: number;
    preservedEntries: RuntimeMessageEntry[];
    totalGroups: number;
}
export declare function selectCompactEntries(input: {
    entries: readonly RuntimeMessageEntry[];
    minimumGroupsToPreserve?: number;
    trigger: CompactTrigger;
}): CompactEntrySelection;
export declare function selectCompactEntriesAfterPromptTooLong(input: {
    entries: readonly RuntimeMessageEntry[];
    promptTooLongCause: unknown;
    trigger: CompactTrigger;
    useMidConversationSystem?: boolean;
    currentGroupsPreserved: number;
}): CompactEntrySelection | null;
export declare function selectCompactEntriesForInitialPromptTooLong(input: {
    entries: readonly RuntimeMessageEntry[];
    promptTooLongCause: unknown;
    trigger: CompactTrigger;
    useMidConversationSystem?: boolean;
}): CompactEntrySelection | null;
export declare function getRuntimeEntriesToSummarize(entries: readonly RuntimeMessageEntry[]): RuntimeMessageEntry[];
export declare function hasEnoughRuntimeEntriesToCompact(entries: readonly RuntimeMessageEntry[]): boolean;
export declare function estimateRuntimeEntryTokens(entries: readonly RuntimeMessageEntry[], options?: {
    useMidConversationSystem?: boolean;
}): number;
export declare function truncateCompactSummaryRequestEntriesAfterPromptTooLong(options: {
    attempt: number;
    cause: unknown;
    entriesForSummary: readonly RuntimeMessageEntry[];
    logger?: CompactRetryLogger;
    traceContext: TraceContext;
    useMidConversationSystem?: boolean;
}): RuntimeMessageEntry[] | null;
export {};
