// SPDX-License-Identifier: Apache-2.0
// 调度器状态推导（实现逻辑，不属兼容面；行为由契约测试 B1/B9 与 workflow 契约覆盖）。
//
// 组织方式（替换阶段的自主决定）：旧实现在一个 160 行的函数里顺序做「建索引 → 逐节点派生 →
// 逐集合汇总」；这里拆成 buildAdjacency / classifyNodes / deriveCollectionState 三个纯函数，
// 派生函数只负责按顺序组合它们。状态所有者仍是调用方：本模块不保存任何状态，只做投影。
import type { WorkflowGraph, WorkflowGraphNode } from "./graph-schema-declarations.js";
import type { WorkflowNodeStatus } from "./definition-schemas.js";
import type { WorkflowRunSnapshot } from "./run-schema-declarations.js";
import type {
  WorkflowSchedulerActiveActivity,
  WorkflowSchedulerCollectionState,
  WorkflowSchedulerDerivedNode,
  WorkflowSchedulerState,
} from "./scheduler-state-declarations.js";

// 依赖算「已了结」的节点状态：这些状态不会再变化，因此不再阻塞下游。
const TERMINAL_DEPENDENCY_STATUSES: ReadonlySet<WorkflowNodeStatus> = new Set<WorkflowNodeStatus>([
  "cancelled",
  "completed",
  "failed",
  "skipped",
]);

// collections 在图上可选，这里固定成元素类型，避免三处重复 NonNullable。
type WorkflowCollection = NonNullable<WorkflowGraph["collections"]>[number];

interface GraphAdjacency {
  collectionIdsByNodeId: Map<string, string[]>;
  incomingById: Map<string, Set<string>>;
  nodesById: Map<string, WorkflowGraphNode>;
  outgoingById: Map<string, Set<string>>;
}

// 一次遍历建好四张索引：节点表、入边、出边、节点→集合。
// 入边先取 dependsOn（节点顺序），再按 graph.edges 顺序补边，保持旧实现的可观察顺序。
function buildAdjacency(graph: WorkflowGraph): GraphAdjacency {
  const nodesById = new Map<string, WorkflowGraphNode>();
  const incomingById = new Map<string, Set<string>>();
  const outgoingById = new Map<string, Set<string>>();
  const collectionIdsByNodeId = new Map<string, string[]>();

  for (const node of graph.nodes) nodesById.set(node.id, node);
  for (const node of graph.nodes) incomingById.set(node.id, new Set(node.dependsOn));

  for (const edge of graph.edges) {
    const incoming = incomingById.get(edge.to) ?? new Set<string>();
    incoming.add(edge.from);
    incomingById.set(edge.to, incoming);
    const outgoing = outgoingById.get(edge.from) ?? new Set<string>();
    outgoing.add(edge.to);
    outgoingById.set(edge.from, outgoing);
  }

  const addCollection = (nodeId: string, collectionId: string, unique: boolean): void => {
    const existing = collectionIdsByNodeId.get(nodeId) ?? [];
    if (unique && existing.includes(collectionId)) return;
    existing.push(collectionId);
    collectionIdsByNodeId.set(nodeId, existing);
  };
  for (const collection of graph.collections ?? []) {
    for (const nodeId of collection.nodeIds ?? [])
      addCollection(nodeId, collection.collectionId, false);
  }
  for (const node of graph.nodes) {
    if (node.collectionId) addCollection(node.id, node.collectionId, true);
  }

  return { collectionIdsByNodeId, incomingById, nodesById, outgoingById };
}

// 依赖未了结（或依赖节点不存在）即视为阻塞；只有 pending 且无阻塞的节点算 ready。
function blockedDependenciesOf(node: WorkflowGraphNode, adjacency: GraphAdjacency): string[] {
  const incoming = Array.from(adjacency.incomingById.get(node.id) ?? []);
  return incoming.filter((dependencyId) => {
    const dependency = adjacency.nodesById.get(dependencyId);
    if (dependency === undefined) return true;
    return !TERMINAL_DEPENDENCY_STATUSES.has(dependency.status);
  });
}

interface DerivedNodes {
  activeNodeIds: string[];
  blockedNodes: WorkflowSchedulerState["blockedNodes"];
  counts: WorkflowSchedulerState["counts"];
  nodes: WorkflowSchedulerDerivedNode[];
  readyNodeIds: string[];
}

