// Original public port/type owner: apps/cli/packages/contracts/src/model/index.ts
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import type { ProviderNativeToolSpec, ToolExecutionMode, ToolPermissionSpec, ToolResultBudget } from "../tools/contract.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { ModelApiCallObservation, ModelApiErrorPhase, ResolvedModelApiCallObservation } from "../telemetry/index.js";
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

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/session-store.port.ts
import type { MessageId, PartId, ProjectId, SessionId, ToolCallId, TraceId, TurnId, WorkspaceId } from "./shared.js";
import type { CompactBoundaryPayload, CompactPhase, CompactReason, CompactTimelineDisplay, CompactTimelineStatus, CompactTrigger } from "../compact/index.js";
import type { ModelId, ModelProviderId, ModelSelection, ModelToolSideEffectScope } from "../model/index.js";
import type { TodoItem } from "../tools/todo.js";
import type { SessionGoal, GoalStatus } from "../tools/target.js";
import type { PermissionRuleset } from "./permission.port.js";
import type { ProjectPermissionUpdatePort } from "./project-permission-update.port.js";
import type { CollaborationMode } from "./session.port.js";
import type { EnvInfo } from "./context-source.port.js";
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

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/tool-artifact-store.port.ts
import type { SessionId, ToolCallId, TurnId } from "./shared.js";
import type { TraceContext } from "../tracing/tracer.js";
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
export interface ToolBinaryArtifactWriteRequest {
    sessionId: SessionId;
    turnId?: TurnId;
    toolCallId: ToolCallId | string;
    toolName: string;
    content: Uint8Array;
    contentType: string;
    extension?: string;
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
export interface ToolBinaryArtifactReadResult {
    uri: string;
    bytes: Uint8Array;
    contentType: string;
    path?: string;
}
export interface ToolArtifactStatRequest {
    uri: string;
    trace?: TraceContext;
}
export interface ToolArtifactStatResult {
    uri: string;
    bytes: number;
    contentType: string;
    path?: string;
    mtimeMs?: number;
}
export interface ImageAttachmentPathPrimeRequest {
    uri: string;
    bytes: Uint8Array;
    mediaType: string;
}
export interface MediaAttachmentPathPrimeRequest {
    uri: string;
    bytes: Uint8Array;
    mediaType: string;
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
export interface ToolArtifactStorePort {
    writeToolResultArtifact(request: ToolArtifactWriteRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolArtifactWriteResult>;
    writeToolResultBinaryArtifact?(request: ToolBinaryArtifactWriteRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolArtifactWriteResult>;
    readToolResultArtifact(request: ToolArtifactReadRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolArtifactReadResult>;
    readToolResultBinaryArtifact?(request: ToolArtifactReadRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolBinaryArtifactReadResult>;
    statToolResultArtifact?(request: ToolArtifactStatRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolArtifactStatResult>;
    primeImageAttachmentPath?(request: ImageAttachmentPathPrimeRequest): Promise<MediaAttachmentPathResult>;
    primeMediaAttachmentPath?(request: MediaAttachmentPathPrimeRequest): Promise<MediaAttachmentPathResult>;
    ensureMediaAttachmentPath?(request: MediaAttachmentPathEnsureRequest): Promise<MediaAttachmentPathResult>;
}
