// SPDX-License-Identifier: Apache-2.0
// 节点重开：校验终态与重开上限后把节点退回 pending。
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import { changeOf, REOPENABLE, withNodes } from "./lifecycle-shared.js";

type Snap = WorkflowRunSnapshot;
type Node = Snap["graph"]["nodes"][number];

const MISSING_PREFIX = "Workflow graph node not found: ";
const NOT_REOPENABLE_PREFIX = "Cannot reopen workflow node ";
const LIMIT_PREFIX = "Workflow node ";
const DEFAULT_MAX_REOPENS = 2;

/** 重开选项：节点必填，上限与原因可选。 */
export type ReopenWorkflowGraphNodeOptions = Partial<{
  maxReopens: number;
  reason: string;
}> & { nodeId: string; timestamp: string };

/** 重开结果的公共字段。 */
type ReopenResultBase = {
  changed: boolean;
  nodeChange: ReturnType<typeof changeOf>;
  reopenAttempts: number;
};

/** 重开结果：公共字段 + 目标快照类型。 */
export type ReopenWorkflowGraphNodeResult<T extends Snap> = ReopenResultBase & { snapshot: T };

/** 重开校验：终态与上限都通过时返回重开次数（含本次）。 */
const reopenAttemptsFor = (first: Node, nodeId: string, maxReopens: number): number => {
  if (!REOPENABLE.has(first.status)) {
    throw new Error(
      `${NOT_REOPENABLE_PREFIX}"${nodeId}": status is "${first.status}", expected completed, failed, or skipped`,
    );
  }
  const previous = first.reopenAttempts ?? 0;
  if (previous < maxReopens) return previous + 1;
  throw new Error(`${LIMIT_PREFIX}"${nodeId}" already reopened ${previous}x (max=${maxReopens})`);
};

export function reopenWorkflowGraphNode<T extends Snap>(
  snapshot: T,
  opts: ReopenWorkflowGraphNodeOptions,
): ReopenWorkflowGraphNodeResult<T> {
  const nodeId = opts.nodeId;
  const first = snapshot.graph.nodes.find((node) => node.id === nodeId);
  if (!first) throw new Error(`${MISSING_PREFIX}${nodeId}`);
  const reopenAttempts = reopenAttemptsFor(first, nodeId, opts.maxReopens ?? DEFAULT_MAX_REOPENS);
  const reason = opts.reason ?? "Reopened by workflow critic.";
  const nodes = snapshot.graph.nodes.map((node) =>
    node.id === nodeId
      ? { ...node, error: reason, reopenAttempts, status: "pending" as const }
      : node,
  );
  return {
    changed: true,
    nodeChange: changeOf(first, "pending"),
    reopenAttempts,
    snapshot: Object.assign({}, withNodes(snapshot, nodes as Node[]), {
      updatedAt: opts.timestamp,
    }),
  };
}
