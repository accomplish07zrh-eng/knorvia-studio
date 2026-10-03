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
// Original owner: apps/cli/packages/contracts/src/interfaces/session-store.port.ts
export type FilePartSource = {
    type: "file";
    path: string;
    text: {
        value: string;
        start: number;
        end: number;
    };
} | {
    type: "symbol";
    path: string;
    range: unknown;
    name: string;
    kind: number;
    text: {
        value: string;
        start: number;
        end: number;
    };
} | {
    type: "resource";
    clientName: string;
    uri: string;
    text: {
        value: string;
        start: number;
        end: number;
    };
};
export interface AttachmentStorageMetadata {
    sizeBytes?: number;
    sha256?: string;
    image?: {
        maxDimension?: number;
        originalWidth?: number;
        originalHeight?: number;
        width?: number;
        height?: number;
        resized?: boolean;
        transformedSizeBytes?: number;
    };
    storageKind?: "inline" | "artifact" | "local_ref" | "remote_ref" | "metadata_only";
    artifactUri?: string;
    originalUrl?: string;
    recoverability?: "provider_ready" | "rebuildable" | "preview_only" | "metadata_only" | "missing";
    preview?: {
        text?: string;
        truncated?: boolean;
        originalBytes?: number;
        startLine?: number;
        totalLines?: number;
        truncatedByTokenCap?: boolean;
        partialViewNotice?: string;
    };
    errorCode?: string;
}
export interface FilePart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "file";
    mime: string;
    filename?: string;
    url: string;
    source?: FilePartSource;
    metadata?: AttachmentStorageMetadata;
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
// Original owner: apps/cli/packages/contracts/src/interfaces/file-system.port.ts
export type FileSystemErrorCode = "not_found" | "permission_denied" | "is_directory" | "not_file" | "too_large" | "stale_write" | "invalid_path" | "invalid_pattern" | "unsupported" | "cancelled" | "io_error";
export interface FileSystemErrorDetails {
    code: FileSystemErrorCode;
    path?: string;
    message: string;
    cause?: unknown;
}
export declare class FileSystemPortError extends Error {
    readonly code: FileSystemErrorCode;
    readonly path?: string;
    readonly cause?: unknown;
    constructor(details: FileSystemErrorDetails);
}
export declare function isFileSystemPortError(error: unknown): error is FileSystemPortError;
export type FileSystemNodeKind = "file" | "directory" | "symlink" | "other" | "missing";
export interface FileSystemRevision {
    id: string;
    mtimeMs?: number;
    sizeBytes?: number;
    hash?: string;
}
export type FileSystemLineEndings = "LF" | "CRLF";
export type FileSystemTextEncoding = BufferEncoding | "gb2312" | "gbk" | "gb18030";
export interface FileSystemStatRequest {
    path: string;
    trace?: TraceContext;
}
export interface FileSystemStatResult {
    path: string;
    kind: FileSystemNodeKind;
    sizeBytes: number;
    mtimeMs?: number;
    revision?: FileSystemRevision;
}
export interface FileSystemReadTextRequest {
    path: string;
    encoding?: FileSystemTextEncoding;
    maxBytes?: number;
    trace?: TraceContext;
}
export interface FileSystemReadTextResult {
    path: string;
    content: string;
    encoding: FileSystemTextEncoding;
    lineEndings?: FileSystemLineEndings;
    bytesRead: number;
    sizeBytes: number;
    truncated: boolean;
    revision?: FileSystemRevision;
}
export interface FileSystemReadTextRangeResult {
    path: string;
    content: string;
    encoding: FileSystemTextEncoding;
    lineEndings?: FileSystemLineEndings;
    bytesRead: number;
    sizeBytes: number;
    truncated: boolean;
    startLine: number;
    lineCount: number;
    totalLines: number;
    revision?: FileSystemRevision;
}
export interface FileSystemWriteTextRequest {
    path: string;
    content: string;
    encoding?: FileSystemTextEncoding;
    lineEndings?: FileSystemLineEndings;
    createParents?: boolean;
    atomic?: boolean;
    expectedRevision?: FileSystemRevision;
    trace?: TraceContext;
}
export interface FileSystemWriteTextResult {
    path: string;
    bytesWritten: number;
    revision?: FileSystemRevision;
}
export interface FileSystemOperationOptions {
    signal?: AbortSignal;
    context?: ExecutionContext;
}
export type RelevantFileSystemPort = Pick<import("@knorvia/contracts").FileSystemPort, "writeTextFile" | "readTextFile" | "stat">;
// Original owner: apps/cli/packages/contracts/src/tools/read.ts
export interface ReadTextOutput {
    type: "text";
    filePath: string;
    content: string;
    numLines: number;
    startLine: number;
    totalLines: number;
    sizeBytes?: number;
    bytesRead?: number;
    truncated?: boolean;
    truncatedByTokenCap?: boolean;
    partialViewNotice?: string;
}
