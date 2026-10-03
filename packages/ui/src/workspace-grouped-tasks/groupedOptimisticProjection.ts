// SPDX-License-Identifier: Apache-2.0
// Source-exposed contract projection; source review and verification pending.
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type { WorkspaceOptimisticTaskOverlay } from "@/hooks/workspaceTaskListOptimisticOverlay.js";
import { buildTaskEntityKey } from "@/lib/taskQueryCache.js";
import { mergeTaskWithOptimisticMeta } from "@/lib/taskMetaMerge.js";
import { mergeTaskListMembershipFields } from "@/v4/taskListRowActivity.js";
import { taskKey as dragTaskKey } from "./ids.js";
import { moveTaskToGroupStart } from "./view.js";

type Promotion = WorkspaceOptimisticTaskOverlay["promotedGroupedDraftTaskByTaskId"][string];

function* tasksInView(view: KnorviaGroupedTaskView): Generator<KnorviaTaskMeta> {
  for (const node of view.nodes) {
    if (node.type === "group") yield* node.tasks;
    else yield node.task;
  }
}

export function collectGroupedViewTaskKeys(view: KnorviaGroupedTaskView): Set<string> {
  return new Set([...tasksInView(view)].map(buildTaskEntityKey));
}

export function findGroupedEntityTask(view: KnorviaGroupedTaskView, key: string): KnorviaTaskMeta | undefined {
  for (const task of tasksInView(view)) if (buildTaskEntityKey(task) === key) return task;
  return undefined;
}

export function isGroupedEntityFirst(view: KnorviaGroupedTaskView, key: string, groupId: string): boolean {
  const node = view.nodes.find((candidate) => candidate.type === "group" && candidate.group.id === groupId);
  return node?.type === "group" && Boolean(node.tasks[0]) && buildTaskEntityKey(node.tasks[0]!) === key;
}

export function reconcileGroupedOptimisticTaskKeys({
  view, optimisticOverlays, previousVisibleMissingTaskKeys,
}: {
  view: KnorviaGroupedTaskView;
  optimisticOverlays: Iterable<WorkspaceOptimisticTaskOverlay>;
  previousVisibleMissingTaskKeys: ReadonlySet<string>;
}): Set<string> {
  const accepted = collectGroupedViewTaskKeys(view);
  const current = new Set<string>(), visible = new Set<string>();
  for (const overlay of optimisticOverlays) {
    for (const task of overlay.tasks) {
      const key = buildTaskEntityKey(task);
      current.add(key);
      if (task.taskId === overlay.activeTaskId && !accepted.has(key)) visible.add(key);
    }
  }
  for (const key of previousVisibleMissingTaskKeys) if (current.has(key) && !accepted.has(key)) visible.add(key);
  return visible;
}

export function mergeGroupedTaskViewWithOptimistic({
  view, optimisticOverlays, visibleMissingTaskKeys,
}: {
  view: KnorviaGroupedTaskView;
  optimisticOverlays: Iterable<WorkspaceOptimisticTaskOverlay>;
  visibleMissingTaskKeys: ReadonlySet<string>;
}): KnorviaGroupedTaskView {
  const optimistic = new Map<string, KnorviaTaskMeta>();
  const placementTasks = new Map<string, KnorviaTaskMeta>();
  const promotions = new Map<string, Promotion>();
  for (const task of tasksInView(view)) placementTasks.set(buildTaskEntityKey(task), task);
  for (const overlay of optimisticOverlays) {
    for (const task of overlay.tasks) {
      const key = buildTaskEntityKey(task);
      optimistic.set(key, task);
      placementTasks.set(key, task);
    }
    for (const [taskId, promotion] of Object.entries(overlay.promotedGroupedDraftTaskByTaskId ?? {})) {
      promotions.set(buildTaskEntityKey({ taskId, workspacePath: promotion.workspacePath,
        workspaceIdentity: promotion.workspaceIdentity }), promotion);
    }
  }
  if (optimistic.size === 0 && promotions.size === 0) return view;

  const present = new Set<string>(), groupIds = new Set<string>();
  let changed = false;
  const merge = (task: KnorviaTaskMeta): KnorviaTaskMeta => {
    const key = buildTaskEntityKey(task);
    present.add(key);
    const overlay = optimistic.get(key);
    return overlay ? mergeTaskListMembershipFields(task, mergeTaskWithOptimisticMeta(task, overlay)) : task;
  };
  const nodes = view.nodes.map((node) => {
    if (node.type === "task") {
      const matched = optimistic.has(buildTaskEntityKey(node.task));
      const task = merge(node.task);
      if (!matched) return node;
      changed = true;
      return { ...node, task };
    }
    groupIds.add(node.group.id);
    let matched = false;
    const tasks = node.tasks.map((task) => {
      if (optimistic.has(buildTaskEntityKey(task))) matched = true;
      return merge(task);
    });
    if (!matched) return node;
    changed = true;
    return { ...node, tasks };
  });

  const missing = [...optimistic].filter(([key]) => visibleMissingTaskKeys.has(key) && !present.has(key))
    .map(([, task]) => task).sort((a, b) => a.updatedAt !== b.updatedAt ? b.updatedAt - a.updatedAt
      : a.createdAt !== b.createdAt ? b.createdAt - a.createdAt : b.taskId.localeCompare(a.taskId));
  const top: KnorviaTaskMeta[] = [], byGroup = new Map<string, KnorviaTaskMeta[]>();
  for (const task of missing) {
    const placement = promotions.get(buildTaskEntityKey(task))?.placement;
    if (placement?.type !== "group") { top.push(task); continue; }
    const members = byGroup.get(placement.groupId);
    if (members) members.push(task);
    else byGroup.set(placement.groupId, [task]);
  }
  for (const [id, tasks] of byGroup) if (!groupIds.has(id)) top.push(...tasks);
  let next = missing.length > 0 ? { nodes: [
    ...top.map((task) => ({ type: "task" as const, task })),
    ...nodes.map((node) => {
      const added = node.type === "group" ? byGroup.get(node.group.id) : undefined;
      return node.type === "group" && added?.length ? { ...node, tasks: [...added, ...node.tasks] } : node;
    }),
  ] } : changed ? { nodes } : view;

  for (const [key, promotion] of promotions) {
    if (promotion.placement.type === "top") {
      const index = next.nodes.findIndex((node) => node.type === "task" && buildTaskEntityKey(node.task) === key);
      if (index <= 0) continue;
      const reordered = next.nodes.slice();
      reordered.unshift(...reordered.splice(index, 1));
      next = { nodes: reordered };
    } else {
      const task = placementTasks.get(key);
      if (task && !isGroupedEntityFirst(next, key, promotion.placement.groupId)) {
        next = moveTaskToGroupStart(next, { activeTaskKey: dragTaskKey(task), groupId: promotion.placement.groupId });
      }
    }
  }
  return next;
}
