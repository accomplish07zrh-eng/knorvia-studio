import type { FilePart } from "@knorvia/contracts";
import type { MessageId, ModelMessageContent, SessionId, SessionStorePort, ToolArtifactStorePort, TraceContext, TurnId } from "../deps.js";
type PersistedToolMediaLayoutEntry = {
    type: "attachment";
    attachmentIndex: number;
} | {
    type: "text";
    text: string;
};
export declare function persistToolResultMediaAttachments(input: {
    artifactStore?: ToolArtifactStorePort;
    assistantMessageId: MessageId;
    content: ModelMessageContent;
    sessionId: SessionId;
    sessionStore?: SessionStorePort;
    signal?: AbortSignal;
    toolCallId: string;
    toolName: string;
    traceContext: TraceContext;
    turnId: TurnId;
}): Promise<{
    attachments: FilePart[];
    modelContentLayout: PersistedToolMediaLayoutEntry[];
} | undefined>;
export {};
