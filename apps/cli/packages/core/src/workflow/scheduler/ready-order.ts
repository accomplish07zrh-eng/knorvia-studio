import type { WorkflowGraph, WorkflowGraphNode } from "@knorvia/contracts";
import {
  readyExecutableNodes,
  graphCollections,
  collectionNodeIdsForGraph,
} from "./graph-helpers.js";

export function orderedReadyExecutableNodes(
  graph: WorkflowGraph,
  executableNodeIds: Set<string>,
): WorkflowGraphNode[] {
  const readyNodes = readyExecutableNodes(graph, executableNodeIds);
  const collections = graphCollections(graph);
  const groups = new Map<string, WorkflowGraphNode[]>();
  const exploratoryIds = new Set<string>();

  for (const collection of collections) {
    if (!collection.explorable || collection.exhausted) {
      continue;
    }

    const memberIds = new Set(collectionNodeIdsForGraph(collection, graph));
    const contribution = readyNodes.filter((node) => memberIds.has(node.id));
    if (contribution.length === 0) {
      continue;
    }

    let group = groups.get(collection.collectionId);
    if (group === undefined) {
      group = [];
      groups.set(collection.collectionId, group);
    }
    for (const node of contribution) {
      group.push(node);
      exploratoryIds.add(node.id);
    }
  }

  const result = readyNodes.filter((node) => !exploratoryIds.has(node.id));
  const remainingGroups = Array.from(groups.values(), (nodes) => ({
    nodes,
    next: 0,
  }));
  let k = 0;

  while (remainingGroups.length > 0) {
    const rank = k % remainingGroups.length;
    const group = remainingGroups[rank]!;
    result.push(group.nodes[group.next]!);
    group.next += 1;

    if (group.next < group.nodes.length) {
      k += 1;
    } else {
      remainingGroups.splice(rank, 1);
    }
  }

  return result;
}
