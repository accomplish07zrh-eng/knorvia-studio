import type { RuntimeInputPresentation } from '@knorvia/contracts';
import type { RuntimeAttachmentEntry, RuntimeMessageEntry, ModelInputMessage } from '../../agent/message-history.js';
import type { SystemReminderSource } from '../../system-reminder/source.js';
// @knorvia/contracts:
export declare function parseRuntimeInputPresentation(value:unknown):RuntimeInputPresentation|undefined;
// ../../agent/message-history.js:
export declare function isRuntimeAttachmentEntry(input:ModelInputMessage|RuntimeMessageEntry):input is RuntimeAttachmentEntry;
// ../../system-reminder/incoming-message.js:
export declare function formatIncomingMessage(body:string,presentation:RuntimeInputPresentation):string;
export declare function isMidTurnInputPresentation(presentation:RuntimeInputPresentation):boolean;
// ../../system-reminder/source.js:
export declare function wrapSystemReminderForSource(source:SystemReminderSource,body:string|readonly string[]):string;
