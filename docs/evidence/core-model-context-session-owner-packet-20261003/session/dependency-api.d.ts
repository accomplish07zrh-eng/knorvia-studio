// Public dependencies remain opaque at their original owners; not standalone compilation.
// Original type owner: apps/cli/packages/core/src/agent/session-history-hydrator.ts
import type { MessageWithParts, MessageId, ToolArtifactStorePort } from "@knorvia/contracts";
import { type MessageHistory } from "./message-history.js";
export declare function activeSessionMessages(messages: MessageWithParts[], options?: {
    branchCutAfterMessageId?: MessageId;
    includeCompactPreservedSegment?: boolean;
    rewindCreatedMessageId?: MessageId;
    rewindKeptMessageIds?: readonly MessageId[];
    rewindTargetMessageId?: MessageId;
}): MessageWithParts[];
// Original type owner: apps/cli/packages/core/src/session-context/parts.ts
import { type MessagePart } from "@knorvia/contracts";
export declare function formatPartForContext(part: MessagePart): string | null;
export declare function dedupeParts(parts: MessagePart[]): MessagePart[];
// Original type owner: apps/cli/packages/core/src/session-context/utils.ts
export declare function truncateText(text: string, maxChars: number): string;
// Original type owner: apps/cli/packages/core/src/session-context/references.ts
import { type SessionId } from "@knorvia/contracts";
export declare function extractSessionReferences(input: string): SessionId[];
export declare function buildReferencedSessionContextReminderBody(input: string): string | null;
