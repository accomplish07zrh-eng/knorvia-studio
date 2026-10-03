import type { MessageId, MessageWithParts, SessionId, TraceContext, WorkspaceCheckpointArtifact } from "../deps.js";
import type { WorkspaceRewindRestoredFile, WorkspaceForkResult, WorkspaceCheckpointSummary } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function restoreWorkspaceCheckpointArtifact(this: AgentRuntimeInternal, artifact: WorkspaceCheckpointArtifact, traceContext: TraceContext, abortSignal?: AbortSignal): Promise<WorkspaceRewindRestoredFile[]>;
export declare function copySessionMessagesForFork(this: AgentRuntimeInternal, options: {
    forkedSessionId: SessionId;
    messages: MessageWithParts[];
    traceContext: TraceContext;
}): Promise<{
    copiedMessageCount: number;
    messageIdMap: Map<MessageId, MessageId>;
}>;
export declare function listWorkspaceCheckpoints(this: AgentRuntimeInternal, options?: {
    limit?: number;
}): Promise<WorkspaceCheckpointSummary[]>;
export declare function forkWorkspaceFromCheckpoint(this: AgentRuntimeInternal, options?: {
    abortSignal?: AbortSignal;
    forkedSessionId?: SessionId;
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
    traceContext?: TraceContext;
}): Promise<WorkspaceForkResult>;
export declare function loadCheckpointMessagePreviews(this: AgentRuntimeInternal): Promise<Map<MessageId, string>>;
