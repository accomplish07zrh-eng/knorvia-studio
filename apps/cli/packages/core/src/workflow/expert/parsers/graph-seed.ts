// SPDX-License-Identifier: Apache-2.0
// 图种子与规划器结果：解析模型响应、给根节点补门控边、把规划器结果重建为 schema 结果。
// 归一化实现见 graph-seed-normalize.ts。
import {
  WorkflowGraphPlannerResultSchema,
  type WorkflowGraphPlannerResult,
  type WorkflowGraphSeed,
} from "@knorvia/contracts";
import { edgeId } from "../ids.js";
import {
  isRecord,
  parsePlannerJson,
  readLooseBoolean,
  readLooseStringArray,
  stringValue,
} from "./json.js";
import { normalizeWorkflowGraphSeedCandidate } from "./graph-seed-normalize.js";

export { normalizeWorkflowGraphSeedCandidate } from "./graph-seed-normalize.js";

const PLANNER_RESULT_ERROR = "Workflow planner did not return JSON graph expansion data";

/** 集合节点 id 的候选键：驼峰与下划线两种写法都接受。 */
const COLLECTION_KEYS = [
  "collectionNodeIds",
  "collection_node_ids",
  "collectionUpdates",
  "collection_updates",
] as const;

/** 解析候选：解析失败返回 null，交给调用方决定是否忽略。 */
const parseSeedCandidate = (response: string): unknown => {
  try {
    return parsePlannerJson(response);
  } catch {
    return null;
  }
};

/** 解析图种子：解析失败或归一化失败都返回 null。 */
export function parseWorkflowGraphSeed(
  response: string,
  defaultPhase: string,
): WorkflowGraphSeed | null {
  const candidate = parseSeedCandidate(response);
  return candidate === null ? null : normalizeWorkflowGraphSeedCandidate(candidate, defaultPhase);
}

/** 根节点：既没有声明依赖、也没有任何入边的节点。 */
const rootNodesOf = (seed: WorkflowGraphSeed): WorkflowGraphSeed["nodes"] => {
  const incoming = new Set(seed.edges.map((edge) => edge.to));
  return seed.nodes.filter((node) => (node.dependsOn ?? []).length === 0 && !incoming.has(node.id));
};

/** 门控边：给每个根节点补一条来自门控节点的边（已存在则跳过）。 */
const withGateEdges = (
  edges: WorkflowGraphSeed["edges"],
  gateNodeId: string,
  roots: WorkflowGraphSeed["nodes"],
): WorkflowGraphSeed["edges"] => {
  const next = [...edges];
  const known = new Set(next.map((edge) => edgeId(edge)));
  for (const root of roots) {
    const key = edgeId({ from: gateNodeId, to: root.id });
    if (known.has(key)) continue;
    next.push({ from: gateNodeId, to: root.id });
    known.add(key);
  }
  return next;
};

/** 给无入边的根节点补上来自门控节点的边，并让根节点依赖门控节点。 */
export function gateRootSeedNodes(seed: WorkflowGraphSeed, gateNodeId: string): WorkflowGraphSeed {
  const roots = rootNodesOf(seed);
  if (roots.length === 0) return seed;

  const edges = withGateEdges(seed.edges, gateNodeId, roots);
  const rootIds = new Set(roots.map((node) => node.id));
  const nodes = seed.nodes.map((node) =>
    rootIds.has(node.id)
      ? { ...node, dependsOn: [...new Set([...(node.dependsOn ?? []), gateNodeId])] }
      : node,
  );
  return { ...seed, edges, nodes };
}
/** 规划器结果：先按 schema 直读，失败再走「宽松种子 + 集合节点」重建。 */
export function parseWorkflowPlannerResult(
  payload: string,
  fallbackPhase: string,
): WorkflowGraphPlannerResult {
  const raw = parsePlannerJson(payload);
  const direct = WorkflowGraphPlannerResultSchema.safeParse(raw);
  if (direct.success) return direct.data;
  if (!isRecord(raw)) {
    throw new Error(PLANNER_RESULT_ERROR);
  }

  const seed = normalizeWorkflowGraphSeedCandidate(raw, fallbackPhase);
  const collectionNodeIds =
    readLooseStringArray(raw, COLLECTION_KEYS) ??
    seed?.collections.flatMap((collection) => collection.nodeIds);
  const rebuiltInput = Object.fromEntries([
    ["collectionNodeIds", collectionNodeIds],
    ["edges", seed?.edges ?? []],
    ["exhausted", readLooseBoolean(raw, ["exhausted"])],
    ["nodes", seed?.nodes ?? []],
    ["reasoning", stringValue(raw.reasoning)],
  ]);
  const rebuilt = WorkflowGraphPlannerResultSchema.safeParse(rebuiltInput);
  if (!rebuilt.success) {
    throw new Error(PLANNER_RESULT_ERROR);
  }
  return rebuilt.data;
}
