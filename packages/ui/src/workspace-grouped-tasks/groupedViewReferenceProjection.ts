// SPDX-License-Identifier: Apache-2.0
// Source-exposed node-reference projection; source and runtime review pending.
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import { buildTaskWorkspaceKey } from "@/lib/taskQueryCache.js";
import { areStabilizedValuesEquivalent } from "@/v4/taskListItemStabilization.js";

type Node = KnorviaGroupedTaskView["nodes"][number];

function identity(node: Node): string {
  return node.type === "group"
    ? `group:${node.group.id}`
    : `task:${buildTaskWorkspaceKey(node.task.workspacePath, node.task.workspaceIdentity)}:${node.task.taskId}`;
}

function reusable(previous: Node, next: Node): boolean {
  if (previous.type !== next.type || previous.sortOrder !== next.sortOrder) return false;
  if (previous.type === "task" && next.type === "task") return previous.task === next.task;
  if (previous.type !== "group" || next.type !== "group") return false;
  if (
    !areStabilizedValuesEquivalent(previous.group, next.group) ||
    previous.tasks.length !== next.tasks.length
  )
    return false;
  return next.tasks.every((task, index) => task === previous.tasks[index]);
}

/** Reverse claims retain last-duplicate semantics; position buckets retain the new order. */
export function stabilizeGroupedTaskView(
  previous: KnorviaGroupedTaskView,
  next: KnorviaGroupedTaskView,
): KnorviaGroupedTaskView {
  if (previous.nodes.length === 0) return next;
  const positions = new Map<string, number[]>();
  next.nodes.forEach((node, position) => {
    const key = identity(node),
      bucket = positions.get(key);
    if (bucket) bucket.push(position);
    else positions.set(key, [position]);
  });
  const nodes = next.nodes.slice(),
    reused = new Set<number>();
  for (let index = previous.nodes.length - 1; index >= 0; index -= 1) {
    const candidate = previous.nodes[index]!;
    const key = identity(candidate),
      bucket = positions.get(key);
    if (!bucket) continue;
    positions.delete(key);
    for (const position of bucket) {
      if (!reusable(candidate, next.nodes[position]!)) continue;
      nodes[position] = candidate;
      reused.add(position);
    }
  }
  const unchanged =
    nodes.length === previous.nodes.length &&
    nodes.every((node, position) => reused.has(position) && node === previous.nodes[position]);
  return unchanged ? previous : { nodes };
}
