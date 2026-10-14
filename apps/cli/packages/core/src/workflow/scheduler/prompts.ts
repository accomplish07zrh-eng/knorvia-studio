// SPDX-License-Identifier: Apache-2.0
// 调度器默认提示词：节点提示词、规划器提示词与工件名净化。
import type {
  WorkflowGraphCollection,
  WorkflowGraphNode,
  WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { collectionNodeIdsForGraph, nodeById } from "./graph.js";

const NL = "\n";
const BLANK = "";
const ARTIFACTS_HEADING = "Previous artifacts available on disk:";
const NO_ARTIFACTS = "No previous artifacts yet.";
const COLLECTION_NODES_HEADING = "Existing collection nodes:";
const NO_COLLECTION_NODES = "No existing collection nodes.";
const PLANNER_JSON_HEADING = "Return only JSON matching this shape:";
const NODE_OUTPUT_CONTRACT =
  "Execute only this node's scope. Return a concise Markdown artifact " +
  "with changes, validation, and residual risk.";
const PLANNER_JSON_SHAPE =
  '{"nodes":[{"id":"string","title":"string","description":"string","dependsOn":["node-id"],"prompt":"string"}],"edges":[{"from":"node-id","to":"node-id"}],"collectionNodeIds":["node-id"],"exhausted":false,"reasoning":"string"}';
const PLANNER_RULES =
  "Use unique node ids, avoid cycles, " +
  "and set exhausted=true only when no useful expansion remains.";
const UNSAFE_NAME_CHARS = /[^A-Za-z0-9._-]/g;
const MAX_NAME_LENGTH = 100;
const FALLBACK_NAME = "node";

/** 运行头部三行：身份、运行号与工作目录。 */
const runHeader = (lead: string, snapshot: WorkflowRunSnapshot): string[] => [
  lead,
  `Workflow run: ` + `${snapshot.runId}`,
  `Working directory: ` + `${snapshot.cwd}`,
];

/** 任务段：整段嵌入用户任务原文。 */
const taskSection = (snapshot: WorkflowRunSnapshot): string[] => [
  BLANK,
  `User task:` + `${NL}${snapshot.task}`,
  BLANK,
];

/** 工件段落：有工件给标题 + 清单，否则给固定说明句。 */
const artifactSection = (snapshot: WorkflowRunSnapshot): string[] => {
  const rows = snapshot.artifacts.map((entry) => `- ${entry.label}: ${entry.path}`);
  const listed = rows.join(NL);
  return listed.length === 0 ? [NO_ARTIFACTS] : [ARTIFACTS_HEADING, listed];
};

/** 集合节点行：状态 + 标题 + 可选描述。 */
const nodeLine = (node: WorkflowGraphNode): string => {
  const description = node.description ? ` - ${node.description}` : "";
  return `- ${node.id} [${node.status}]: ${node.title}${description}`;
};

/** 集合节点清单：只保留仍存在于图中的节点。 */
const collectionNodeLines = (
  snapshot: WorkflowRunSnapshot,
  collection: WorkflowGraphCollection,
): string[] => {
  const ids = collectionNodeIdsForGraph(collection, snapshot.graph);
  return ids.flatMap((id) => {
    const node = nodeById(snapshot.graph, id);
    return node === undefined ? [] : [nodeLine(node)];
  });
};

/** 节点提示词：身份 + 任务 + 工件清单 + 输出要求。 */
export function buildDefaultNodePrompt(
  snapshot: WorkflowRunSnapshot,
  node: WorkflowGraphNode,
  phase: string,
): string {
  const sections = [
    ...runHeader(`You are running a Knorvia Studio workflow node for phase: ${phase}.`, snapshot),
    ...taskSection(snapshot),
    `Node: ` + `${node.title}`,
    `Node id: ` + `${node.id}`,
  ];
  const optional: readonly (readonly [string | undefined, string])[] = [
    [node.description, "Node objective"],
    [node.prompt, "Node prompt"],
  ];
  for (const [value, label] of optional) {
    if (value) sections.push(`${label}:${NL}${value}`);
  }
  sections.push(BLANK, ...artifactSection(snapshot), BLANK, NODE_OUTPUT_CONTRACT);
  return sections.join(NL);
}

/** 规划器提示词：集合上下文 + 现有节点 + JSON 形状与规则。 */
export function buildDefaultPlannerPrompt(
  snapshot: WorkflowRunSnapshot,
  collection: WorkflowGraphCollection,
  phase: string,
): string {
  const title = collection.title ?? collection.collectionId;
  const sections = [
    ...runHeader(
      `You are running a Knorvia Studio workflow exploration planner for phase: ${phase}.`,
      snapshot,
    ),
    ...taskSection(snapshot),
    `Collection: ` + `${title}`,
    `Collection id: ` + `${collection.collectionId}`,
  ];
  const optional: readonly (readonly [string | undefined, string])[] = [
    [collection.goal, "Goal"],
    [collection.metric, "Metric"],
  ];
  for (const [value, label] of optional) {
    if (value) sections.push(`${label}:${NL}${value}`);
  }

  const listed = collectionNodeLines(snapshot, collection).join(NL);
  sections.push(
    BLANK,
    ...(listed.length === 0 ? [NO_COLLECTION_NODES] : [COLLECTION_NODES_HEADING, listed]),
    BLANK,
    PLANNER_JSON_HEADING,
    PLANNER_JSON_SHAPE,
    PLANNER_RULES,
  );
  return sections.join(NL);
}

/** 工件名净化：非法字符替换为下划线，截断到 100 字符，空则用兜底名。 */
export function safeArtifactName(value: string): string {
  const cleaned = value.replace(UNSAFE_NAME_CHARS, "_").slice(0, MAX_NAME_LENGTH);
  return cleaned.length === 0 ? FALLBACK_NAME : cleaned;
}
