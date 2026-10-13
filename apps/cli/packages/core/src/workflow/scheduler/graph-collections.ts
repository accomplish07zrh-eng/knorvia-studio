// SPDX-License-Identifier: Apache-2.0
// 集合读取：默认值归一化、成员推导、前沿计数与相位判定。
import type { WorkflowGraph, WorkflowGraphCollection } from "@knorvia/contracts";
import type { SchedulerCollection } from "./types.js";

type Graph = WorkflowGraph;
type Collection = WorkflowGraphCollection;
type Ids = Set<string>;

/** 集合默认值：缺省字段按此补齐（显式 undefined 视为缺省）。 */
const COLLECTION_DEFAULTS = {
  analyzedNodeIds: [],
  errorCount: 0,
  exhausted: false,
  explorable: false,
  nodeIds: [],
  plannerRuns: 0,
  status: "active",
} as const;

/** 丢掉显式 undefined 的键：否则 Object.assign 会用 undefined 覆盖默认值。 */
const definedEntries = (value: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));

/** 图上的集合列表：逐条归一化。 */
export const graphCollections = (graph: Graph): SchedulerCollection[] =>
  (graph.collections ?? []).map(normalizeCollection);

/** 集合归一化：保留集合自身的键序与取值，只补缺失字段（与原文 { ...collection, … } 语义一致）。 */
export const normalizeCollection = (collection: Collection): SchedulerCollection => {
  const merged: Record<string, unknown> = definedEntries(collection);
  for (const [key, value] of Object.entries(COLLECTION_DEFAULTS)) {
    merged[key] = merged[key] ?? value;
  }
  return merged as unknown as SchedulerCollection;
};

/** 集合成员：显式声明 + 图上归属该集合的节点，去重后保持顺序。 */
export const collectionNodeIdsForGraph = (collection: Collection, graph: Graph): string[] => {
  const owned = graph.nodes
    .filter((node) => node.collectionId === collection.collectionId)
    .map((node) => node.id);
  return [...new Set([...(collection.nodeIds ?? []), ...owned])];
};

/** 集合前沿：成员里处于 pending / active 的数量。 */
export const collectionFrontier = (graph: Graph, collection: Collection): number => {
  const open = (nodeId: string): boolean => {
    const status = nodeById(graph, nodeId)?.status;
    return status === "pending" || status === "active";
  };
  const members = collectionNodeIdsForGraph(collection, graph);
  return members.reduce((count, nodeId) => (open(nodeId) ? count + 1 : count), 0);
};

/** 相位判定：集合声明了相位就比对相位，否则看是否有成员在执行集合内。 */
export const isCollectionInPhase = (
  target: Collection,
  graph: Graph,
  ids: Ids,
  phase: string,
): boolean => {
  if (target.phase) return target.phase === phase;
  const members = collectionNodeIdsForGraph(target, graph);
  if (members.length === 0) return true;
  return members.some((nodeId) => ids.has(nodeId));
};

/** 集合是否与图相关：有成员即相关。 */
export const isCollectionRelevant = (collection: Collection, graph: Graph): boolean =>
  collectionNodeIdsForGraph(collection, graph).length > 0;

/** 节点查找：按 id 取图节点。 */
export const nodeById = (graph: Graph, nodeId: string): Graph["nodes"][number] | undefined =>
  graph.nodes.find((node) => node.id === nodeId);
