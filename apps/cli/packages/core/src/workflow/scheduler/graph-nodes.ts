// SPDX-License-Identifier: Apache-2.0
// 可执行节点读取：就绪、阻塞与完成判定（就绪/阻塞来自 contracts 的状态派生）。
import {
  deriveWorkflowSchedulerState,
  type WorkflowGraph,
  type WorkflowGraphNode,
  type WorkflowNodeStatus,
} from "@knorvia/contracts";
import { graphCollections, isCollectionRelevant } from "./graph-collections.js";

type Graph = WorkflowGraph;
type Ids = Set<string>;
type BlockedEntry = { blockedBy: string[]; nodeId: string };

/** 视为「已完成」的节点状态。 */
const COMPLETED_NODE_STATUSES: ReadonlySet<WorkflowNodeStatus> = new Set([
  "cancelled",
  "completed",
  "skipped",
]);

/** 派生状态：只取调度器需要的两个集合。 */
const derived = (graph: Graph): { blockedNodes: BlockedEntry[]; readyNodeIds: string[] } => {
  const { blockedNodes, readyNodeIds } = deriveWorkflowSchedulerState(graph);
  return { blockedNodes, readyNodeIds };
};

/** 就绪节点：属于可执行集合且被派生为 ready。 */
export const readyExecutableNodes = (graph: Graph, ids: Ids): WorkflowGraphNode[] => {
  const ready = new Set(derived(graph).readyNodeIds);
  return graph.nodes.filter((node) => ids.has(node.id) && ready.has(node.id));
};

/** 阻塞节点：属于可执行集合且被派生为 blocked。 */
export const blockedExecutableNodes = (graph: Graph, ids: Ids): BlockedEntry[] =>
  derived(graph).blockedNodes.filter((entry) => ids.has(entry.nodeId));

/** 未耗尽的探索型集合：等待集合时要求这些集合都已耗尽。 */
const unfinishedCollections = (graph: Graph): boolean =>
  graphCollections(graph)
    .filter((collection) => collection.explorable && isCollectionRelevant(collection, graph))
    .some((collection) => !collection.exhausted && collection.status !== "exhausted");

/** 完成判定：可执行节点全完成；等待集合时还要求相关集合都已耗尽。 */
export const areExecutableNodesComplete = (graph: Graph, ids: Ids, waits: boolean): boolean => {
  const scope = graph.nodes.filter((node) => ids.has(node.id));
  if (!scope.every((node) => COMPLETED_NODE_STATUSES.has(node.status))) return false;
  return waits ? !unfinishedCollections(graph) : true;
};
