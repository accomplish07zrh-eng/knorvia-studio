// SPDX-License-Identifier: Apache-2.0
// Source-exposed promotion plan/permission owner; source review and verification pending.
import type { IKnorviaTaskService, KnorviaGroupedTaskView } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type { WorkspaceOptimisticTaskOverlay } from "@/hooks/workspaceTaskListOptimisticOverlay.js";
import { buildTaskEntityKey } from "@/lib/taskQueryCache.js";
import { viewToOrderInput } from "./groupedMutationProjection.js";

type PromotionPlan = { settledRoots: KnorviaTaskMeta[]; groupTasks: KnorviaTaskMeta[] };

/** First-occurrence indexes retain the original find semantics, including duplicate keys. */
export function planGroupedPromotions({ view, displayedView, overlays, visibleMissing }: {
  view: KnorviaGroupedTaskView;
  displayedView: KnorviaGroupedTaskView;
  overlays: Iterable<WorkspaceOptimisticTaskOverlay>;
  visibleMissing: ReadonlySet<string>;
}): PromotionPlan {
  const accepted = new Set<string>(), groupHeads = new Map<string, string | null>();
  const displayed = new Map<string, KnorviaTaskMeta>();
  for (const node of view.nodes) {
    const tasks = node.type === "group" ? node.tasks : [node.task];
    for (const task of tasks) accepted.add(buildTaskEntityKey(task));
    if (node.type === "group" && !groupHeads.has(node.group.id)) {
      groupHeads.set(node.group.id, node.tasks[0] ? buildTaskEntityKey(node.tasks[0]) : null);
    }
  }
  for (const node of displayedView.nodes) {
    for (const task of node.type === "group" ? node.tasks : [node.task]) {
      const key = buildTaskEntityKey(task);
      if (!displayed.has(key)) displayed.set(key, task);
    }
  }
  const first = view.nodes[0];
  const rootHead = first?.type === "task" ? buildTaskEntityKey(first.task) : null;
  const plan: PromotionPlan = { settledRoots: [], groupTasks: [] };
  for (const overlay of overlays) {
    for (const [taskId, promotion] of Object.entries(overlay.promotedGroupedDraftTaskByTaskId ?? {})) {
      const key = buildTaskEntityKey({ taskId, workspacePath: promotion.workspacePath, workspaceIdentity: promotion.workspaceIdentity });
      const task = displayed.get(key);
      if (!task) continue;
      if (promotion.placement.type === "top") {
        if (key === rootHead) plan.settledRoots.push(task);
      } else if ((accepted.has(key) || visibleMissing.has(key)) && groupHeads.get(promotion.placement.groupId) !== key) {
        plan.groupTasks.push(task);
      }
    }
  }
  return plan;
}

type Ports = {
  clear: (workspacePath: string, taskId: string, workspaceIdentity?: string) => void;
  invalidate: () => void;
  refreshCurrent: () => Promise<void>;
  log: (message: string, error: unknown) => void;
};
type Lease = { scope: object };

export class GroupedPromotionPersistenceOwner {
  private scope: object | null = null;
  private signatures = new Map<string, Lease>();

  constructor(private readonly ports: Ports) {}

  activate(): () => void {
    const scope = {};
    this.scope = scope;
    this.signatures.clear();
    return () => {
      if (this.scope !== scope) return;
      this.scope = null;
      this.signatures.clear();
    };
  }

  reconcile(plan: PromotionPlan, displayed: KnorviaGroupedTaskView, service: Pick<IKnorviaTaskService, "applyGroupedTaskViewOrder">): void {
    const scope = this.scope;
    if (!scope) return;
    for (const task of plan.settledRoots) this.clear(task);
    if (plan.groupTasks.length === 0) return;
    const signature = plan.groupTasks.map(buildTaskEntityKey).sort().join("|");
    if (this.signatures.has(signature)) return;
    const lease = { scope };
    this.signatures.set(signature, lease);
    void this.persist(signature, lease, plan.groupTasks, displayed, service);
  }

  private async persist(signature: string, lease: Lease, tasks: KnorviaTaskMeta[], view: KnorviaGroupedTaskView, service: Pick<IKnorviaTaskService, "applyGroupedTaskViewOrder">): Promise<void> {
    const accepts = () => this.scope === lease.scope && this.signatures.get(signature) === lease;
    try {
      await service.applyGroupedTaskViewOrder(viewToOrderInput({ view }));
      if (!accepts()) return;
      this.ports.invalidate();
      await this.ports.refreshCurrent();
      if (accepts()) for (const task of tasks) this.clear(task);
    } catch (error) {
      if (this.signatures.get(signature) === lease) this.signatures.delete(signature);
      this.ports.log("[useGroupedTaskView] 保存 grouped 草稿提升位置失败", error);
    }
  }

  private clear(task: KnorviaTaskMeta): void {
    this.ports.clear(task.workspacePath, task.taskId, task.workspaceIdentity);
  }
}
