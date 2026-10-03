// SPDX-License-Identifier: Apache-2.0
// Contract-authored local mutation plans; source review and verification pending.
import type {
  KnorviaGroupedTaskView,
  KnorviaGroupedTaskViewOrderInput,
  KnorviaTaskGroup,
} from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { buildTaskWorkspaceKey } from "@/lib/taskQueryCache.js";

type TaskRef = Pick<KnorviaTaskMeta, "workspacePath" | "workspaceIdentity" | "taskId">;
const taskRef = (task: KnorviaTaskMeta): TaskRef => ({
  workspacePath: task.workspacePath,
  workspaceIdentity: task.workspaceIdentity,
  taskId: task.taskId,
});

/** Single traversal keeps structural order and scope first-position/last-value semantics. */
export function viewToOrderInput({
  view,
}: {
  view: KnorviaGroupedTaskView;
}): KnorviaGroupedTaskViewOrderInput {
  const topLevelNodes: KnorviaGroupedTaskViewOrderInput["topLevelNodes"] = [];
  const groups: KnorviaGroupedTaskViewOrderInput["groups"] = [];
  const scopes = new Map<string, { workspacePath: string; workspaceIdentity?: string }>();
  const ref = (task: KnorviaTaskMeta) => {
    scopes.set(buildTaskWorkspaceKey(task.workspacePath, task.workspaceIdentity), {
      workspacePath: task.workspacePath,
      workspaceIdentity: task.workspaceIdentity,
    });
    return taskRef(task);
  };
  for (const node of view.nodes) {
    if (node.type === "task") topLevelNodes.push({ type: "task", task: ref(node.task) });
    else {
      topLevelNodes.push({ type: "group", groupId: node.group.id });
      groups.push({ groupId: node.group.id, taskRefs: node.tasks.map(ref) });
    }
  }
  return { workspaceScopes: [...scopes.values()], topLevelNodes, groups };
}

export function collectViewWorkspaceScopes(view: KnorviaGroupedTaskView) {
  return viewToOrderInput({ view }).workspaceScopes;
}

export function prependTaskGroupToView(
  view: KnorviaGroupedTaskView,
  group: KnorviaTaskGroup,
): KnorviaGroupedTaskView {
  let minimum = 0;
  for (const node of view.nodes) {
    if (node.type === "group" && node.group.id === group.id) return view;
    minimum = Math.min(minimum, node.sortOrder ?? 0);
  }
  return { nodes: [{ type: "group", group, tasks: [], sortOrder: minimum - 1000 }, ...view.nodes] };
}

export function projectGroupedMetadata(
  view: KnorviaGroupedTaskView,
  id: string,
  group: (previous: KnorviaTaskGroup) => KnorviaTaskGroup,
): KnorviaGroupedTaskView {
  return {
    nodes: view.nodes.map((node) =>
      node.type === "group" && node.group.id === id ? { ...node, group: group(node.group) } : node,
    ),
  };
}

export function expandGroupedMembers(
  view: KnorviaGroupedTaskView,
  id: string,
): KnorviaGroupedTaskView {
  const nodes: KnorviaGroupedTaskView["nodes"] = [];
  for (const node of view.nodes) {
    if (node.type === "group" && node.group.id === id)
      nodes.push(...node.tasks.map((task) => ({ type: "task" as const, task })));
    else nodes.push(node);
  }
  return { nodes };
}
