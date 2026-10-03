import {
  WorkflowGraphPlannerResultSchema,
  type WorkflowGraph,
  type WorkflowGraphNode,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import {
  collectionFrontier,
  collectionNodeIdsForGraph,
  edgeId,
  graphCollections,
  normalizeCollection,
} from "./graph.js";
import type {
  AppliedPlannerExpansion,
  SchedulerCollection,
  WorkflowGraphRecordEdge,
  WorkflowGraphSchedulerPlannerRunResult,
} from "./types.js";

export function applyPlannerExpansion(
  snapshot: WorkflowRunSnapshot,
  collection: SchedulerCollection,
  rawResult: WorkflowGraphSchedulerPlannerRunResult,
  unseenCompletions: readonly string[],
  timestamp: string,
): AppliedPlannerExpansion {
  const parsed = WorkflowGraphPlannerResultSchema.parse(rawResult);
  const nodeIds = new Set(snapshot.graph.nodes.map((node) => node.id));
  const addedNodes: WorkflowGraphNode[] = [];
  for (const node of parsed.nodes) {
    addedNodes.push({
      collectionId: node.collectionId ?? collection.collectionId,
      dependsOn: node.dependsOn,
      description: node.description,
      id: node.id,
      kind: node.kind,
      phase: node.phase,
      prompt: node.prompt,
      status: "pending",
      title: node.title,
    });
  }
  for (const node of addedNodes) {
    if (nodeIds.has(node.id)) {
      throw new Error(`Planner returned duplicate workflow node: ${node.id}`);
    }
    nodeIds.add(node.id);
  }
  const addedEdges = admitEdges(snapshot.graph, addedNodes, parsed.edges, nodeIds);

  const members = new Set(collectionNodeIdsForGraph(collection, snapshot.graph));
  const requestedMembers = parsed.collectionNodeIds ?? addedNodes.map((node) => node.id);
  for (const id of requestedMembers) members.add(id);

  const changed = addedNodes.length > 0 || addedEdges.length > 0;
  let status: SchedulerCollection["status"] = "active";
  if (parsed.exhausted === true) {
    status = "exhausted";
  } else if (
    !changed &&
    collectionFrontier(snapshot.graph, collection) === 0 &&
    unseenCompletions.length === 0
  ) {
    status = collection.status === "draining" ? "exhausted" : "draining";
  }
  const analyzed = new Set(collection.analyzedNodeIds);
  for (const id of unseenCompletions) analyzed.add(id);
  const nextCollection = normalizeCollection({
    ...collection,
    analyzedNodeIds: [...analyzed],
    exhausted: status === "exhausted",
    lastGraphChangeAt: changed ? timestamp : collection.lastGraphChangeAt,
    nodeIds: [...members],
    status,
  });
  const collections = graphCollections(snapshot.graph);
  for (let i = 0; i < collections.length; i++) {
    if (collections[i]!.collectionId === collection.collectionId) collections[i] = nextCollection;
  }
  return {
    addedEdges,
    addedNodes,
    collection: nextCollection,
    snapshot: {
      ...snapshot,
      graph: {
        collections,
        edges: [...snapshot.graph.edges, ...addedEdges],
        nodes: [...snapshot.graph.nodes, ...addedNodes],
      },
      updatedAt: timestamp,
    },
  };
}

// Explicit requests reserve their keys before dependency edges are inferred.
function admitEdges(
  graph: WorkflowGraph,
  nodes: readonly WorkflowGraphNode[],
  explicit: readonly WorkflowGraphRecordEdge[],
  nodeIds: ReadonlySet<string>,
): WorkflowGraphRecordEdge[] {
  const candidates = [...explicit];
  const reserved = new Set([...graph.edges, ...explicit].map(edgeId));
  for (const node of nodes) {
    for (const from of node.dependsOn) {
      const dependency = { from, to: node.id };
      const key = edgeId(dependency);
      if (!reserved.has(key)) {
        reserved.add(key);
        candidates.push(dependency);
      }
    }
  }

  const admitted = new Set(graph.edges.map(edgeId));
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) appendNeighbor(adjacency, edge);
  for (const edge of candidates) {
    if (edge.from === edge.to) {
      throw new Error(`Planner returned a self-loop edge: ${edge.from} -> ${edge.to}`);
    }
    if (!nodeIds.has(edge.from)) {
      throw new Error(`Planner returned an edge with unknown source node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      throw new Error(`Planner returned an edge with unknown target node: ${edge.to}`);
    }
    const key = edgeId(edge);
    if (admitted.has(key)) {
      throw new Error(`Planner returned duplicate workflow edge: ${key}`);
    }
    if (reaches(adjacency, edge.to, edge.from)) {
      throw new Error(`Planner returned an edge that would create a cycle: ${key}`);
    }
    admitted.add(key);
    appendNeighbor(adjacency, edge);
  }
  return candidates;
}

function appendNeighbor(adjacency: Map<string, string[]>, edge: WorkflowGraphRecordEdge): void {
  const neighbors = adjacency.get(edge.from);
  if (neighbors) neighbors.push(edge.to);
  else adjacency.set(edge.from, [edge.to]);
}

// The index contains only original edges and the accepted candidate prefix.
function reaches(adjacency: ReadonlyMap<string, readonly string[]>, start: string, target: string) {
  const pending = [start];
  const seen = new Set<string>();
  while (pending.length) {
    const node = pending.pop()!;
    if (node === target) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    const neighbors = adjacency.get(node);
    if (neighbors) for (const next of neighbors) pending.push(next);
  }
  return false;
}
