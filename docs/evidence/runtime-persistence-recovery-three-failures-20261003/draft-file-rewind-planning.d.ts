import type { CheckpointCreatedPayload, MessageId, TraceContext, TurnId } from "../deps.js";
import type { WorkspaceFileRewindPreview, WorkspaceFileRewindUnsafeFile, WorkspaceFileRewindUnsafeReason } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
export type PlanOptions = {
    abortSignal?: AbortSignal;
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
    targetMessageIds?: MessageId[];
    targetTurnId?: TurnId;
    traceContext?: TraceContext;
};
export type Operation = {
    action: "restore" | "delete";
    path: string;
    beforeContent: string | null;
    afterContent: string | null;
    toolName: string;
    checkpoint: CheckpointCreatedPayload;
};
export type RewindPlan = WorkspaceFileRewindPreview & {
    operations: Operation[];
};
export declare function previewFromPlan(plan: WorkspaceFileRewindPreview): WorkspaceFileRewindPreview;
export declare function unavailableFile(path: string, reason: WorkspaceFileRewindUnsafeReason, message: string): WorkspaceFileRewindUnsafeFile;
export declare function planWorkspaceFileRewind(runtime: AgentRuntimeInternal, options?: PlanOptions): Promise<RewindPlan>;
//# sourceMappingURL=file-rewind-planning.d.ts.map