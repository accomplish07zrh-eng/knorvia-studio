// Structural API facts only, no executable bodies. Extra input fields are retained by reference.
type WorkflowNodeStatus = "pending" | "active" | "completed" | "failed" | "skipped" | "cancelled";
interface WorkflowGraphNode {
  id: string;
  title: string;
  dependsOn: string[];
  kind: "phase" | "task";
  status: WorkflowNodeStatus;
  collectionId?: string;
}
interface WorkflowGraphCollection {
  collectionId: string;
  nodeIds?: string[];
  errorCount?: number;
  exhausted?: boolean;
  frontierTarget?: number;
  plannerRuns?: number;
  status?: "active" | "draining" | "exhausted";
}
interface WorkflowGraph {
  nodes: WorkflowGraphNode[];
  edges: { from: string; to: string }[];
  collections?: WorkflowGraphCollection[];
}
interface WorkflowSchedulerState {
  activeActivities: { activityId: string; phase: string }[];
  activeChildSessionIds: string[];
  activeNodeIds: string[];
  blockedNodes: { blockedBy: string[]; nodeId: string }[];
  counts: {
    active: number;
    blocked: number;
    completed: number;
    failed: number;
    pending: number;
    ready: number;
    total: number;
  };
  collectionStates: {
    activeNodeIds: string[];
    collection: WorkflowGraphCollection;
    completedNodeIds: string[];
    errorCount: number;
    exhausted: boolean;
    failedNodeIds: string[];
    frontier: number;
    frontierTarget?: number;
    pendingNodeIds: string[];
    plannerRuns: number;
    readyNodeIds: string[];
    status: "active" | "draining" | "exhausted";
  }[];
  nodes: {
    blockedBy: string[];
    collectionIds: string[];
    incoming: string[];
    node: WorkflowGraphNode;
    outgoing: string[];
    ready: boolean;
  }[];
  readyNodeIds: string[];
}
declare const TERMINAL_DEPENDENCY_STATUSES: ReadonlySet<WorkflowNodeStatus>;
export declare function deriveWorkflowSchedulerState(graph: WorkflowGraph): WorkflowSchedulerState;
