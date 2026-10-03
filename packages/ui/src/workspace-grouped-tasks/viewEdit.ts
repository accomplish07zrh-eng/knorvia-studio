// SPDX-License-Identifier: Apache-2.0
// Source-exposed behavior-contract candidate; author and license review remain pending.
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { taskKey } from "@/workspace-grouped-tasks/ids.js";

export type TaskCursor = { node: number; member: number | null; task: KnorviaTaskMeta };
export type TaskDestination = { root: number } | { groupId: string; member: number };

export function groupIndex(view: KnorviaGroupedTaskView, id: string): number {
  return view.nodes.findIndex((node) => node.type === "group" && node.group.id === id);
}

export function* taskCursors(view: KnorviaGroupedTaskView, groupsOnly = false): Generator<TaskCursor> {
  for (let index = 0; index < view.nodes.length; index += 1) {
    const node = view.nodes[index];
    if (!node) continue;
    if (node.type === "group") {
      for (let member = 0; member < node.tasks.length; member += 1) {
        const task = node.tasks[member];
        if (task) yield { node: index, member, task };
      }
    } else if (!groupsOnly) {
      yield { node: index, member: null, task: node.task };
    }
  }
}

export function taskCursor(view: KnorviaGroupedTaskView, key: string, groupsOnly = false): TaskCursor | null {
  for (const cursor of taskCursors(view, groupsOnly)) {
    if (taskKey(cursor.task) === key) return cursor;
  }
  return null;
}

export function taskGroupId(view: KnorviaGroupedTaskView, key: string): string | null {
  const cursor = taskCursor(view, key, true);
  if (!cursor) return null;
  const node = view.nodes[cursor.node];
  return node?.type === "group" ? node.group.id : null;
}

export function cursorDestination(
  view: KnorviaGroupedTaskView, cursor: TaskCursor, after: boolean,
): TaskDestination {
  const delta = after ? 1 : 0;
  const node = view.nodes[cursor.node];
  if (cursor.member !== null && node?.type === "group") {
    return { groupId: node.group.id, member: cursor.member + delta };
  }
  return { root: cursor.node + delta };
}

/** A per-command, disposable structural edit. The accepted view belongs to the caller. */
export class GroupedViewEdit {
  readonly view: KnorviaGroupedTaskView;

  constructor(source: KnorviaGroupedTaskView) {
    this.view = { nodes: source.nodes.slice() };
  }

  take(key: string): KnorviaTaskMeta | null {
    const cursor = taskCursor(this.view, key);
    if (!cursor) return null;
    const node = this.view.nodes[cursor.node];
    if (cursor.member === null) {
      this.view.nodes.splice(cursor.node, 1);
    } else if (node?.type === "group") {
      const tasks = node.tasks.slice();
      tasks.splice(cursor.member, 1);
      this.view.nodes[cursor.node] = { ...node, tasks };
    }
    return cursor.task;
  }

  put(task: KnorviaTaskMeta, destination: TaskDestination): boolean {
    if ("root" in destination) {
      this.view.nodes.splice(destination.root, 0, { type: "task", task });
      return true;
    }
    const index = groupIndex(this.view, destination.groupId);
    const node = this.view.nodes[index];
    if (!node || node.type !== "group") return false;
    const tasks = node.tasks.slice();
    tasks.splice(destination.member, 0, task);
    this.view.nodes[index] = { ...node, tasks };
    return true;
  }
}

export function transferTask(
  view: KnorviaGroupedTaskView,
  key: string,
  target: (withoutSource: KnorviaGroupedTaskView) => TaskDestination | null,
): KnorviaGroupedTaskView {
  const edit = new GroupedViewEdit(view);
  const task = edit.take(key);
  if (!task) return view;
  // 移除后重定位目标：同组向下拖动不能使用移除前的 index。
  const destination = target(edit.view);
  return destination && edit.put(task, destination) ? edit.view : view;
}
