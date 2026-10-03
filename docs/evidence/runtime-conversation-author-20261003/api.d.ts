import { type RuntimeMessageEntry } from "../../agent/message-history.js";
import type { MessageId, MessageWithParts, ModelMessageContent } from "../deps.js";
import type { ResolvedTurnAttachment, RunModelTextRequestOptions } from "../types.js";
export declare function getLatestActiveSessionMessageId(messages: MessageWithParts[], options?: {
    branchCutAfterMessageId?: MessageId;
    rewindCreatedMessageId?: MessageId;
    rewindKeptMessageIds?: readonly MessageId[];
    rewindTargetMessageId?: MessageId;
}): MessageId | undefined;
export declare function findLatestRealUserMessageIndex(messages: RunModelTextRequestOptions["messages"]): number;
export declare function isMetaUserContextMessage(message: RunModelTextRequestOptions["messages"][number]): boolean;
export declare function buildUserContentFromTurn(input: string, attachments: ResolvedTurnAttachment[]): ModelMessageContent;
export declare function buildRuntimeUserEntriesFromTurn(input: string, attachments: ResolvedTurnAttachment[], options?: {
    browserAmbientContext?: {
        tabCount: number;
        currentUrl?: string;
    };
}): RuntimeMessageEntry[];
