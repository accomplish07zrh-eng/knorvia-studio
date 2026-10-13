// SPDX-License-Identifier: Apache-2.0
// 节点提示词更新集解析：接受数组、键值映射与松散字段名三种形态。
import {
  WorkflowNodePromptUpdateSchema,
  WorkflowNodePromptUpdateSetSchema,
  type WorkflowNodePromptUpdate,
} from "@knorvia/contracts";
import * as json from "./json.js";

/** 更新集形态。 */
type UpdateSet = { nodes: WorkflowNodePromptUpdate[]; reasoning?: string };

/** 提示词的基础键：模型常用的直接写法。 */
const PROMPT_KEYS = ["prompt", "instructions", "instruction", "rules"] as const;

/** 提示词的元信息键：旧版与包装写法。 */
const META_PROMPT_KEYS = ["metaPrompt", "meta_prompt", "nodePrompt", "node_prompt"] as const;

/** 字段候选键表：同一语义的多种写法集中一处。 */
const KEYS = {
  description: ["description", "objective", "goal", "summary"],
  id: ["id", "name", "nodeId", "node_id", "nodeName", "node_name"],
  nodes: ["nodes", "nodePrompts", "node_prompts", "nodeInstructions", "node_instructions"],
  keyed: ["nodePrompts", "node_prompts", "nodeInstructions", "node_instructions", "prompts"],
  prompt: [...PROMPT_KEYS, ...META_PROMPT_KEYS],
  title: ["title"],
} as const;

/** 解析候选：解析失败按空值处理。 */
const parseCandidate = (response: string): unknown =>
  json.attemptOrNull(() => json.parsePlannerJson(response));

/** 键值映射 → 候选数组：字符串值当作 prompt，对象值补上 id。 */
function keyedCandidates(value: unknown): unknown[] {
  if (!json.isRecord(value)) return [];
  const entries = Object.entries(value);
  const builders: readonly ((key: string, entry: unknown) => unknown)[] = [
    (key, entry) => ({ id: key, prompt: entry }),
    (key, entry) => ({ id: key, ...(entry as Record<string, unknown>) }),
    (key) => ({ id: key }),
  ];
  return entries.map(([key, entry]) => {
    const pick = typeof entry === "string" ? 0 : json.isRecord(entry) ? 1 : 2;
    return builders[pick](key, entry);
  });
}

/** 单个更新项：缺 id 或 schema 不通过都返回 null。 */
const normalizeNode = (value: unknown): WorkflowNodePromptUpdate | null => {
  if (!json.isRecord(value)) return null;
  const id = json.readLooseString(value, KEYS.id);
  if (id === undefined) return null;
  const fields = Object.fromEntries([
    ["description", json.readLooseString(value, KEYS.description)],
    ["id", id],
    ["prompt", json.readLooseString(value, KEYS.prompt)],
    ["title", json.readLooseString(value, KEYS.title)],
  ]);
  return json.parseOrNull(WorkflowNodePromptUpdateSchema, fields);
};

/** 直读结果是否可用：非空且至少含一个节点。 */
const hasNodes = (set: UpdateSet | null): set is UpdateSet => set !== null && set.nodes.length > 0;

/** 更新集归一化：直读 → 合并数组与键值候选 → 重新校验。 */
function normalizeUpdateSet(value: unknown): UpdateSet | null {
  const candidate = Array.isArray(value) ? { nodes: value } : value;
  if (!json.isRecord(candidate)) return null;

  const direct = json.parseOrNull(WorkflowNodePromptUpdateSetSchema, candidate);
  if (hasNodes(direct)) return direct;

  const collected = [
    ...(json.readLooseArray(candidate, KEYS.nodes) ?? []),
    ...keyedCandidates(json.readLooseValue(candidate, KEYS.keyed)),
  ];
  const nodes = json.withoutNulls(collected.map(normalizeNode));
  const rebuilt = Object.fromEntries([
    ["nodes", nodes],
    ["reasoning", json.stringValue(candidate.reasoning)],
  ]);
  return json.parseOrNull(WorkflowNodePromptUpdateSetSchema, rebuilt);
}

export function parseWorkflowNodePromptUpdateSet(response: string): UpdateSet | null {
  const candidate = parseCandidate(response);
  return candidate === null ? null : normalizeUpdateSet(candidate);
}
