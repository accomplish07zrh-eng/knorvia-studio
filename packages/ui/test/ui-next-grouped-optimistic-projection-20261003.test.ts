// SPDX-License-Identifier: Apache-2.0
// Pending contracts; not executed or presented as hook/store/DOM validation.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaGroupedTaskView, KnorviaGroupedTaskViewNode } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type { WorkspaceOptimisticTaskOverlay } from "../src/hooks/workspaceTaskListOptimisticOverlay.js";
import { buildTaskEntityKey } from "../src/lib/taskQueryCache.js";
import { attachTaskListRowActivity, getTaskListRowActivity } from "../src/v4/taskListRowActivity.js";
import { mergeGroupedTaskViewWithOptimistic, reconcileGroupedOptimisticTaskKeys } from "../src/workspace-grouped-tasks/groupedOptimisticProjection.js";

type Promotion = WorkspaceOptimisticTaskOverlay["promotedGroupedDraftTaskByTaskId"][string];
const task = (taskId: string, updatedAt = 2, workspaceIdentity?: string): KnorviaTaskMeta => ({
  taskId, title: taskId, traceId: `trace-${taskId}`, workspacePath: "/w", workspaceIdentity,
  createdAt: 1, updatedAt, mode: "build",
});
const root = (task: KnorviaTaskMeta): KnorviaGroupedTaskViewNode => ({ type: "task", task });
const group = (id: string, tasks: KnorviaTaskMeta[]): KnorviaGroupedTaskViewNode => ({
  type: "group", group: { id, title: id, color: "gray", createdAt: 1, updatedAt: 1 }, tasks,
});
const overlay = (tasks: KnorviaTaskMeta[], promotions: Record<string, Promotion> = {}, activeTaskId: string | null = null): WorkspaceOptimisticTaskOverlay => ({
  tasks, promotedGroupedDraftTaskByTaskId: promotions, activeTaskId,
});
const promotion = (placement: Promotion["placement"], workspaceIdentity?: string): Promotion => ({
  draftId: "fixture-draft", createdAt: 1, workspacePath: "/w", workspaceIdentity, placement,
});
const project = (view: KnorviaGroupedTaskView, overlays: WorkspaceOptimisticTaskOverlay[], visible: KnorviaTaskMeta[] = []) =>
  mergeGroupedTaskViewWithOptimistic({ view, optimisticOverlays: overlays, visibleMissingTaskKeys: new Set(visible.map(buildTaskEntityKey)) });
const describe = (view: KnorviaGroupedTaskView) => view.nodes.map((node) => node.type === "task" ? node.task.taskId
  : [node.group.id, node.tasks.map((task) => task.taskId)]);

test("empty or legacy overlay preserves the original view and unrelated nodes", () => {
  const a = task("a"), b = task("b"), view = { nodes: [root(a), group("g", [b])] };
  assert.equal(project(view, []), view);
  assert.equal(project(view, [{ tasks: [], activeTaskId: null } as WorkspaceOptimisticTaskOverlay]), view);
  const replaced = project(view, [overlay([{ ...a, title: "updated", updatedAt: 3 }])]);
  assert.notEqual(replaced, view);
  assert.equal(replaced.nodes[1], view.nodes[1]);
  assert.equal(view.nodes[0]!.type === "task" && view.nodes[0]!.task.title, "a");
});

test("only visible missing tasks are inserted, with group and absent-group placement preserved", () => {
  const accepted = task("accepted"), top = task("top", 5), grouped = task("grouped", 8), orphan = task("orphan", 9), hidden = task("hidden", 20);
  const view = { nodes: [group("g", [accepted])] };
  const result = project(view, [overlay([hidden, top, grouped, orphan], {
    grouped: promotion({ type: "group", groupId: "g" }), orphan: promotion({ type: "group", groupId: "absent" }),
  })], [top, grouped, orphan]);
  assert.deepEqual(describe(result), ["top", "orphan", ["g", ["grouped", "accepted"]]]);
});

test("top promotions apply in insertion order and do not migrate a group member to root", () => {
  const a = task("a"), b = task("b"), grouped = task("grouped");
  const view = { nodes: [group("g", [grouped]), root(a), root(b)] };
  const result = project(view, [overlay([], {
    a: promotion({ type: "top" }), b: promotion({ type: "top" }), grouped: promotion({ type: "top" }),
  })]);
  assert.deepEqual(describe(result), ["b", "a", ["g", ["grouped"]]]);
});

test("group promotion reuses an accepted task even without optimistic metadata", () => {
  const a = task("a"), b = task("b"), view = { nodes: [root(a), group("g", [b])] };
  assert.deepEqual(describe(project(view, [overlay([], { a: promotion({ type: "group", groupId: "g" }) })])), [["g", ["a", "b"]]]);
});

test("last overlay metadata wins while sessions activity remains authoritative", () => {
  const activity = { phase: "running" as const, lastActivityAt: 10, hasBackgroundWork: false };
  const a = attachTaskListRowActivity({ ...task("a"), status: "running" }, activity);
  const view = { nodes: [root(a)] };
  const result = project(view, [overlay([{ ...a, title: "first", updatedAt: 30 }]), overlay([{ ...a, title: "last", updatedAt: 40 }])]);
  const node = result.nodes[0]!;
  assert.equal(node.type, "task");
  if (node.type !== "task") return;
  assert.equal(node.task.title, "last");
  assert.equal(node.task.updatedAt, 10);
  assert.equal(getTaskListRowActivity(node.task), activity);
});

test("visible missing keys persist only while still optimistic and absent from accepted view", () => {
  const a = task("a"), remote = task("a", 2, "remote-fixture"), old = task("old"), gone = task("gone");
  const overlays = [overlay([a, remote, old], {}, "a")];
  const visible = reconcileGroupedOptimisticTaskKeys({ view: { nodes: [root(a)] }, optimisticOverlays: overlays,
    previousVisibleMissingTaskKeys: new Set([buildTaskEntityKey(old), buildTaskEntityKey(gone)]) });
  assert.deepEqual(visible, new Set([buildTaskEntityKey(remote), buildTaskEntityKey(old)]));
});
