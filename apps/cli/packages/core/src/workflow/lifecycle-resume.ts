// SPDX-License-Identifier: Apache-2.0
// 恢复修复：把中断的 active 节点/相位/活动退回 pending 或 cancelled。
import type { WorkflowRunSnapshot } from "@knorvia/contracts";
import {
  cancelledActivity,
  changeOf,
  pendingNode,
  pendingPhase,
  withLinks,
  withNodes,
  withPhases,
  type WorkflowGraphNodeChange,
} from "./lifecycle-shared.js";

type Snap = WorkflowRunSnapshot;
type Node = Snap["graph"]["nodes"][number];
type Activity = Snap["activities"][number];
type Ids = Set<string>;

/** 恢复修复选项：可选开关与必填时间戳。 */
export type ReconcileWorkflowSnapshotForResumeOptions = Partial<{
  nodeIds: Iterable<string>;
  reason: string;
  resetActivities: boolean;
  resetPhases: boolean;
}> & { timestamp: string };

/** 生命周期结果的公共字段。 */
type LifecycleResultBase = {
  activityIds: string[];
  changed: boolean;
  nodeChanges: WorkflowGraphNodeChange[];
  phaseIds: string[];
};

/** 生命周期结果：公共字段 + 目标快照类型。 */
export type WorkflowSnapshotLifecycleResult<T extends Snap> = LifecycleResultBase & {
  snapshot: T;
};

const DEFAULT_REASON =
  "Reset during workflow resume because the previous " + "process stopped before completion.";

/** 结果累加器：三组被改动 id 一起维护。 */
export const accumulator = () => ({
  activityIds: [] as string[],
  nodeChanges: [] as WorkflowGraphNodeChange[],
  phaseIds: [] as string[],
});

/** 中断的活动：在作用域内且为 active 才重置。 */
const inScope = (activity: Activity, scope: Ids | undefined, phases: Ids): boolean =>
  !scope || (!!activity.nodeId && scope.has(activity.nodeId)) || phases.has(activity.phase);

export function reconcileWorkflowSnapshotForResume<T extends Snap>(
  snapshot: T,
  opts: ReconcileWorkflowSnapshotForResumeOptions,
): WorkflowSnapshotLifecycleResult<T> {
  const reason = opts.reason ?? DEFAULT_REASON;
  const scope = opts.nodeIds ? new Set(opts.nodeIds) : undefined;
  const resetActivities = opts.resetActivities ?? true;
  const resetPhases = opts.resetPhases ?? true;
  const acc = accumulator();
  const touchedPhases = new Set<string>();

  const nodes = snapshot.graph.nodes.map((node) => {
    const reset = node.status === "active" && (!scope || scope.has(node.id));
    if (!reset) return node;
    acc.nodeChanges.push(changeOf(node, "pending"));
    if (node.phase) touchedPhases.add(node.phase);
    return pendingNode(node, reason);
  });

  const phases = snapshot.phases.map((phase) => {
    const reset =
      resetPhases && phase.status === "active" && (!scope || touchedPhases.has(phase.phase));
    if (!reset) return phase;
    acc.phaseIds.push(phase.phase);
    return pendingPhase(phase, reason);
  });

  const activities = snapshot.activities.map((activity) => {
    const reset =
      resetActivities && activity.status === "active" && inScope(activity, scope, touchedPhases);
    if (!reset) return activity;
    acc.activityIds.push(activity.activityId);
    return cancelledActivity(activity, reason, opts.timestamp);
  });

  const changed = acc.nodeChanges.length + acc.phaseIds.length + acc.activityIds.length > 0;
  if (!changed) return { ...acc, changed, snapshot };
  const repaired = withLinks(withNodes(snapshot, nodes as Node[]), activities, opts.timestamp);
  return { ...acc, changed, snapshot: withPhases(repaired, phases) };
}
