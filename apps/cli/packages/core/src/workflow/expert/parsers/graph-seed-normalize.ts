// SPDX-License-Identifier: Apache-2.0
// 图种子归一化：把模型给的松散结构（数组/对象、驼峰/下划线键）整理成 WorkflowGraphSeed。
import { WorkflowGraphSeedSchema, type WorkflowGraphSeed } from "@knorvia/contracts";
import {
  isRecord,
  readLooseArray,
  readLooseBoolean,
  readLoosePositiveInteger,
  readLooseString,
  readLooseStringArray,
  readLooseValue,
  stringValue,
} from "./json.js";

/** 各类字段的候选键：驼峰与下划线两种写法都接受。 */
const KEYS = {
  collectionId: ["collectionId", "collection_id", "collection"],
  collectionNodeIds: ["nodeIds", "node_ids", "nodeNames", "node_names"],
  dependsOn: ["dependsOn", "depends_on", "references", "inputs"],
  description: ["description", "goal"],
  edgeFrom: ["from", "source"],
  edgeTo: ["to", "target"],
  id: ["id", "name", "nodeName", "node_name"],
  nodes: ["nodes", "newNodes", "new_nodes"],
  edges: ["edges", "newEdges", "new_edges"],
  collections: ["collections"],
  collectionName: ["collectionId", "collection_id", "name", "id", "collectionsname"],
  frontierTarget: ["frontierTarget", "frontier_target"],
  phase: ["phase"],
  prompt: ["prompt", "instructions"],
  title: ["title", "summary"],
  collectionTitle: ["title"],
} as const;

/** 节点字段表：键即节点字段，值在归一化时求值。 */
const nodeFields = (value: Record<string, unknown>, id: string, defaultPhase: string) =>
  [
    ["collectionId", readLooseString(value, KEYS.collectionId)],
    ["dependsOn", readLooseStringArray(value, KEYS.dependsOn) ?? []],
    ["description", readLooseString(value, KEYS.description)],
    ["id", id],
    ["kind", value.kind === "phase" ? "phase" : "task"],
    ["phase", readLooseString(value, KEYS.phase) ?? defaultPhase],
    ["prompt", readLooseString(value, KEYS.prompt)],
    ["title", readLooseString(value, KEYS.title) ?? id],
  ] as const;

/** 集合字段表：键即集合字段，值在归一化时求值。 */
const collectionFields = (
  value: Record<string, unknown>,
  collectionId: string,
  defaultPhase: string,
) =>
  [
    ["collectionId", collectionId],
    ["explorable", readLooseBoolean(value, ["explorable"])],
    ["frontierTarget", readLoosePositiveInteger(value, KEYS.frontierTarget)],
    ["goal", readLooseString(value, ["goal"])],
    ["metric", readLooseString(value, ["metric"])],
    ["nodeIds", readLooseStringArray(value, KEYS.collectionNodeIds) ?? []],
    ["phase", readLooseString(value, KEYS.phase) ?? defaultPhase],
    ["title", readLooseString(value, KEYS.collectionTitle) ?? collectionId],
  ] as const;

/** 节点归一化：缺 id 视为无效。 */
function normalizeNode(value: unknown, defaultPhase: string): unknown {
  if (!isRecord(value)) return null;
  const id = readLooseString(value, KEYS.id);
  if (id === undefined) return null;
  return Object.fromEntries(nodeFields(value, id, defaultPhase));
}

/** 边归一化：from/to 都必须存在。 */
function normalizeEdge(value: unknown): unknown {
  if (!isRecord(value)) return null;
  const from = readLooseString(value, KEYS.edgeFrom);
  const to = readLooseString(value, KEYS.edgeTo);
  if (from === undefined || to === undefined) return null;
  return { from, to };
}

/** 集合归一化：缺集合 id 视为无效。 */
function normalizeCollection(value: unknown, defaultPhase: string): unknown {
  if (!isRecord(value)) return null;
  const collectionId = readLooseString(value, KEYS.collectionName);
  if (collectionId === undefined) return null;
  return Object.fromEntries(collectionFields(value, collectionId, defaultPhase));
}

/** 判定表：任一命中即认为是该形态。 */
type ShapeProbe = (value: Record<string, unknown>) => boolean;

const COLLECTION_PROBES: readonly ShapeProbe[] = [
  (value) =>
    typeof readLooseValue(value, ["collectionId", "collection_id", "name", "id"]) === "string",
  (value) => readLooseArray(value, KEYS.collectionNodeIds) !== undefined,
  (value) => typeof readLooseValue(value, ["goal"]) === "string",
  (value) => typeof readLooseValue(value, ["metric"]) === "string",
  (value) => typeof readLooseValue(value, ["explorable"]) === "boolean",
];

const NODE_PROBES: readonly ShapeProbe[] = [
  (value) => value.kind === "task" || value.kind === "phase",
  (value) => typeof readLooseValue(value, KEYS.id) === "string",
  (value) => typeof readLooseValue(value, KEYS.description) === "string",
  (value) => readLooseArray(value, KEYS.dependsOn) !== undefined,
];

const EDGE_PROBES: readonly ShapeProbe[] = [
  (value) => typeof readLooseValue(value, KEYS.edgeFrom) === "string",
  (value) => typeof readLooseValue(value, KEYS.edgeTo) === "string",
];

/** 按判定表识别形态（空数组视为不匹配）。 */
const matches = (value: unknown, probes: readonly ShapeProbe[]): boolean => {
  if (!isRecord(value)) return false;
  return probes.some((probe) => probe(value));
};

const everyItem = (items: readonly unknown[], probes: readonly ShapeProbe[]): boolean =>
  items.length > 0 && items.every((item) => matches(item, probes));

/** 数组输入：按形态包成对象再归一化。 */
const asSeedInput = (value: readonly unknown[]): unknown => {
  if (everyItem(value, COLLECTION_PROBES)) return { collections: value };
  if (everyItem(value, NODE_PROBES)) return { nodes: value };
  if (everyItem(value, EDGE_PROBES)) return { edges: value };
  return value;
};

/** 归一化种子：识别形态 → 逐类归一化 → schema 校验。 */
export function normalizeWorkflowGraphSeedCandidate(
  value: unknown,
  defaultPhase: string,
): WorkflowGraphSeed | null {
  const candidate = Array.isArray(value) ? asSeedInput(value) : value;
  if (!isRecord(candidate)) return null;

  const nodes = (readLooseArray(candidate, KEYS.nodes) ?? [])
    .map((node) => normalizeNode(node, defaultPhase))
    .filter((node) => node !== null);
  const edges = (readLooseArray(candidate, KEYS.edges) ?? [])
    .map(normalizeEdge)
    .filter((edge) => edge !== null);
  const declaredCollections = readLooseArray(candidate, KEYS.collections);
  const collections = (
    declaredCollections ?? (matches(candidate, COLLECTION_PROBES) ? [candidate] : [])
  )
    .map((collection) => normalizeCollection(collection, defaultPhase))
    .filter((collection) => collection !== null);

  const parsed = WorkflowGraphSeedSchema.safeParse({
    collections,
    edges,
    nodes,
    reasoning: stringValue(candidate.reasoning),
  });
  return parsed.success ? parsed.data : null;
}
