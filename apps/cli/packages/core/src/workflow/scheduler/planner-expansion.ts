// SPDX-License-Identifier: Apache-2.0
// 规划器扩张落地：解析结果、构造新增节点与依赖边、逐条校验、更新集合状态。
import {
  WorkflowGraphPlannerResultSchema,
  type WorkflowGraphCollectionStatus,
  type WorkflowGraphNode,
  type WorkflowGraphPlannerResult,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import {
  collectionFrontier,
  collectionNodeIdsForGraph,
  edgeId,
  graphCollections,
  normalizeCollection,
} from "./graph.js";
import { RouteIndex } from "./planner-expansion-routes.js";
import { edgeRejection } from "./planner-expansion-validate.js";
import type {
  AppliedPlannerExpansion,
  SchedulerCollection,
  WorkflowGraphRecordEdge,
  WorkflowGraphSchedulerPlannerRunResult,
} from "./types.js";

type Graph = WorkflowRunSnapshot["graph"];
type PlannerNode = WorkflowGraphPlannerResult["nodes"][number];

/** 扩张输入：快照、目标集合、规划器结果、未见的完成节点与时间戳。 */
export interface PlannerExpansionInput {
  collection: SchedulerCollection;
  rawResult: WorkflowGraphSchedulerPlannerRunResult;
  snapshot: WorkflowRunSnapshot;
  timestamp: string;
  unseenCompletions: readonly string[];
}

/** 唯一性断言：新增节点 id 不得与图中已有节点重复，返回合并后的 id 集合。 */
const assertUniqueNodes = (graph: Graph, nodes: readonly WorkflowGraphNode[]): Set<string> => {
  const ids = new Set(graph.nodes.map((node) => node.id));
  for (const node of nodes) {
    if (ids.has(node.id)) {
      throw new Error(`Planner returned duplicate workflow node: ${node.id}`);
    }
    ids.add(node.id);
  }
  return ids;
};

/** 索引种子：把图中已有边灌入接受集合与路由索引。 */
const seedIndex = (graph: Graph): { accepted: Set<string>; index: RouteIndex } => {
  const accepted = new Set<string>();
  const index = new RouteIndex();
  for (const edge of graph.edges) {
    accepted.add(edgeId(edge));
    index.add(edge);
  }
  return { accepted, index };
};

/** 集合成员：已有成员 + 规划器声明的成员（缺省为全部新增节点）。 */
const nextMembership = (
  collection: SchedulerCollection,
  graph: Graph,
  result: WorkflowGraphPlannerResult,
  nodes: readonly WorkflowGraphNode[],
): Set<string> => {
  const membership = new Set(collectionNodeIdsForGraph(collection, graph));
  const requested = result.collectionNodeIds ?? nodes.map((node) => node.id);
  for (const id of requested) membership.add(id);
  return membership;
};

/** 新增节点字段表：集合缺省时归入当前集合。 */
const addedNodeFields = (
  node: PlannerNode,
  collectionId: string,
): readonly (readonly [string, unknown])[] => [
  ["collectionId", node.collectionId ?? collectionId],
  ["dependsOn", node.dependsOn],
  ["description", node.description],
  ["id", node.id],
  ["kind", node.kind],
  ["phase", node.phase],
  ["prompt", node.prompt],
  ["status", "pending"],
  ["title", node.title],
];

/** 依赖边补全：折叠出「尚未存在的依赖边」，跨节点去重。 */
const inferDependencyEdges = (
  graph: Graph,
  nodes: readonly WorkflowGraphNode[],
  edges: readonly WorkflowGraphRecordEdge[],
): WorkflowGraphRecordEdge[] => {
  const state = nodes.reduce<{ edges: WorkflowGraphRecordEdge[]; known: Set<string> }>(
    (outer, node) =>
      node.dependsOn.reduce((inner, dependency) => {
        const candidate = { from: dependency, to: node.id };
        const key = edgeId(candidate);
        if (inner.known.has(key)) return inner;
        inner.known.add(key);
        inner.edges.push(candidate);
        return inner;
      }, outer),
    { edges: [], known: new Set([...graph.edges, ...edges].map((edge) => edgeId(edge))) },
  );
  return [...edges, ...state.edges];
};

/** 集合状态推进：耗尽 → active → draining/exhausted 三档。 */
const nextCollectionStatus = (
  result: WorkflowGraphPlannerResult,
  collection: SchedulerCollection,
  graph: Graph,
  graphChanged: boolean,
  unseenCompletions: readonly string[],
): WorkflowGraphCollectionStatus => {
  if (result.exhausted === true) return "exhausted";
  if (graphChanged || collectionFrontier(graph, collection) > 0 || unseenCompletions.length > 0) {
    return "active";
  }
  return collection.status === "draining" ? "exhausted" : "draining";
};

/** 图投影：把新增边与节点并入原图，并替换目标集合条目。 */
const projectGraph = (
  graph: Graph,
  collections: Graph["collections"],
  addedNodes: readonly WorkflowGraphNode[],
  addedEdges: readonly WorkflowGraphRecordEdge[],
): Graph => ({
  collections,
  edges: [...graph.edges, ...addedEdges],
  nodes: [...graph.nodes, ...addedNodes],
});

/** 尾部装配：更新集合状态、替换集合条目并产出新快照。 */
const assembleExpansion = (
  input: PlannerExpansionInput,
  addedNodes: readonly WorkflowGraphNode[],
  addedEdges: readonly WorkflowGraphRecordEdge[],
  graphChanged: boolean,
  result: WorkflowGraphPlannerResult,
): AppliedPlannerExpansion => {
  const { collection, snapshot, timestamp, unseenCompletions } = input;
  const graph = snapshot.graph;
  const status = nextCollectionStatus(result, collection, graph, graphChanged, unseenCompletions);
  const patch = Object.fromEntries([
    ["analyzedNodeIds", [...new Set([...collection.analyzedNodeIds, ...unseenCompletions])]],
    ["exhausted", status === "exhausted"],
    ["lastGraphChangeAt", graphChanged ? timestamp : collection.lastGraphChangeAt],
    ["nodeIds", [...nextMembership(collection, graph, result, addedNodes)]],
    ["status", status],
  ]);
  const nextCollection = normalizeCollection({ ...collection, ...patch });
  const collections = graphCollections(graph).map((entry) =>
    entry.collectionId === collection.collectionId ? nextCollection : entry,
  );
  return {
    addedEdges: [...addedEdges],
    addedNodes: [...addedNodes],
    collection: nextCollection,
    snapshot: {
      ...snapshot,
      graph: projectGraph(graph, collections, addedNodes, addedEdges),
      updatedAt: timestamp,
    },
  };
};

export function applyPlannerExpansion(
  snapshot: WorkflowRunSnapshot,
  collection: SchedulerCollection,
  rawResult: WorkflowGraphSchedulerPlannerRunResult,
  unseenCompletions: readonly string[],
  timestamp: string,
): AppliedPlannerExpansion {
  const input: PlannerExpansionInput = {
    collection,
    rawResult,
    snapshot,
    timestamp,
    unseenCompletions,
  };
  const result = WorkflowGraphPlannerResultSchema.parse(input.rawResult);
  const graph = input.snapshot.graph;
  const addedNodes = result.nodes.map(
    (node) =>
      Object.fromEntries(addedNodeFields(node, input.collection.collectionId)) as WorkflowGraphNode,
  );
  const nodeIds = assertUniqueNodes(graph, addedNodes);
  const addedEdges = inferDependencyEdges(graph, addedNodes, result.edges);

  const { accepted, index } = seedIndex(graph);
  for (const edge of addedEdges) {
    const reason = edgeRejection({ accepted, edge, index, nodeIds });
    if (reason !== null) throw new Error(reason);
    accepted.add(edgeId(edge));
    index.add(edge);
  }

  const graphChanged = addedNodes.length > 0 || addedEdges.length > 0;
  return assembleExpansion(input, addedNodes, addedEdges, graphChanged, result);
}
