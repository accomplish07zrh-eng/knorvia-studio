// Body-free selected declaration fragments; owner-module boundaries retained.
// Referenced original imported types stay authoritative; fragments are not a standalone module.
// Original owner: apps/cli/packages/contracts/src/interfaces/shared.ts
export type SessionId = string & {
    readonly __brand: "SessionId";
};
export type TurnId = string & {
    readonly __brand: "TurnId";
};
export type ToolCallId = string & {
    readonly __brand: "ToolCallId";
};
export type MessageId = string & {
    readonly __brand: "MessageId";
};
export type PartId = string & {
    readonly __brand: "PartId";
};
// Original owner: apps/cli/packages/contracts/src/tracing/tracer.ts
export interface TraceContext {
    traceId: TraceId;
    queryId?: QueryId;
    spanId?: string;
    parentSpanId?: string;
    parentId?: string;
    sessionId?: SessionId;
    turnId?: TurnId;
    attributes?: Record<string, string | number | boolean>;
}
// Original owner: apps/cli/packages/contracts/src/model/index.ts
export type ModelMessageRole = "system" | "user" | "assistant" | "tool";
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
    providerExecuted?: boolean;
}
export type AttachmentKind = "local_file" | "resource" | "inline";
export interface AttachmentRef {
    id: string;
    kind: AttachmentKind;
    uri?: string;
    path?: string;
    mimeType?: string;
    sizeBytes?: number;
    sha256?: string;
    placeholder?: string;
}
export interface ModelTextContentBlock {
    type: "text";
    text: string;
}
export interface ModelReasoningContentBlock {
    type: "reasoning";
    text: string;
    providerOptions?: Record<string, unknown>;
}
export interface ModelImageContentBlock {
    type: "image";
    mediaType: string;
    dataUrl: string;
    detail?: "auto" | "low" | "high" | "original";
    source?: AttachmentRef;
}
export interface ModelFileContentBlock {
    type: "file";
    mediaType: string;
    name?: string;
    uri?: string;
    dataUrl?: string;
    text?: string;
    source?: AttachmentRef;
}
export interface ModelVideoContentBlock {
    type: "video";
    mediaType: string;
    dataUrl: string;
    source?: AttachmentRef;
}
export interface ModelResourceLinkContentBlock {
    type: "resource_link";
    uri: string;
    name?: string;
    title?: string;
}
export type ModelMessageContentBlock = ModelTextContentBlock | ModelReasoningContentBlock | ModelImageContentBlock | ModelVideoContentBlock | ModelFileContentBlock | ModelResourceLinkContentBlock;
export type ModelMessageContent = string | ModelMessageContentBlock[];
export interface ModelCacheControl {
    type: "ephemeral";
    ttl?: "5m" | "1h";
    scope?: "global" | "org";
}
export interface ModelInputMessage {
    role: ModelMessageRole;
    content: ModelMessageContent;
    cacheControl?: ModelCacheControl;
    toolCalls?: ModelToolCall[];
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    providerId?: ModelProviderId;
    modelId?: ModelId;
}
// Original owner: apps/cli/packages/contracts/src/interfaces/tool-artifact-store.port.ts
export type ToolArtifactRetention = "session" | "project" | "temporary";
export interface ToolArtifactWriteRequest {
    sessionId: SessionId;
    turnId?: TurnId;
    toolCallId: ToolCallId | string;
    toolName: string;
    content: string;
    contentType?: string;
    retention?: ToolArtifactRetention;
    trace?: TraceContext;
}
export interface ToolArtifactWriteResult {
    id: string;
    uri: string;
    path?: string;
    bytes: number;
    contentType: string;
    createdAt: Date;
}
export interface ToolArtifactReadRequest {
    uri: string;
    trace?: TraceContext;
}
export interface ToolArtifactReadResult {
    uri: string;
    content: string;
    contentType: string;
    bytes: number;
    path?: string;
}
export interface MediaAttachmentPathEnsureRequest {
    uri: string;
    mediaType: string;
}
export type MediaAttachmentPathResult = {
    status: "ready";
    path: string;
} | {
    status: "unsupported";
};
// Port subset is authoritative, not an implementation substitute.
export type RelevantToolArtifactStorePort = Pick<import("@knorvia/contracts").ToolArtifactStorePort, "writeToolResultArtifact" | "readToolResultArtifact" | "ensureMediaAttachmentPath">;
