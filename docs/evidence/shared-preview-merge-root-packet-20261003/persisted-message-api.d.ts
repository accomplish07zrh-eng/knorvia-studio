export type KnorviaPersistedMessagePart = {
    type: "content";
    content: string;
} | {
    type: "thought";
    content: string;
} | {
    type: "tool-call";
    toolIndex: number;
};
export interface KnorviaPersistedMessage {
    id?: string;
    mergedMessageIds?: string[];
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    goalIteration?: number;
    model?: string;
    characterCount?: number;
    durationMs?: number;
    interrupted?: boolean;
    feedback?: KnorviaAssistantMessageFeedback;
    attachments?: KnorviaPromptAttachment[];
    tools?: KnorviaPersistedToolCall[];
    thought?: string;
    parts?: KnorviaPersistedMessagePart[];
    checkpointState?: KnorviaAssistantCheckpointState;
    checkpointReason?: KnorviaAssistantCheckpointReason;
    checkpointUpdatedAt?: number;
    turnIndex?: number;
    bodyRefs?: KnorviaTaskSnapshotBodyRef[];
    toolSlice?: KnorviaTaskSnapshotToolSlice;
    syntheticTimeline?: KnorviaTimelineMeta;
}
