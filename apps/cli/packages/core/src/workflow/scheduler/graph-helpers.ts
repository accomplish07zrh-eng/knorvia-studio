// SPDX-License-Identifier: Apache-2.0
// 图与快照写入助手：节点/集合更新、活动与工件登记、边 id 与紧凑载荷。
// 读取类助手（集合与可执行节点）在 graph-collections.ts / graph-nodes.ts，此处再导出以保持既有导出面。
import {
  deriveWorkflowSessionLinks,
  type WorkflowActivitySnapshot,
  type WorkflowArtifact,
  type WorkflowGraphCollection,
  type WorkflowGraphNode,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { graphCollections, normalizeCollection, nodeById } from "./graph-collections.js";
import type { WorkflowGraphRecordEdge } from "./types.js";

export * from "./graph-collections.js";
export * from "./graph-nodes.js";

type Snapshot = WorkflowRunSnapshot;
type Activity = WorkflowActivitySnapshot;
type Artifact = WorkflowArtifact;
type NodePatch = Partial<Pick<WorkflowGraphNode, "attempts" | "error" | "status">>;
type CollectionPatch = Partial<WorkflowGraphCollection>;

const EDGE_ARROW = "->";

/** 按键原位替换列表项：命中则替换且保持位置，未命中则追加（上游语义）。 */
const replaceBy = <TItem>(
  list: readonly TItem[],
  keyOf: (item: TItem) => string,
  item: TItem,
): TItem[] => {
  const key = keyOf(item);
  const at = list.findIndex((entry) => keyOf(entry) === key);
  if (at < 0) return [...list, item];
  return list.map((entry, index) => (index === at ? item : entry));
};

/** 图投影：只换节点列表，集合与边原样带过。 */
const withNodes = (state: Snapshot, nodes: Snapshot["graph"]["nodes"]): Snapshot =>
  Object.assign({}, state, {
    graph: { collections: state.graph.collections, edges: state.graph.edges, nodes },
  });

/** 节点更新：按 id 覆盖给定字段，图结构不变。 */
export const updateGraphNode = (state: Snapshot, nodeId: string, patch: NodePatch): Snapshot => {
  const target = nodeById(state.graph, nodeId);
  if (target === undefined) return withNodes(state, state.graph.nodes);
  const nodes = replaceBy(state.graph.nodes, (node) => node.id, Object.assign({}, target, patch));
  return withNodes(state, nodes);
};

/** 集合更新：已存在则原地替换，否则追加；时间戳单独传入。 */
export const updateGraphCollection = (
  state: Snapshot,
  collectionId: string,
  patch: CollectionPatch,
  at: string,
): Snapshot => {
  const collections = graphCollections(state.graph);
  const existing = collections.find((entry) => entry.collectionId === collectionId);
  const merged = normalizeCollection(
    Object.assign({}, existing ?? { collectionId }, patch, { collectionId }),
  );
  const next = collections.some((entry) => entry.collectionId === collectionId)
    ? collections.map((entry) => (entry.collectionId === collectionId ? merged : entry))
    : [...collections, merged];
  return Object.assign({}, state, {
    graph: { collections: next, edges: state.graph.edges, nodes: state.graph.nodes },
    updatedAt: at,
  });
};

/** 活动登记：同 id 覆盖，并重算会话链接。 */
export const upsertActivity = (state: Snapshot, activity: Activity, at: string): Snapshot => {
  const activities = replaceBy(state.activities, (item) => item.activityId, activity);
  return Object.assign({}, state, {
    activities,
    sessionLinks: deriveWorkflowSessionLinks({ activities, runId: state.runId }),
    updatedAt: at,
  });
};

/** 工件登记：同路径覆盖。 */
export const addArtifact = (state: Snapshot, artifact: Artifact, at: string): Snapshot =>
  Object.assign({}, state, {
    artifacts: replaceBy(state.artifacts, (item) => item.path, artifact),
    updatedAt: at,
  });

/** 紧凑载荷：丢掉值为 undefined 的字段。 */
export const compactWorkflowPayload = (
  value: Record<string, unknown | undefined>,
): Record<string, unknown> =>
  Object.entries(value).reduce<Record<string, unknown>>((compact, [key, entry]) => {
    if (entry !== undefined) compact[key] = entry;
    return compact;
  }, {});

/** 边 id：`from->to`。 */
export const edgeId = (edge: WorkflowGraphRecordEdge): string =>
  [edge.from, edge.to].join(EDGE_ARROW);
