// SPDX-License-Identifier: Apache-2.0
// Source-exposed contract projection; source review and verification pending.
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import { taskKey } from "./ids.js";
import {
  moveGroupAroundTopLevelNode, moveTaskOverTask, moveTaskToGroupStart,
  moveTaskToGroupEnd, moveTaskToRootAroundGroup,
} from "./view.js";

export type GroupedTaskDragDirectionPosition = "before" | "after";
type DragData = { type?: unknown; taskKey?: unknown; groupId?: unknown };
const readData = (value: unknown): DragData | null => value && typeof value === "object" ? value as DragData : null;

export function getGroupedTaskDragTaskKey(value: unknown): string | null {
  const data = readData(value);
  return data?.type === "grouped-task" && typeof data.taskKey === "string" ? data.taskKey : null;
}

export function getGroupedTaskDragGroupId(value: unknown): string | null {
  const data = readData(value);
  return data?.type === "grouped-group" && typeof data.groupId === "string" ? data.groupId : null;
}

/** Collision admission intentionally depends on raw type, even if the id is malformed. */
export function acceptsGroupedDragCollision(active: unknown, target: unknown): boolean {
  const targetType = readData(target)?.type;
  return readData(active)?.type === "grouped-group"
    ? targetType === "grouped-task" || targetType === "grouped-group-over"
    : targetType !== "grouped-group-over";
}

export function projectGroupedDragOver(
  view: KnorviaGroupedTaskView,
  active: unknown,
  target: unknown,
  position: GroupedTaskDragDirectionPosition,
): KnorviaGroupedTaskView {
  const over = readData(target);
  if (!over) return view;
  const activeGroupId = getGroupedTaskDragGroupId(active);
  if (activeGroupId) {
    if (over.type === "grouped-group-over" && typeof over.groupId === "string" && over.groupId && over.groupId !== activeGroupId) {
      return moveGroupAroundTopLevelNode(view, { activeGroupId, over: { type: "group", groupId: over.groupId }, position });
    }
    if (over.type === "grouped-task" && typeof over.taskKey === "string" && over.taskKey) {
      return moveGroupAroundTopLevelNode(view, { activeGroupId, over: { type: "task", taskKey: over.taskKey }, position });
    }
    return view;
  }
  const activeTaskKey = getGroupedTaskDragTaskKey(active);
  if (!activeTaskKey) return view;
  if (over.type === "grouped-task") {
    return typeof over.taskKey === "string" && over.taskKey && over.taskKey !== activeTaskKey
      ? moveTaskOverTask(view, { activeTaskKey, overTaskKey: over.taskKey, position }) : view;
  }
  if (typeof over.groupId !== "string" || !over.groupId) return view;
  const groupId = over.groupId;
  switch (over.type) {
    case "grouped-collapsed-group":
      return moveTaskToRootAroundGroup(view, { activeTaskKey, groupId, position });
    case "grouped-expanded-group-header":
      return position === "before"
        ? moveTaskToRootAroundGroup(view, { activeTaskKey, groupId, position })
        : moveTaskToGroupStart(view, { activeTaskKey, groupId });
    case "grouped-expanded-group-footer":
      return position === "before"
        ? moveTaskToGroupEnd(view, { activeTaskKey, groupId })
        : moveTaskToRootAroundGroup(view, { activeTaskKey, groupId, position });
    case "grouped-empty-drop-zone":
      return moveTaskToGroupStart(view, { activeTaskKey, groupId });
    default: return view;
  }
}

/** Retains the consumer's order-only signature, including its existing separators. */
export function getGroupedTaskViewSignature(view: KnorviaGroupedTaskView): string {
  const tokens = new Array<string>(view.nodes.length);
  view.nodes.forEach((node, index) => {
    tokens[index] = node.type === "task" ? `t:${taskKey(node.task)}`
      : `g:${node.group.id}[${node.tasks.map(taskKey).join(",")}]`;
  });
  return tokens.join("|");
}
