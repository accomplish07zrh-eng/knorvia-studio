// Public declarations only. Import actual symbols from these installed module paths.
import type { RuntimeMessageEntry, ModelInputMessage, RuntimeAttachmentEntry } from "../../agent/message-history.js";
import type { CompactModelMessage } from "../../compact/manual.js";
import type { TraceContext, ModelMessageContent } from "../deps.js";
import type { LogContext } from "@knorvia/contracts";

// ../deps.js named runtime/type exports (forward existing public implementations):
export declare const COMPACT_PROMPT_TOO_LONG_RETRY_MARKER: "[earlier conversation truncated for compaction retry]";
export declare const MAX_COMPACT_PROMPT_TOO_LONG_RETRIES = 3;
export declare const CompactTrigger: {
  readonly Manual: "manual"; readonly Auto: "auto"; readonly Partial: "partial";
  readonly Reactive: "reactive"; readonly SessionMemory: "session_memory";
};
export type CompactTrigger = (typeof CompactTrigger)[keyof typeof CompactTrigger];
export declare function countContextPrefixMessages(entries: readonly (ModelInputMessage | RuntimeMessageEntry)[]): number;
export declare function estimateMessageTokens(messages: readonly CompactModelMessage[]): number;
export declare function modelMessageContentToText(content: ModelMessageContent): string;
export declare function traceContextToLogContext(context: TraceContext): LogContext;

// ../../agent/message-history.js:
export declare function cloneRuntimeMessageEntry(entry: RuntimeMessageEntry): RuntimeMessageEntry;
export declare function isRuntimeAttachmentEntry(entry: ModelInputMessage | RuntimeMessageEntry): entry is RuntimeAttachmentEntry;

// ../../compact/rounds.js:
export declare function groupByAssistantStartedRounds<T>(items: readonly T[], roleOf: (item: T) => string | undefined, assistantIdOf?: (item: T) => string | undefined): T[][];

// ./provider-request-messages.js:
export declare function buildProviderRequestMessages(input: {
  entries: readonly RuntimeMessageEntry[]; applyCacheControl?: boolean;
  skipCacheWrite?: boolean; useMidConversationSystem?: boolean;
}): {
  messages: ModelInputMessage[]; sourceEntries: Array<RuntimeMessageEntry | undefined>;
  diagnostics: { bubbledAttachmentEntryCount: number; latestRealUserMessageIndex?: number;
    strippedRuntimeMetaCount: number; cacheControlIndex?: number };
};
