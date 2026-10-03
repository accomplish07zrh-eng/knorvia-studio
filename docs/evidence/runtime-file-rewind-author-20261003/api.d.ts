import type { MessageId, TraceContext, TurnId } from "../deps.js";
import type { WorkspaceFileRewindApplyResult, WorkspaceFileRewindPreview } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function previewWorkspaceFileRewind(this: AgentRuntimeInternal, options?: {
    abortSignal?: AbortSignal;
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
    targetMessageIds?: MessageId[];
    targetTurnId?: TurnId;
    traceContext?: TraceContext;
}): Promise<WorkspaceFileRewindPreview>;
export declare function applyWorkspaceFileRewind(this: AgentRuntimeInternal, options?: {
    abortSignal?: AbortSignal;
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
    targetMessageIds?: MessageId[];
    targetTurnId?: TurnId;
    traceContext?: TraceContext;
    commitAfterApply?: () => Promise<void>;
}): Promise<WorkspaceFileRewindApplyResult>;
