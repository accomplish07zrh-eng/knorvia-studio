// Curated public declarations only. Module boundaries are indicated below.
import type {
  WorkflowGraph,
  WorkflowGraphCollection,
  WorkflowGraphCollectionStatus,
  WorkflowGraphNode,
  WorkflowGraphPlannerResult,
  WorkflowRunSnapshot,
} from "@knorvia/contracts";

// Existing ./types.js exports; declaration text retained from the public types.
export interface AppliedPlannerExpansion {
  addedEdges: WorkflowGraphRecordEdge[];
  addedNodes: WorkflowGraphNode[];
  collection: SchedulerCollection;
  snapshot: WorkflowRunSnapshot;
}
export type WorkflowGraphRecordEdge = WorkflowGraph["edges"][number];
export type SchedulerCollection = WorkflowGraphCollection & {
  analyzedNodeIds: string[];
  errorCount: number;
  exhausted: boolean;
  explorable: boolean;
  nodeIds: string[];
  plannerRuns: number;
  status: WorkflowGraphCollectionStatus;
};
export interface WorkflowGraphSchedulerPlannerRunResult extends WorkflowGraphPlannerResult {
  model?: string;
  response: string;
  sessionId: string;
  traceId?: string;
  turnId?: string;
}

// Existing ./graph.js exports. Signatures only; keep their existing owners.
export declare function graphCollections(graph: WorkflowGraph): SchedulerCollection[];
export declare function normalizeCollection(collection: WorkflowGraphCollection): SchedulerCollection;
export declare function collectionNodeIdsForGraph(
  collection: WorkflowGraphCollection,
  graph: WorkflowGraph,
): string[];
export declare function collectionFrontier(
  graph: WorkflowGraph,
  collection: WorkflowGraphCollection,
): number;
export declare function edgeId(edge: WorkflowGraphRecordEdge): string;
