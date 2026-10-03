// Exact selected public type closure; no implementation.
// Original type owner: apps/cli/packages/contracts/src/interfaces/session-store.port.ts
import type { MessageId, PartId, ProjectId, SessionId, ToolCallId, TraceId, TurnId, WorkspaceId } from "./shared.js";
import type { CompactBoundaryPayload, CompactPhase, CompactReason, CompactTimelineDisplay, CompactTimelineStatus, CompactTrigger } from "../compact/index.js";
import type { ModelId, ModelProviderId, ModelSelection, ModelToolSideEffectScope } from "../model/index.js";
import type { TodoItem } from "../tools/todo.js";
import type { SessionGoal, GoalStatus } from "../tools/target.js";
import type { PermissionRuleset } from "./permission.port.js";
import type { ProjectPermissionUpdatePort } from "./project-permission-update.port.js";
import type { CollaborationMode } from "./session.port.js";
import type { EnvInfo } from "./context-source.port.js";
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
export type TimelinePartDisplay = "separator" | "worklog";
export type TimelinePartStatus = "started" | "completed" | "failed" | "interrupted" | "cancelled" | string;
export interface TimelineModelSelection extends ModelSelection {
    label?: string;
}
export interface TimelinePartBase {
    id: PartId;
    sessionID: SessionId;
    messageID: MessageId;
    type: "timeline";
    display: TimelinePartDisplay;
    status?: TimelinePartStatus;
    anchorMessageId?: MessageId;
    anchorTurnId?: TurnId;
    sourceCommandId?: string;
    originAnchorMessageId?: MessageId;
    originAnchorTurnId?: TurnId;
    time?: {
        start?: number;
        end?: number;
    };
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
