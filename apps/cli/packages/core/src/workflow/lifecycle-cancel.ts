// SPDX-License-Identifier: Apache-2.0
// 取消：把可取消的节点/相位/活动标记为 cancelled，并写取消时间。
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import {
  cancelledActivity,
  cancelledNode,
  cancelledPhase,
  changeOf,
  isCancellable,
  withLinks,
  withNodes,
  withPhases,
} from "./lifecycle-shared.js";
import { accumulator, type WorkflowSnapshotLifecycleResult } from "./lifecycle-resume.js";

type Snap = WorkflowRunSnapshot;
type Node = Snap["graph"]["nodes"][number];
type Phase = Snap["phases"][number];
type Activity = Snap["activities"][number];

/** 取消选项：可选原因与必填时间戳。 */
export type CancelWorkflowSnapshotOptions = Partial<{ reason: string }> & { timestamp: string };

/** 是否有任何条目被改动。 */
const hasChanges = (counts: readonly number[]): boolean => counts.some((count) => count > 0);

/** 取消态快照：节点/相位/活动投影后补 completedAt 与 status。 */
const cancelledSnapshot = <T extends Snap>(
  snapshot: T,
  nodes: Node[],
  phases: Phase[],
  activities: Activity[],
  at: string,
): T =>
  Object.assign({}, withLinks(withPhases(withNodes(snapshot, nodes), phases), activities, at), {
    completedAt: at,
    status: "cancelled" as const,
  }) as T;

export function cancelWorkflowSnapshot<T extends Snap>(
  snapshot: T,
  opts: CancelWorkflowSnapshotOptions,
): WorkflowSnapshotLifecycleResult<T> {
  const reason = opts.reason ?? "Workflow cancelled.";
  const at = opts.timestamp;
  const acc = accumulator();

  const nodes = snapshot.graph.nodes.map((node) => {
    if (!isCancellable(node.status)) return node;
    acc.nodeChanges.push(changeOf(node, "cancelled"));
    return cancelledNode(node, reason);
  });
  const phases = snapshot.phases.map((phase: Phase) => {
    if (!isCancellable(phase.status)) return phase;
    acc.phaseIds.push(phase.phase);
    return cancelledPhase(phase, reason, at);
  });
  const activities = snapshot.activities.map((activity) => {
    if (!isCancellable(activity.status)) return activity;
    acc.activityIds.push(activity.activityId);
    return cancelledActivity(activity, reason, at);
  });

  const counts = [acc.nodeChanges.length, acc.phaseIds.length, acc.activityIds.length];
  const changed =
    snapshot.status !== "cancelled" || snapshot.completedAt !== at || hasChanges(counts);
  if (!changed) return { ...acc, changed, snapshot };
  return {
    ...acc,
    changed,
    snapshot: cancelledSnapshot(snapshot, nodes, phases, activities, at),
  };
}
