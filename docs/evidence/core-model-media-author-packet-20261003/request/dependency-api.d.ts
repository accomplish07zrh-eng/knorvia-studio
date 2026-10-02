import type { ModelInputMessage, RuntimeMessageEntry } from "../../agent/message-history.js";
import type { ModelMessageContent } from "@knorvia/contracts";
import type { SystemReminderSource } from "../../system-reminder/source.js";
import { type RuntimeMessageEntry } from "../../agent/message-history.js";
export declare class ProviderEntryOrigins {
    get(entry: RuntimeMessageEntry): readonly RuntimeMessageEntry[];
    set(entry: RuntimeMessageEntry, inputs: readonly RuntimeMessageEntry[]): void;
    hasRealUser(entry: RuntimeMessageEntry): boolean;
    representative(entry: RuntimeMessageEntry): RuntimeMessageEntry | undefined;
}
export declare function isPresentedInput(entry: RuntimeMessageEntry): boolean;
export declare function projectIncomingMessageEntries(entries: readonly RuntimeMessageEntry[], origins: ProviderEntryOrigins): RuntimeMessageEntry[];
import type { ModelInputMessage, RuntimeMessageEntry, RuntimeMessageMessageEntry } from "../../agent/message-history.js";
import { type ProviderEntryOrigins } from "./provider-entry-origins.js";
interface MidSystemProjection {
    fallbackBody: string;
}
interface ProjectedMidSystemMessageEntry extends RuntimeMessageMessageEntry {
    midSystemProjection: MidSystemProjection;
}
export type ProjectedRuntimeMessageEntry = RuntimeMessageEntry | ProjectedMidSystemMessageEntry;
interface MidSystemProjectionResult {
    entries: ProjectedRuntimeMessageEntry[];
}
export declare function projectMidConversationSystemEntries(entries: readonly RuntimeMessageEntry[], origins: ProviderEntryOrigins): MidSystemProjectionResult;
export declare function moveLegacySystemRemindersAfterToolResultRun(entries: readonly ProjectedRuntimeMessageEntry[]): ProjectedRuntimeMessageEntry[];
export declare function isToolResultUserMessage(message: ModelInputMessage): boolean;
export {};

export declare function isKnownSystemReminderSource(value: unknown): value is SystemReminderSource;
export declare function isRuntimeAttachmentEntry(input: ModelInputMessage | RuntimeMessageEntry): input is RuntimeAttachmentEntry;
export declare function cloneModelMessageContent(content: ModelMessageContent): ModelMessageContent;
export declare function cloneModelInputMessage(message: ModelInputMessage): ModelInputMessage;
export declare function getSystemReminderDescriptor(source: SystemReminderSource): SystemReminderSourceDescriptor;
export declare function isMidConversationSystemSource(source: SystemReminderSource): boolean;
export declare function wrapSystemReminderForSource(source: SystemReminderSource, body: string | readonly string[]): string;
