import { type WorkflowGraphCollection, type WorkflowGraphEdge, type WorkflowGraphNode, type WorkflowGraphSeed, type WorkflowNodePromptUpdate, type WorkflowNodeStatus, type WorkflowRunSnapshot } from "@knorvia/contracts";
export interface WorkflowGraphNodeChange {
    nodeId: string;
    phase?: string;
    status: WorkflowNodeStatus;
}
export interface WorkflowSnapshotLifecycleResult<TSnapshot extends WorkflowRunSnapshot> {
    activityIds: string[];
    changed: boolean;
    nodeChanges: WorkflowGraphNodeChange[];
    phaseIds: string[];
    snapshot: TSnapshot;
}
export interface ReconcileWorkflowSnapshotForResumeOptions {
    nodeIds?: Iterable<string>;
    reason?: string;
    resetActivities?: boolean;
    resetPhases?: boolean;
    timestamp: string;
}
export interface CancelWorkflowSnapshotOptions {
    reason?: string;
    timestamp: string;
}
export interface ReopenWorkflowGraphNodeOptions {
    maxReopens?: number;
    nodeId: string;
    reason?: string;
    timestamp: string;
}
export interface ReopenWorkflowGraphNodeResult<TSnapshot extends WorkflowRunSnapshot> {
    changed: boolean;
    nodeChange: WorkflowGraphNodeChange;
    reopenAttempts: number;
    snapshot: TSnapshot;
}
export interface ApplyWorkflowGraphSeedOptions {
    phase?: string;
    timestamp: string;
}
export interface ApplyWorkflowGraphSeedResult<TSnapshot extends WorkflowRunSnapshot> {
    addedCollections: WorkflowGraphCollection[];
    addedEdges: WorkflowGraphEdge[];
    addedNodes: WorkflowGraphNode[];
    changed: boolean;
    snapshot: TSnapshot;
}
export interface ApplyWorkflowNodePromptUpdatesOptions {
    phase: string;
    timestamp: string;
}
export interface ApplyWorkflowNodePromptUpdatesResult<TSnapshot extends WorkflowRunSnapshot> {
    changed: boolean;
    snapshot: TSnapshot;
    updatedNodes: WorkflowGraphNode[];
}
export declare function reconcileWorkflowSnapshotForResume<TSnapshot extends WorkflowRunSnapshot>(snapshot: TSnapshot, options: ReconcileWorkflowSnapshotForResumeOptions): WorkflowSnapshotLifecycleResult<TSnapshot>;
export declare function cancelWorkflowSnapshot<TSnapshot extends WorkflowRunSnapshot>(snapshot: TSnapshot, options: CancelWorkflowSnapshotOptions): WorkflowSnapshotLifecycleResult<TSnapshot>;
export declare function reopenWorkflowGraphNode<TSnapshot extends WorkflowRunSnapshot>(snapshot: TSnapshot, options: ReopenWorkflowGraphNodeOptions): ReopenWorkflowGraphNodeResult<TSnapshot>;
export declare function applyWorkflowGraphSeed<TSnapshot extends WorkflowRunSnapshot>(snapshot: TSnapshot, seed: WorkflowGraphSeed, options: ApplyWorkflowGraphSeedOptions): ApplyWorkflowGraphSeedResult<TSnapshot>;
export declare function applyWorkflowNodePromptUpdates<TSnapshot extends WorkflowRunSnapshot>(snapshot: TSnapshot, updates: readonly WorkflowNodePromptUpdate[], options: ApplyWorkflowNodePromptUpdatesOptions): ApplyWorkflowNodePromptUpdatesResult<TSnapshot>;
