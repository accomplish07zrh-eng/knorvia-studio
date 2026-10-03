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
export type MessageVisibility = (typeof MESSAGE_VISIBILITIES)[number];
export type SyntheticUserMessageSource = (typeof SYNTHETIC_USER_MESSAGE_SOURCES)[number];
export type MessageSemanticsOrigin = "real_user" | "agent_runtime" | "system" | "migration" | "import";
export type MessageSemanticsKind = "user_prompt" | "slash_command" | "system_reminder" | "background_notification" | "subagent_notification" | "todo_reminder" | "rewind_notice" | "fork_notice" | "timeline_event" | "compact_summary" | "shared_context" | "assistant_response";
export interface MessageSemantics {
    origin: MessageSemanticsOrigin;
    kind: MessageSemanticsKind;
    source?: string;
    commandName?: string;
    uiVisibility: "visible" | "hidden" | "debug";
    providerVisibility: "visible" | "hidden";
    transcriptVisibility: "visible" | "hidden";
}
export type MessageAnchorOrigin = (typeof MESSAGE_ANCHOR_ORIGINS)[number];
export type StableForkGoalBoundaryMetadata = {
    kind: "none";
} | {
    kind: "snapshot";
    target: SessionGoal;
    verificationEntryIds: string[];
};
export interface MessageProjectionAnchor {
    turnId?: TurnId;
    origin?: MessageAnchorOrigin;
    sourceCommandId?: string;
    historyRoundCount?: number;
    productTurnId?: string;
    orderedMessageIds?: MessageId[];
    boundaryMessageId?: MessageId;
    goalBoundary?: StableForkGoalBoundaryMetadata;
}
export interface FileDiff {
    path: string;
    additions: number;
    deletions: number;
    oldPath?: string;
    newPath?: string;
}
export type OutputFormat = {
    type: "text";
} | {
    type: "json_schema";
    schema: Record<string, unknown>;
    retryCount?: number;
};
export interface MessageSummary {
    title?: string;
    body?: string;
    diffs: FileDiff[];
}
export interface MessageContextSnapshot {
    envInfo?: EnvInfo;
}
export interface UserMessageInfo {
    id: MessageId;
    sessionID: SessionId;
    role: "user";
    time: {
        created: number;
    };
    format?: OutputFormat;
    summary?: MessageSummary;
    agent: string;
    modelSelection?: ModelSelection;
    system?: string;
    tools?: Record<string, boolean>;
    contextSnapshot?: MessageContextSnapshot;
    synthetic?: boolean;
    source?: SyntheticUserMessageSource;
    visibility?: MessageVisibility;
    semantics?: MessageSemantics;
    anchor?: MessageProjectionAnchor;
    metadata?: Record<string, unknown>;
}
export interface AssistantErrorInfo {
    name: string;
    data?: Record<string, unknown>;
}
export interface TokenUsageInfo {
    total?: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
        read: number;
        write: number;
    };
}
export interface AssistantMessageInfo {
    id: MessageId;
    sessionID: SessionId;
    role: "assistant";
    time: {
        created: number;
        completed?: number;
    };
    error?: AssistantErrorInfo;
    parentID: MessageId;
    modelId?: ModelId;
    providerId?: ModelProviderId;
    mode: string;
    planEnabled?: boolean;
    agent: string;
    path: {
        cwd: string;
        root: string;
    };
    summary?: boolean;
    cost: number;
    tokens: TokenUsageInfo;
    structured?: unknown;
    reasoningLevel?: string;
    finish?: string;
    semantics?: MessageSemantics;
    anchor?: MessageProjectionAnchor;
    metadata?: Record<string, unknown>;
}
export type MessageInfo = UserMessageInfo | AssistantMessageInfo;
export interface TextPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "text";
    text: string;
    synthetic?: boolean;
    ignored?: boolean;
    time?: {
        start: number;
        end?: number;
    };
    metadata?: Record<string, unknown>;
}
export interface ReasoningPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "reasoning";
    text: string;
    metadata?: Record<string, unknown>;
    time: {
        start: number;
        end?: number;
    };
}
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
export interface AgentPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "agent";
    name: string;
    source?: {
        value: string;
        start: number;
        end: number;
    };
}
export interface CompactionPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "compaction";
    auto: boolean;
    trigger?: CompactTrigger;
    phase?: CompactPhase;
    compactReason?: CompactReason;
    overflow?: boolean;
    tail_start_id?: MessageId;
    compactBoundary?: CompactBoundaryPayload;
    operationId?: string;
    timelineStatus?: CompactTimelineStatus;
    timelineDisplay?: CompactTimelineDisplay;
    timelineText?: string;
    replace?: boolean;
    reason?: string;
    boundaryId?: string;
    summaryMessageId?: MessageId;
    preCompactTokenCount?: number;
    postCompactTokenCount?: number;
    truePostCompactTokenCount?: number;
    attempt?: number;
    maxAttempts?: number;
    time?: {
        start?: number;
        end?: number;
    };
}
export interface TimelineModelSelection extends ModelSelection {
    label?: string;
}
export interface ContextCompactionTimelinePart extends TimelinePartBase {
    timelineType: "context_compaction";
    operationId: string;
    trigger: CompactTrigger;
    phase?: CompactPhase;
    compactReason?: CompactReason;
    boundaryId?: string;
    summaryMessageId?: MessageId;
    preCompactTokenCount?: number;
    postCompactTokenCount?: number;
    truePostCompactTokenCount?: number;
    attempt?: number;
    maxAttempts?: number;
    reason?: string;
}
export interface GoalVerificationTimelinePart extends TimelinePartBase {
    timelineType: "goal_verification";
    targetId: string;
    verificationId: string;
    goalIteration?: number;
    verification?: {
        passed: boolean;
        reason: string;
        nextAction?: string | null;
    };
}
export interface SessionForkTimelinePart extends TimelinePartBase {
    timelineType: "session_fork";
    parentSessionId: SessionId;
    targetMessageId: MessageId;
    targetCheckpointId?: string;
    restoredFileCount?: number;
}
export interface ModelChangeTimelinePart extends TimelinePartBase {
    timelineType: "model_change";
    fromModel?: TimelineModelSelection;
    toModel?: TimelineModelSelection & {
        label: string;
    };
}
export type TimelinePart = ContextCompactionTimelinePart | GoalVerificationTimelinePart | SessionForkTimelinePart | ModelChangeTimelinePart;
export interface SubtaskPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "subtask";
    prompt: string;
    description: string;
    agent: string;
    model?: {
        providerId: ModelProviderId;
        modelId: ModelId;
    };
    command?: string;
}
export interface RetryPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "retry";
    attempt: number;
    error: AssistantErrorInfo;
    time: {
        created: number;
    };
}
export interface StepStartPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "step-start";
    snapshot?: string;
}
export interface StepFinishPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "step-finish";
    reason: string;
    snapshot?: string;
    cost: number;
    tokens: TokenUsageInfo;
}
export interface SnapshotPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "snapshot";
    snapshot: string;
}
export interface PatchPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "patch";
    hash: string;
    files: string[];
}
export interface ToolStatePending {
    status: "pending";
    input: Record<string, unknown>;
    raw: string;
}
export interface ToolStateRunning {
    status: "running";
    input: Record<string, unknown>;
    title?: string;
    metadata?: Record<string, unknown>;
    time: {
        start: number;
    };
}
export interface ToolStateCompleted {
    status: "completed";
    input: Record<string, unknown>;
    output: string;
    title: string;
    metadata: Record<string, unknown>;
    time: {
        start: number;
        end: number;
        compacted?: number;
    };
    attachments?: FilePart[];
}
export interface ToolStateError {
    status: "error";
    input: Record<string, unknown>;
    error: string;
    metadata?: Record<string, unknown>;
    time: {
        start: number;
        end: number;
    };
}
export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError;
export interface ToolPart {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "tool";
    callID: string;
    declarationIndex?: number;
    tool: string;
    state: ToolState;
    metadata?: Record<string, unknown>;
}
export type MessagePart = TextPart | ReasoningPart | FilePart | AgentPart | CompactionPart | TimelinePart | SubtaskPart | RetryPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | ToolPart;
export interface MessageWithParts {
    info: MessageInfo;
    parts: MessagePart[];
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

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/shared.ts
export type MessageId = string & {
    readonly __brand: "MessageId";
};
