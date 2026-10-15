// SPDX-License-Identifier: Apache-2.0
// 节点提示词更新：按 id 覆盖 description/prompt/title，未变化则不算变更。
import {
  WorkflowNodePromptUpdateSetSchema,
  type WorkflowNodePromptUpdate,
  type WorkflowRunSnapshot,
} from "@knorvia/contracts";
import { withNodes } from "./lifecycle-shared.js";

type Snap = WorkflowRunSnapshot;
type Node = Snap["graph"]["nodes"][number];
type Update = WorkflowNodePromptUpdate;

const DUPLICATE_PREFIX = "Workflow node prompt update returned duplicate node: ";
const UNKNOWN_PREFIX = "Workflow node prompt update references unknown node: ";
const PHASE_PREFIX = "Workflow node prompt update for ";

/** 提示词更新选项：相位与时间戳都必填。 */
export type ApplyWorkflowNodePromptUpdatesOptions = { phase: string; timestamp: string };

/** 提示词更新结果的公共字段。 */
type UpdateResultBase = { changed: boolean; updatedNodes: Node[] };

/** 提示词更新结果：公共字段 + 目标快照类型。 */
export type ApplyWorkflowNodePromptUpdatesResult<T extends Snap> = UpdateResultBase & {
  snapshot: T;
};

/** 提示词更新索引：重复 id 直接抛错。 */
const indexUpdates = (
  updates: readonly Update[],
  known: ReadonlySet<string>,
): Map<string, Update> => {
  const parsed = WorkflowNodePromptUpdateSetSchema.parse({ nodes: updates });
  const byId = parsed.nodes.reduce<Map<string, Update>>((index, update) => {
    if (index.has(update.id)) {
      throw new Error(`${DUPLICATE_PREFIX}${update.id}`);
    }
    index.set(update.id, update);
    return index;
  }, new Map());
  for (const id of byId.keys()) {
    if (!known.has(id)) throw new Error(`${UNKNOWN_PREFIX}${id}`);
  }
  return byId;
};

/** 字段补丁：更新里给了值就覆盖，否则保留节点原值。 */
const patchOf = (node: Node, update: Update): Record<string, unknown> =>
  Object.fromEntries([
    ["description", update.description ?? node.description],
    ["prompt", update.prompt ?? node.prompt],
    ["title", update.title ?? node.title],
  ]);

/** 是否与节点原值完全一致。 */
const isUnchanged = (node: Node, patch: Record<string, unknown>): boolean =>
  Object.entries(patch).every(([key, value]) => node[key as keyof Node] === value);

/** 单节点更新：相位不符抛错；无变化返回 null。 */
const applyUpdate = (node: Node, update: Update, phase: string): Node | null => {
  if (node.phase !== undefined && node.phase !== phase) {
    throw new Error(
      `${PHASE_PREFIX}"${node.id}" targets phase "${phase}" but node belongs to "${node.phase}"`,
    );
  }
  const patch = patchOf(node, update);
  return isUnchanged(node, patch) ? null : (Object.assign({}, node, patch) as Node);
};

export function applyWorkflowNodePromptUpdates<T extends Snap>(
  snapshot: T,
  updates: readonly Update[],
  opts: ApplyWorkflowNodePromptUpdatesOptions,
): ApplyWorkflowNodePromptUpdatesResult<T> {
  const known = new Set(snapshot.graph.nodes.map((node) => node.id));
  const byId = indexUpdates(updates, known);
  if (byId.size === 0) return { changed: false, snapshot, updatedNodes: [] };

  const updatedNodes: Node[] = [];
  const nodes = snapshot.graph.nodes.map((node) => {
    const update = byId.get(node.id);
    if (!update) return node;
    const candidate = applyUpdate(node, update, opts.phase);
    if (candidate === null) return node;
    updatedNodes.push(candidate);
    return candidate;
  });
  if (updatedNodes.length === 0) return { changed: false, snapshot, updatedNodes };
  return {
    changed: true,
    snapshot: Object.assign({}, withNodes(snapshot, nodes as Node[]), {
      updatedAt: opts.timestamp,
    }),
    updatedNodes,
  };
}
