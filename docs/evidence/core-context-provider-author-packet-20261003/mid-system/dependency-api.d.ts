import type { RuntimeAttachmentEntry, RuntimeMessageEntry, ModelInputMessage } from '../../agent/message-history.js';
import type { SystemReminderSource } from '../../system-reminder/source.js';
// ../../agent/message-history.js:
export declare function isRuntimeAttachmentEntry(input:ModelInputMessage|RuntimeMessageEntry):input is RuntimeAttachmentEntry;
export declare function isKnownSystemReminderSource(value:unknown):value is SystemReminderSource;
// ../../system-reminder/source.js:
export declare function isMidConversationSystemSource(source:SystemReminderSource):boolean;
export declare function sanitizeSystemReminderBody(body:string|readonly string[]):string;
export declare function wrapSystemReminder(body:string|readonly string[]):string;
// ./provider-entry-origins.js:
export declare class ProviderEntryOrigins {
 get(entry:RuntimeMessageEntry):readonly RuntimeMessageEntry[];
 set(entry:RuntimeMessageEntry,inputs:readonly RuntimeMessageEntry[]):void;
 hasRealUser(entry:RuntimeMessageEntry):boolean;
 representative(entry:RuntimeMessageEntry):RuntimeMessageEntry|undefined;
}
export declare function isPresentedInput(entry:RuntimeMessageEntry):boolean;
