// SPDX-License-Identifier: Apache-2.0
// Source-exposed compatibility projection; no completed independent/MIT review claim.
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type { GroupedDraftTaskPlacement } from "@/store/sessionStoreTypes.js";
import { taskKey } from "@/workspace-grouped-tasks/ids.js";
import { taskCursor } from "@/workspace-grouped-tasks/viewEdit.js";

export function cloneView(view: KnorviaGroupedTaskView): KnorviaGroupedTaskView {
  return {
    nodes: view.nodes.map((node) => ({
      ...node,
      ...(node.type === "group" ? { tasks: node.tasks.slice() } : {}),
    })),
  };
}

export function removeTaskFromGroupedView(view: KnorviaGroupedTaskView, targetTaskKey: string): KnorviaGroupedTaskView {
  const result = cloneView(view);
  const cursor = taskCursor(result, targetTaskKey, true) ?? taskCursor(result, targetTaskKey);
  if (!cursor) return result;
  const node = result.nodes[cursor.node];
  if (cursor.member !== null && node?.type === "group") node.tasks.splice(cursor.member, 1);
  else result.nodes.splice(cursor.node, 1);
  return result;
}

export function filterGroupedViewByTaskKeys(
  view: KnorviaGroupedTaskView, hiddenTaskKeys: ReadonlySet<string>,
): KnorviaGroupedTaskView {
  if (hiddenTaskKeys.size === 0) return view;
  let changed = false;
  const nodes: KnorviaGroupedTaskView["nodes"] = [];
  for (const node of view.nodes) {
    if (node.type === "task") {
      if (hiddenTaskKeys.has(taskKey(node.task))) changed = true;
      else nodes.push(node);
    } else {
      const tasks = node.tasks.filter((task) => !hiddenTaskKeys.has(taskKey(task)));
      const retained = tasks.length === node.tasks.length;
      nodes.push(retained ? node : { ...node, tasks });
      if (!retained) changed = true;
    }
  }
  return changed ? { nodes } : view;
}

export function findTaskInGroupedView(view: KnorviaGroupedTaskView, targetTaskKey: string): KnorviaTaskMeta | null {
  return taskCursor(view, targetTaskKey)?.task ?? null;
}

export function replaceTaskInGroupedView(view: KnorviaGroupedTaskView, nextTask: KnorviaTaskMeta): KnorviaGroupedTaskView {
  const key = taskKey(nextTask);
  const replace = (task: KnorviaTaskMeta) => taskKey(task) === key ? nextTask : task;
  return {
    nodes: view.nodes.map((node) => node.type === "group"
      ? { ...node, tasks: node.tasks.map(replace) }
      : taskKey(node.task) === key ? { ...node, task: nextTask } : node),
  };
}

export function getGroupedTaskGroupIds(view: KnorviaGroupedTaskView): string[] {
  const result: string[] = [];
  for (const node of view.nodes) if (node.type === "group") result.push(node.group.id);
  return result;
}

export function areAllGroupedTaskGroupsExpanded(groupIds: readonly string[], collapsedGroupIds: ReadonlySet<string>): boolean {
  if (groupIds.length === 0) return false;
  for (const id of groupIds) if (collapsedGroupIds.has(id)) return false;
  return true;
}

export function pruneCollapsedGroupedTaskGroupIds(collapsedGroupIds: ReadonlySet<string>, groupIds: readonly string[]): Set<string> {
  const result = new Set<string>();
  const known = new Set(groupIds);
  for (const id of collapsedGroupIds) if (known.has(id)) result.add(id);
  return result;
}

export function resolveGroupedDraftTaskPlacementForTask(
  view: KnorviaGroupedTaskView, targetTaskKey: string | null | undefined,
): GroupedDraftTaskPlacement {
  const cursor = targetTaskKey ? taskCursor(view, targetTaskKey) : null;
  const node = cursor ? view.nodes[cursor.node] : null;
  return cursor?.member != null && node?.type === "group"
    ? { type: "group", groupId: node.group.id } : { type: "top" };
}
