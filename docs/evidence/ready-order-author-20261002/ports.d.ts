// Declarations only. These are the external helpers/types visible to the fragment.
interface WorkflowGraphNode {
  id: string;
  title: string;
  dependsOn: string[];
  kind: "phase" | "task";
  status: "pending" | "active" | "completed" | "failed" | "cancelled" | "skipped";
  collectionId?: string;
}
interface WorkflowGraphCollection {
  collectionId: string;
  nodeIds?: string[];
  explorable?: boolean;
  exhausted?: boolean;
  status?: string;
}
interface WorkflowGraph {
  nodes: WorkflowGraphNode[];
  edges: { from: string; to: string }[];
  collections?: WorkflowGraphCollection[];
}
declare function readyExecutableNodes(graph: WorkflowGraph, executableNodeIds: Set<string>): WorkflowGraphNode[];
declare function graphCollections(graph: WorkflowGraph): WorkflowGraphCollection[];
declare function collectionNodeIdsForGraph(collection: WorkflowGraphCollection, graph: WorkflowGraph): string[];
export declare function orderedReadyExecutableNodes(graph: WorkflowGraph, executableNodeIds: Set<string>): WorkflowGraphNode[];
