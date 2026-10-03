// SPDX-License-Identifier: Apache-2.0
// Contract-authored source-exposed structural edits; review and validation deferred.
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { taskKey } from "@/workspace-grouped-tasks/ids.js";
import {
  cursorDestination, groupIndex, GroupedViewEdit, taskCursor, taskGroupId, transferTask,
} from "@/workspace-grouped-tasks/viewEdit.js";

export type GroupedTaskInsertPosition = "before" | "after";

export function moveTaskOverTask(view: KnorviaGroupedTaskView, params: {
  activeTaskKey: string; overTaskKey: string; position: GroupedTaskInsertPosition;
}): KnorviaGroupedTaskView {
  if (params.activeTaskKey === params.overTaskKey || !taskCursor(view, params.overTaskKey)) return view;
  return transferTask(view, params.activeTaskKey, (candidate) => {
    const over = taskCursor(candidate, params.overTaskKey);
    return over ? cursorDestination(candidate, over, params.position === "after") : null;
  });
}

export function moveTaskToRootAroundGroup(view: KnorviaGroupedTaskView, params: {
  activeTaskKey: string; groupId: string; position: GroupedTaskInsertPosition;
}): KnorviaGroupedTaskView {
  return transferTask(view, params.activeTaskKey, (candidate) => {
    const index = groupIndex(candidate, params.groupId);
    return index < 0 ? null : { root: index + (params.position === "after" ? 1 : 0) };
  });
}

function moveToGroupBoundary(view: KnorviaGroupedTaskView, params: {
  activeTaskKey: string; groupId: string;
}, end: boolean): KnorviaGroupedTaskView {
  return transferTask(view, params.activeTaskKey, (candidate) => {
    const node = candidate.nodes[groupIndex(candidate, params.groupId)];
    return node?.type === "group" ? { groupId: params.groupId, member: end ? node.tasks.length : 0 } : null;
  });
}

export function moveTaskToGroupStart(view: KnorviaGroupedTaskView, params: {
  activeTaskKey: string; groupId: string;
}): KnorviaGroupedTaskView {
  return moveToGroupBoundary(view, params, false);
}

export function moveTaskToGroupEnd(view: KnorviaGroupedTaskView, params: {
  activeTaskKey: string; groupId: string;
}): KnorviaGroupedTaskView {
  return moveToGroupBoundary(view, params, true);
}

export function moveGroupAroundTopLevelNode(view: KnorviaGroupedTaskView, params: {
  activeGroupId: string;
  over: { type: "group"; groupId: string } | { type: "task"; taskKey: string };
  position: GroupedTaskInsertPosition;
}): KnorviaGroupedTaskView {
  const overGroup = params.over.type === "group" ? params.over.groupId : taskGroupId(view, params.over.taskKey);
  if (overGroup === params.activeGroupId) return view;
  const active = groupIndex(view, params.activeGroupId);
  if (active < 0) return view;
  const nodes = view.nodes.slice();
  const moved = nodes.splice(active, 1)[0];
  if (!moved) return view;
  const candidate = { nodes };
  let target: number;
  if (params.over.type === "group" || overGroup) {
    target = groupIndex(candidate, overGroup!);
  } else {
    const over = params.over;
    target = nodes.findIndex((node) => node.type === "task" && taskKey(node.task) === over.taskKey);
  }
  if (target < 0) return view;
  // group 只能落在顶层；组内 task 的碰撞目标投影为所属 group。
  nodes.splice(target + (params.position === "after" ? 1 : 0), 0, moved);
  return candidate;
}

export function moveTaskByMenu(view: KnorviaGroupedTaskView, targetTask: KnorviaTaskMeta, targetGroupId: string | null): KnorviaGroupedTaskView {
  const key = taskKey(targetTask);
  const previousGroup = taskGroupId(view, key);
  if (previousGroup === targetGroupId) return view;
  const edit = new GroupedViewEdit(view);
  const task = edit.take(key);
  if (!task) return view;
  if (targetGroupId) {
    const node = edit.view.nodes[groupIndex(edit.view, targetGroupId)];
    if (node?.type === "group") edit.put(task, { groupId: targetGroupId, member: node.tasks.length });
    return edit.view;
  }
  const anchor = previousGroup ? view.nodes[groupIndex(view, previousGroup) + 1] : null;
  const index = anchor ? edit.view.nodes.findIndex((node) => anchor.type === "group"
    ? node.type === "group" && node.group.id === anchor.group.id
    : node.type === "task" && taskKey(node.task) === taskKey(anchor.task)) : -1;
  // 保留原菜单离组位置；无法匹配原组后的 anchor 时追加到末尾。
  edit.put(task, { root: index < 0 ? edit.view.nodes.length : index });
  return edit.view;
}

export function moveTaskToTopByMenu(view: KnorviaGroupedTaskView, targetTask: KnorviaTaskMeta): KnorviaGroupedTaskView {
  const key = taskKey(targetTask);
  const source = taskCursor(view, key);
  if (!source || (source.member === null ? source.node === 0 : source.member === 0)) return view;
  const node = view.nodes[source.node];
  const groupId = node?.type === "group" ? node.group.id : null;
  return transferTask(view, key, () => source.member === null ? { root: 0 } : { groupId: groupId!, member: 0 });
}
