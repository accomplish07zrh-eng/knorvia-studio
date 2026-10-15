// SPDX-License-Identifier: Apache-2.0
// 重试前的快照修复：把失败/中断的阶段与节点退回 pending，并清掉失败标记与暂停原因。
// 所有改动都通过「作用域集合 + 两次 map」表达，便于一眼看出哪些条目会被重置。
import { deriveWorkflowSessionLinks, type ExpertWorkflowRunSnapshot } from "@knorvia/contracts";
import { reconcileWorkflowSnapshotForResume, type WorkflowGraphNodeChange } from "../lifecycle.js";
import { phaseNodeId } from "./ids.js";
import { dedupeWorkflowNodeChanges, type ExpertWorkflowRuntimeContext } from "./runtime-context.js";
import type { ExpertWorkflowRetryOptions } from "./types.js";

type Snapshot = ExpertWorkflowRunSnapshot;
type RetrySelection = Pick<ExpertWorkflowRetryOptions, "activityId" | "nodeId" | "phase">;

/** 需要重置的节点状态：失败与中断中的节点。 */
const RESETTABLE_STATUSES: ReadonlySet<Snapshot["graph"]["nodes"][number]["status"]> = new Set([
  "active",
  "failed",
]);

export function prepareSnapshotForRetry(
  runtime: ExpertWorkflowRuntimeContext,
  input: Snapshot,
  selection: RetrySelection,
): { nodeChanges: WorkflowGraphNodeChange[]; snapshot: Snapshot } {
  const stamp = runtime.timestamp();
  const activity =
    selection.activityId === undefined
      ? undefined
      : input.activities.find((entry) => entry.activityId === selection.activityId);

  const section = selection.phase ?? activity?.phase ?? input.failure?.phase ?? input.currentPhase;
  const targetNodeId = selection.nodeId ?? activity?.nodeId ?? input.failure?.nodeId;

  const inSection = (node: Snapshot["graph"]["nodes"][number]): boolean =>
    !section || node.phase === section || node.id === phaseNodeId(section);
  const scopedIds =
    targetNodeId === undefined
      ? input.graph.nodes
          .filter((node) => inSection(node) && RESETTABLE_STATUSES.has(node.status))
          .map((node) => node.id)
      : [targetNodeId];
  const scope = new Set(scopedIds);

  const repair = reconcileWorkflowSnapshotForResume(input, {
    nodeIds: scope.size === 0 ? undefined : scope,
    timestamp: stamp,
  });

  const nodeChanges: WorkflowGraphNodeChange[] = [...repair.nodeChanges];
  const nodes = repair.snapshot.graph.nodes.map((node) => {
    if (!scope.has(node.id) || !RESETTABLE_STATUSES.has(node.status)) return node;
    const resetNode = { ...node, error: undefined, status: "pending" as const };
    nodeChanges.push({ nodeId: node.id, phase: node.phase, status: resetNode.status });
    return resetNode;
  });
  const phases = repair.snapshot.phases.map((entry) => {
    const resettable = entry.status === "failed" || entry.status === "active";
    if (!section || entry.phase !== section || !resettable) return entry;
    return { ...entry, completedAt: undefined, error: undefined, status: "pending" as const };
  });

  const base = repair.snapshot;
  const next: Snapshot = {
    ...base,
    graph: { collections: base.graph.collections, edges: base.graph.edges, nodes },
    phases,
    recoveryActions: [],
    sessionLinks: deriveWorkflowSessionLinks({ activities: base.activities, runId: base.runId }),
    status: "running",
    updatedAt: stamp,
    failure: undefined,
    pauseReason: undefined,
  };
  return { nodeChanges: dedupeWorkflowNodeChanges(nodeChanges), snapshot: next };
}
