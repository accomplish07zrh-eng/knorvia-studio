import { WorkflowGraphSeedSchema, type WorkflowGraphSeed } from "@knorvia/contracts";
import { edgeId } from "../ids.js";
import {
  isRecord,
  parsePlannerJson,
  readLooseArray,
  readLooseBoolean,
  readLoosePositiveInteger,
  readLooseString,
  readLooseStringArray,
  readLooseValue,
  stringValue,
} from "./json.js";

export function parseWorkflowGraphSeed(
  response: string,
  defaultPhase: string,
): WorkflowGraphSeed | null {
  let candidate: unknown;
  try {
    candidate = parsePlannerJson(response);
  } catch {
    return null;
  }
  return normalizeWorkflowGraphSeedCandidate(candidate, defaultPhase);
}

export function gateRootSeedNodes(seed: WorkflowGraphSeed, gateNodeId: string): WorkflowGraphSeed {
  const incomingIds = new Set(seed.edges.map((edge) => edge.to));
  const roots = seed.nodes.filter(
    (node) => (node.dependsOn ?? []).length === 0 && !incomingIds.has(node.id),
  );
  if (roots.length === 0) {
    return seed;
  }

  const edges = [...seed.edges];
  const edgeKeys = new Set(edges.map((edge) => edgeId(edge)));
  for (const root of roots) {
    const key = edgeId({ from: gateNodeId, to: root.id });
    if (!edgeKeys.has(key)) {
      edges.push({ from: gateNodeId, to: root.id });
      edgeKeys.add(key);
    }
  }

  const rootNodes = new Set(roots.map((node) => node.id));
  const newNodesMap = seed.nodes.map((node) =>
    rootNodes.has(node.id)
      ? {
          ...node,
          dependsOn: [...new Set([...(node.dependsOn ?? []), gateNodeId])],
        }
      : node,
  );
  return { ...seed, edges, nodes: newNodesMap };
}

export function normalizeWorkflowGraphSeedCandidate(
  value: unknown,
  defaultPhase: string,
): WorkflowGraphSeed | null {
  if (Array.isArray(value)) {
    if (value.every(isCollectionLike)) {
      return normalizeWorkflowGraphSeedCandidate({ collections: value }, defaultPhase);
    }
    if (value.every(isNodeLike)) {
      return normalizeWorkflowGraphSeedCandidate({ nodes: value }, defaultPhase);
    }
    if (value.every(isEdgeLike)) {
      return normalizeWorkflowGraphSeedCandidate({ edges: value }, defaultPhase);
    }
  }
  if (!isRecord(value)) {
    return null;
  }

  const nodeCandidates = readLooseArray(value, ["nodes", "newNodes", "new_nodes"]);
  const edgeCandidates = readLooseArray(value, ["edges", "newEdges", "new_edges"]);
  const collectionCandidates =
    readLooseArray(value, ["collections"]) ?? (isCollectionLike(value) ? [value] : undefined);
  const nodes = (nodeCandidates ?? [])
    .map((node) => normalizeNode(node, defaultPhase))
    .filter((node) => node !== null);
  const edges = (edgeCandidates ?? []).map(normalizeEdge).filter((edge) => edge !== null);
  const collections = (collectionCandidates ?? [])
    .map((collection) => normalizeCollection(collection, defaultPhase))
    .filter((collection) => collection !== null);

  const result = WorkflowGraphSeedSchema.safeParse({
    collections,
    edges,
    nodes,
    reasoning: stringValue(value.reasoning),
  });
  return result.success ? result.data : null;
}

function normalizeNode(value: unknown, defaultPhase: string) {
  if (!isRecord(value)) {
    return null;
  }
  const id = readLooseString(value, ["id", "name", "nodeName", "node_name"]);
  if (id === undefined) {
    return null;
  }
  const title = readLooseString(value, ["title", "summary"]) ?? id;
  const dependsOn =
    readLooseStringArray(value, ["dependsOn", "depends_on", "references", "inputs"]) ?? [];
  return {
    collectionId: readLooseString(value, ["collectionId", "collection_id", "collection"]),
    dependsOn,
    description: readLooseString(value, ["description", "goal"]),
    id,
    kind: value.kind === "phase" ? "phase" : "task",
    phase: readLooseString(value, ["phase"]) ?? defaultPhase,
    prompt: readLooseString(value, ["prompt", "instructions"]),
    title,
  };
}

function normalizeEdge(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const from = readLooseString(value, ["from", "source"]);
  const to = readLooseString(value, ["to", "target"]);
  return from !== undefined && to !== undefined ? { from, to } : null;
}

function normalizeCollection(value: unknown, defaultPhase: string) {
  if (!isRecord(value)) {
    return null;
  }
  const collectionId = readLooseString(value, [
    "collectionId",
    "collection_id",
    "name",
    "id",
    "collectionsname",
  ]);
  if (collectionId === undefined) {
    return null;
  }
  return {
    collectionId,
    explorable: readLooseBoolean(value, ["explorable"]),
    frontierTarget: readLoosePositiveInteger(value, ["frontierTarget", "frontier_target"]),
    goal: readLooseString(value, ["goal"]),
    metric: readLooseString(value, ["metric"]),
    nodeIds: readLooseStringArray(value, ["nodeIds", "node_ids", "nodeNames", "node_names"]) ?? [],
    phase: readLooseString(value, ["phase"]) ?? defaultPhase,
    title: readLooseString(value, ["title"]) ?? collectionId,
  };
}

function isCollectionLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    (typeof readLooseValue(value, ["collectionId", "collection_id", "name", "id"]) === "string" ||
      readLooseArray(value, ["nodeIds", "node_ids", "nodeNames", "node_names"]) !== undefined ||
      typeof readLooseValue(value, ["goal"]) === "string" ||
      typeof readLooseValue(value, ["metric"]) === "string" ||
      typeof readLooseValue(value, ["explorable"]) === "boolean")
  );
}

function isNodeLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.kind === "task" ||
      value.kind === "phase" ||
      typeof readLooseValue(value, ["id", "name", "nodeName", "node_name"]) === "string" ||
      typeof readLooseValue(value, ["description", "goal"]) === "string" ||
      readLooseArray(value, ["dependsOn", "depends_on", "references", "inputs"]) !== undefined)
  );
}

function isEdgeLike(value: unknown): boolean {
  return (
    isRecord(value) &&
    (typeof readLooseValue(value, ["from", "source"]) === "string" ||
      typeof readLooseValue(value, ["to", "target"]) === "string")
  );
}
