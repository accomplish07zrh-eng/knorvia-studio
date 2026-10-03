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
