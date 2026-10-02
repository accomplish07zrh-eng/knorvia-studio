import type { MessageWithParts, MessageId, ToolArtifactStorePort } from "@knorvia/contracts";
import { type MessageHistory } from "./message-history.js";
export interface SessionHistoryHydrationResult {
    appliedMessageCount: number;
    interruptedToolCount: number;
    messageCount: number;
    partCount: number;
}
export declare function hydrateMessageHistoryFromSession(input: {
    artifactStore?: ToolArtifactStorePort;
    branchCutAfterMessageId?: MessageId;
    history: MessageHistory;
    messages: MessageWithParts[];
    rewindCreatedMessageId?: MessageId;
    rewindKeptMessageIds?: readonly MessageId[];
    rewindTargetMessageId?: MessageId;
}): Promise<SessionHistoryHydrationResult>;
export declare function activeSessionMessages(messages: MessageWithParts[], options?: {
    branchCutAfterMessageId?: MessageId;
    includeCompactPreservedSegment?: boolean;
    rewindCreatedMessageId?: MessageId;
    rewindKeptMessageIds?: readonly MessageId[];
    rewindTargetMessageId?: MessageId;
}): MessageWithParts[];
