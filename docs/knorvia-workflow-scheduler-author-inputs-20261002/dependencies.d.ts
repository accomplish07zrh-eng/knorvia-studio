import type {
  AppliedPlannerExpansion,
  WorkflowGraphSchedulerDeps,
  WorkflowGraphSchedulerRunOptions,
  WorkflowGraphSchedulerSnapshotAccess,
  WorkflowSchedulerNodePromise,
} from "./api.js";
import type {
  WorkflowEvent,
  WorkflowGraphCollection,
  WorkflowGraphNode,
  WorkflowNodeStatus,
  WorkflowRunSnapshot,
  WorkflowGraph,
  WorkflowSchedulerState,
} from "./supporting-types.js";
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
export declare function reconcileWorkflowSnapshotForResume<TSnapshot extends WorkflowRunSnapshot>(
  snapshot: TSnapshot,
  options: ReconcileWorkflowSnapshotForResumeOptions,
): WorkflowSnapshotLifecycleResult<TSnapshot>;
export declare class WorkflowSchedulerEventLog {
  constructor(deps: WorkflowGraphSchedulerDeps);
  timestamp(): string;
  appendGraphStatus(
    snapshot: WorkflowRunSnapshot,
    nodeId: string,
    phase: string,
    status: WorkflowNodeStatus,
    signal?: AbortSignal,
  ): Promise<void>;
  appendCollectionRecord(
    snapshot: WorkflowRunSnapshot,
    collection: WorkflowGraphCollection,
    signal?: AbortSignal,
  ): Promise<void>;
  appendExpansionRecords(
    snapshot: WorkflowRunSnapshot,
    expansion: AppliedPlannerExpansion,
    phase: string,
    signal?: AbortSignal,
  ): Promise<void>;
  emitEvent(
    snapshot: WorkflowRunSnapshot,
    type: WorkflowEvent["type"],
    options?: {
      message?: string;
      nodeId?: string;
      payload?: Record<string, unknown>;
      phase?: string;
      signal?: AbortSignal;
    },
  ): Promise<void>;
}
export declare function areExecutableNodesComplete(
  graph: WorkflowGraph,
  executableNodeIds: Set<string>,
  waitsForCollections: boolean,
): boolean;
export declare function blockedExecutableNodes(
  graph: WorkflowGraph,
  executableNodeIds: Set<string>,
): Array<{
  blockedBy: string[];
  nodeId: string;
}>;
export declare function orderedReadyExecutableNodes(
  graph: WorkflowGraph,
  executableNodeIds: Set<string>,
): WorkflowGraphNode[];
export declare function readyExecutableNodes(
  graph: WorkflowGraph,
  executableNodeIds: Set<string>,
): WorkflowGraphNode[];
export interface WorkflowCollectionPlannerRuntime {
  createActivityId: () => string;
  eventLog: WorkflowSchedulerEventLog;
  plannerRunner?: WorkflowGraphSchedulerDeps["plannerRunner"];
  writeArtifact: WorkflowGraphSchedulerDeps["writeArtifact"];
  writeSnapshot: WorkflowGraphSchedulerDeps["writeSnapshot"];
}
export declare function checkCollectionPlanners(
  snapshot: WorkflowRunSnapshot,
  executableNodeIds: Set<string>,
  options: WorkflowGraphSchedulerRunOptions,
  runtime: WorkflowCollectionPlannerRuntime,
): Promise<{
  addedNodeIds: string[];
  plannersRan: number;
  snapshot: WorkflowRunSnapshot;
}>;
export interface WorkflowNodeRunnerRuntime {
  createActivityId: () => string;
  eventLog: WorkflowSchedulerEventLog;
  runner: WorkflowGraphSchedulerDeps["runner"];
  writeArtifact: WorkflowGraphSchedulerDeps["writeArtifact"];
  writeSnapshot: WorkflowGraphSchedulerDeps["writeSnapshot"];
}
export declare function runWorkflowNode(
  snapshotAccess: WorkflowGraphSchedulerSnapshotAccess,
  node: WorkflowGraphNode,
  options: WorkflowGraphSchedulerRunOptions,
  maxAttempts: number,
  runtime: WorkflowNodeRunnerRuntime,
): WorkflowSchedulerNodePromise;
export declare function deriveWorkflowRunSchedulerState(
  snapshot: WorkflowRunSnapshot,
): WorkflowSchedulerState;
export declare function deriveWorkflowSchedulerState(graph: WorkflowGraph): WorkflowSchedulerState;
