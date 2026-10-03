// Original type owner: apps/cli/packages/core/src/tool/types.ts
export interface ReadFileStateEntry {
    path: string;
    content: string;
    offset?: number;
    limit?: number;
    isPartialView: boolean;
    readAt: Date;
    sourceTool?: "Read" | "Write" | "Edit";
    revisionId?: string;
    mtimeMs?: number;
    sizeBytes?: number;
}
export type ReadFileStateMap = Map<string, ReadFileStateEntry>;

// Original type owner: apps/cli/packages/core/src/agent/message-history.ts
export interface ToolCallInput {
    id: string;
    name: string;
    input: unknown;
}
export interface ModelInputMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: ModelMessageContent;
    cacheControl?: ModelCacheControl;
    toolCalls?: ToolCallInput[];
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    providerId?: Model["providerId"];
    modelId?: Model["modelId"];
}
export type RuntimeMessageSource = SystemReminderSource | "shared_context" | "real_user" | "legacy_synthetic";
export interface RuntimeMessageMetadata {
    source: RuntimeMessageSource;
    inputPresentation?: RuntimeInputPresentation;
}
export interface RuntimeMessageMessageEntry {
    kind?: "message";
    message: ModelInputMessage;
    metadata?: RuntimeMessageMetadata;
    tokens?: TokenUsageInfo;
    queryScope?: "output_token_continuation";
}
export interface RuntimeAttachmentEntry {
    kind: "attachment";
    content: string;
    cacheControl?: ModelCacheControl;
    metadata: RuntimeMessageMetadata;
}
export type RuntimeMessageEntry = RuntimeMessageMessageEntry | RuntimeAttachmentEntry;
export type ModelCacheControl = import("@knorvia/contracts").ModelCacheControl;
export type ModelMessageContent = import("@knorvia/contracts").ModelMessageContent;
export type Model = import("@knorvia/contracts").Model;
export type RuntimeInputPresentation = import("@knorvia/contracts").RuntimeInputPresentation;
export type TokenUsageInfo = import("@knorvia/contracts").TokenUsageInfo;
export type SystemReminderSource = import("../../system-reminder/source.js").SystemReminderSource;