function classifyNodes(graph: WorkflowGraph, adjacency: GraphAdjacency): DerivedNodes {
  const counts: WorkflowSchedulerState["counts"] = {
    active: 0,
    blocked: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    ready: 0,
    total: graph.nodes.length,
  };
  const activeNodeIds: string[] = [];
  const blockedNodes: WorkflowSchedulerState["blockedNodes"] = [];
  const nodes: WorkflowSchedulerDerivedNode[] = [];
  const readyNodeIds: string[] = [];

  for (const node of graph.nodes) {
    const blockedBy = blockedDependenciesOf(node, adjacency);
    const ready = node.status === "pending" && blockedBy.length === 0;
    nodes.push({
      blockedBy,
      collectionIds: adjacency.collectionIdsByNodeId.get(node.id) ?? [],
      incoming: Array.from(adjacency.incomingById.get(node.id) ?? []),
      node,
      outgoing: Array.from(adjacency.outgoingById.get(node.id) ?? []),
      ready,
    });

    if (node.status === "active") {
      counts.active += 1;
      activeNodeIds.push(node.id);
      continue;
    }
    if (node.status === "completed") {
      counts.completed += 1;
      continue;
    }
    if (node.status === "failed") {
      counts.failed += 1;
      continue;
    }
    if (node.status !== "pending") continue;
    counts.pending += 1;
    if (blockedBy.length > 0) {
      counts.blocked += 1;
      blockedNodes.push({ blockedBy, nodeId: node.id });
    }
    if (ready) {
      counts.ready += 1;
      readyNodeIds.push(node.id);
    }
  }

  return { activeNodeIds, blockedNodes, counts, nodes, readyNodeIds };
}

// 集合成员 = collection.nodeIds ∪「node.collectionId 指向本集合的节点」；顺序保持旧实现口径。
function collectionMembers(collection: WorkflowCollection, graph: WorkflowGraph): Set<string> {
  const memberIds = new Set<string>(collection.nodeIds ?? []);
  for (const node of graph.nodes) {
    if (node.collectionId === collection.collectionId) memberIds.add(node.id);
  }
  return memberIds;
}

function deriveCollectionState(
  collection: WorkflowCollection,
  graph: WorkflowGraph,
  nodesById: Map<string, WorkflowGraphNode>,
  readyNodeIds: readonly string[],
): WorkflowSchedulerCollectionState {
  const memberIds = collectionMembers(collection, graph);
  const activeNodeIds: string[] = [];
  const pendingNodeIds: string[] = [];
  const completedNodeIds: string[] = [];
  const failedNodeIds: string[] = [];

  for (const nodeId of memberIds) {
    const status = nodesById.get(nodeId)?.status;
    if (status === "active") activeNodeIds.push(nodeId);
    else if (status === "pending") pendingNodeIds.push(nodeId);
    else if (status === "completed") completedNodeIds.push(nodeId);
    else if (status === "failed") failedNodeIds.push(nodeId);
  }

  const state: WorkflowSchedulerCollectionState = {
    activeNodeIds,
    collection,
    completedNodeIds,
    errorCount: collection.errorCount ?? 0,
    exhausted: collection.exhausted ?? false,
    failedNodeIds,
    frontier: activeNodeIds.length + pendingNodeIds.length,
    frontierTarget: collection.frontierTarget,
    pendingNodeIds,
    plannerRuns: collection.plannerRuns ?? 0,
    readyNodeIds: readyNodeIds.filter((nodeId) => memberIds.has(nodeId)),
    status: collection.status ?? "active",
  };
  return state;
}

export function deriveWorkflowSchedulerState(graph: WorkflowGraph): WorkflowSchedulerState {
  const adjacency = buildAdjacency(graph);
  const derived = classifyNodes(graph, adjacency);
  const collections = graph.collections ?? [];
  const state: WorkflowSchedulerState = {
    activeActivities: [],
    activeChildSessionIds: [],
    activeNodeIds: derived.activeNodeIds,
    blockedNodes: derived.blockedNodes,
    counts: derived.counts,
    collectionStates: collections.map((collection) =>
      deriveCollectionState(collection, graph, adjacency.nodesById, derived.readyNodeIds),
    ),
    nodes: derived.nodes,
    readyNodeIds: derived.readyNodeIds,
  };
  return state;
}

// 运行态活动投影：只保留 active 的活动，可选标识缺省时整个键不出现（与旧实现一致）。
function activeActivityOf(
  activity: WorkflowRunSnapshot["activities"][number],
): WorkflowSchedulerActiveActivity {
  const projection: WorkflowSchedulerActiveActivity = {
    activityId: activity.activityId,
    phase: activity.phase,
  };
  if (activity.nodeId) projection.nodeId = activity.nodeId;
  if (activity.sessionId) projection.sessionId = activity.sessionId;
  if (activity.traceId) projection.traceId = activity.traceId;
  if (activity.turnId) projection.turnId = activity.turnId;
  return projection;
}

export function deriveWorkflowRunSchedulerState(
  snapshot: WorkflowRunSnapshot,
): WorkflowSchedulerState {
  const state = deriveWorkflowSchedulerState(snapshot.graph);
  const activeActivities: WorkflowSchedulerActiveActivity[] = [];
  for (const activity of snapshot.activities) {
    if (activity.status !== "active") continue;
    activeActivities.push(activeActivityOf(activity));
  }

  const activeChildSessionIds: string[] = [];
  for (const activity of activeActivities) {
    if (activity.sessionId !== undefined) activeChildSessionIds.push(activity.sessionId);
  }

  const runState: WorkflowSchedulerState = {
    ...state,
    activeActivities,
    activeChildSessionIds,
  };
  return runState;
}
