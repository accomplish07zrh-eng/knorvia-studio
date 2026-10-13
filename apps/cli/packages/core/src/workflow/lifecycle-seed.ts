// SPDX-License-Identifier: Apache-2.0
// 图种子落地：把 schema 校验过的种子（节点/边/集合）并入快照。合并前挡住重复 id、未知端点、
// 自环与成环；任一校验失败直接抛错，绝不做部分合并（调用方据此把失败归到对应相位工件）。
import {
  WorkflowGraphSeedSchema,
  type WorkflowGraphCollection,
  type WorkflowGraphEdge,
  type WorkflowGraphNode,
  type WorkflowGraphSeed,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import type { ApplyWorkflowGraphSeedOptions, ApplyWorkflowGraphSeedResult } from "./lifecycle.js";

type Edge = WorkflowGraphEdge;
type SeedNode = WorkflowGraphSeed["nodes"][number];
type SeedCollection = WorkflowGraphSeed["collections"][number];

const EDGE_ARROW = "->";
const SEED_REJECTED = "Workflow graph seed returned ";
const SEED_COLLECTION_REJECTED = "Workflow graph seed collection ";

/** 去重并剔除空串，保留首次出现的顺序。 */
function orderedNonempty(items: readonly string[]): string[] {
  const taken = new Set<string>();
  return items.filter((item) => {
    const usable = typeof item === "string" && item.length > 0 && !taken.has(item);
    if (usable) taken.add(item);
    return usable;
  });
}

const edgeId = (link: Edge): string => link.from + EDGE_ARROW + link.to;

/** 节点字段搬运表：键名与种子字段同名，集中在一处便于核对。 */
const NODE_FIELD_READERS: readonly (readonly [
  keyof WorkflowGraphNode,
  (node: SeedNode) => unknown,
])[] = [
  ["collectionId", (node) => node.collectionId],
  ["description", (node) => node.description],
  ["id", (node) => node.id],
  ["prompt", (node) => node.prompt],
  ["title", (node) => node.title],
];

/** 集合字段搬运表。 */
const COLLECTION_FIELD_READERS: readonly (readonly [
  keyof WorkflowGraphCollection,
  (item: SeedCollection) => unknown,
])[] = [
  ["collectionId", (item) => item.collectionId],
  ["explorable", (item) => item.explorable],
  ["frontierTarget", (item) => item.frontierTarget],
  ["goal", (item) => item.goal],
  ["metric", (item) => item.metric],
  ["title", (item) => item.title],
];

const carry = <TItem, TTarget>(
  readers: readonly (readonly [keyof TTarget, (item: TItem) => unknown])[],
  item: TItem,
): Partial<TTarget> =>
  Object.fromEntries(readers.map(([key, read]) => [key, read(item)])) as Partial<TTarget>;

/** 邻接表可达性判定：只在需要时展开邻居，避免为每条候选边重建整张图。 */
function hasPath(links: readonly Edge[], origin: string, goal: string): boolean {
  const adjacency = links.reduce<Map<string, string[]>>((table, link) => {
    const bucket = table.get(link.from);
    if (bucket === undefined) table.set(link.from, [link.to]);
    else bucket.push(link.to);
    return table;
  }, new Map());
  const walked = new Set<string>();
  const frontier = [origin];
  let reached = false;
  while (!reached && frontier.length > 0) {
    const cursor = frontier.pop() as string;
    if (cursor === goal) reached = true;
    else if (!walked.has(cursor)) {
      walked.add(cursor);
      for (const next of adjacency.get(cursor) ?? []) {
        if (!walked.has(next)) frontier.push(next);
      }
    }
  }
  return reached;
}

export function applyWorkflowGraphSeed<TSnapshotType extends WorkflowRunSnapshot>(
  input: TSnapshotType,
  candidate: WorkflowGraphSeed,
  settings: ApplyWorkflowGraphSeedOptions,
): ApplyWorkflowGraphSeedResult<TSnapshotType> {
  const parsed = WorkflowGraphSeedSchema.parse(candidate);
  const { graph } = input;

  const knownNodeIds = new Set(graph.nodes.map((node) => node.id));
  const addedNodes: WorkflowGraphNode[] = parsed.nodes.map((node) => {
    if (knownNodeIds.has(node.id)) {
      throw new Error(`${SEED_REJECTED}duplicate node: ${node.id}`);
    }
    knownNodeIds.add(node.id);
    return {
      ...carry<SeedNode, WorkflowGraphNode>(NODE_FIELD_READERS, node),
      dependsOn: orderedNonempty(node.dependsOn),
      kind: node.kind ?? "task",
      phase: node.phase ?? settings.phase,
      status: "pending",
    } as WorkflowGraphNode;
  });

  const addedEdges: Edge[] = parsed.edges.map((link) => ({ from: link.from, to: link.to }));
  const knownEdgeIds = new Set([...graph.edges, ...addedEdges].map(edgeId));
  for (const pendingNode of addedNodes) {
    for (const prerequisite of pendingNode.dependsOn) {
      const link = { from: prerequisite, to: pendingNode.id };
      const id = edgeId(link);
      if (knownEdgeIds.has(id)) continue;
      addedEdges.push(link);
      knownEdgeIds.add(id);
    }
  }

  const pendingEdges = [...graph.edges];
  const acceptedEdgeIds = new Set(graph.edges.map(edgeId));
  for (const link of addedEdges) {
    const id = edgeId(link);
    const checks: readonly (readonly [broken: boolean, detail: string])[] = [
      [link.from === link.to, `${SEED_REJECTED}a self-loop edge: ${link.from} -> ${link.to}`],
      [
        !knownNodeIds.has(link.from),
        `${SEED_REJECTED}an edge with unknown source node: ${link.from}`,
      ],
      [!knownNodeIds.has(link.to), `${SEED_REJECTED}an edge with unknown target node: ${link.to}`],
      [acceptedEdgeIds.has(id), `${SEED_REJECTED}duplicate edge: ${id}`],
      [
        hasPath(pendingEdges, link.to, link.from),
        `${SEED_REJECTED}an edge that would create a cycle: ${id}`,
      ],
    ];
    for (const [broken, detail] of checks) {
      if (broken) throw new Error(detail);
    }
    pendingEdges.push(link);
    acceptedEdgeIds.add(id);
  }

  const knownCollectionIds = new Set((graph.collections ?? []).map((item) => item.collectionId));
  const addedCollections: WorkflowGraphCollection[] = parsed.collections.map((collection) => {
    if (knownCollectionIds.has(collection.collectionId)) {
      throw new Error(`${SEED_REJECTED}duplicate collection: ${collection.collectionId}`);
    }
    knownCollectionIds.add(collection.collectionId);
    const declaredIds = orderedNonempty([
      ...(collection.nodeIds ?? []),
      ...addedNodes
        .filter((node) => node.collectionId === collection.collectionId)
        .map((node) => node.id),
    ]);
    for (const declaredId of declaredIds) {
      if (!knownNodeIds.has(declaredId)) {
        throw new Error(
          `${SEED_COLLECTION_REJECTED}"${collection.collectionId}" references unknown node: ${declaredId}`,
        );
      }
    }
    return {
      ...carry<SeedCollection, WorkflowGraphCollection>(COLLECTION_FIELD_READERS, collection),
      nodeIds: declaredIds,
      phase: collection.phase ?? settings.phase,
    } as WorkflowGraphCollection;
  });

  const changed = addedNodes.length + addedEdges.length + addedCollections.length > 0;
  const next = changed
    ? {
        ...input,
        graph: {
          collections: [...(graph.collections ?? []), ...addedCollections],
          edges: [...graph.edges, ...addedEdges],
          nodes: [...graph.nodes, ...addedNodes],
        },
        updatedAt: settings.timestamp,
      }
    : input;
  return { addedCollections, addedEdges, addedNodes, changed, snapshot: next };
}
