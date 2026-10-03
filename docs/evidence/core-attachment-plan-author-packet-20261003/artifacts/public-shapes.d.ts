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
// Original owner: apps/cli/packages/core/src/agent/turn-state.ts
export interface TurnAttachment {
    type: "file" | "image" | "video" | "pdf" | "url";
    path?: string;
    content?: string;
    sourceKind?: "clipboard-text";
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
}
// Original owner: apps/cli/packages/contracts/src/events/session.events.ts
export interface TurnAttachmentMeta {
    fileName: string;
    mime: string;
    bytes: number;
    ref?: string;
}
// Original owner: apps/cli/packages/core/src/runtime/types.ts
export interface ResolvedTurnAttachment {
    contentBlock: ModelMessageContentBlock;
    filename?: string;
    metadata: AttachmentStorageMetadata;
    mime: string;
    source?: FilePartSource;
    url: string;
}
export interface PreparedImageData {
    dataUrl: string;
    mediaType: string;
    metadata?: AttachmentStorageMetadata["image"];
}
export type RelevantTurnState = Pick<import("../deps.js").TurnState, "attachments">; // attachments?: TurnAttachment[]
export type ImageProcessorPort = import("../deps.js").ImageProcessorPort;
export type SessionStorePort = import("../deps.js").SessionStorePort;
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
