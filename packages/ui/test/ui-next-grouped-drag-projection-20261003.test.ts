// SPDX-License-Identifier: Apache-2.0
// Pending drag-target contracts; no DndKit/DOM/cancel/mutation execution claim.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaGroupedTaskView, KnorviaGroupedTaskViewNode } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { taskKey } from "../src/workspace-grouped-tasks/ids.js";
import {
  acceptsGroupedDragCollision,
  getGroupedTaskDragGroupId,
  getGroupedTaskDragTaskKey,
  getGroupedTaskViewSignature,
  projectGroupedDragOver,
} from "../src/workspace-grouped-tasks/groupedDragProjection.js";

const task = (taskId: string, workspaceIdentity?: string): KnorviaTaskMeta => ({
  taskId,
  traceId: `trace-${taskId}`,
  title: taskId,
  workspacePath: "/w",
  workspaceIdentity,
  mode: "build",
  createdAt: 1,
  updatedAt: 1,
});
const root = (task: KnorviaTaskMeta): KnorviaGroupedTaskViewNode => ({ type: "task", task });
const group = (id: string, tasks: KnorviaTaskMeta[]): KnorviaGroupedTaskViewNode => ({
  type: "group",
  group: { id, title: id, color: "gray", createdAt: 1, updatedAt: 1 },
  tasks,
});
const describe = (view: KnorviaGroupedTaskView) =>
  view.nodes.map((node) =>
    node.type === "task"
      ? node.task.taskId
      : [node.group.id, node.tasks.map((task) => task.taskId)],
  );
const fixture = () => {
  const a = task("a"),
    b = task("b"),
    c = task("c"),
    d = task("d");
  const view: KnorviaGroupedTaskView = {
    nodes: [root(a), group("g1", [b, c]), group("empty", []), root(d)],
  };
  return { a, b, c, d, view, active: { type: "grouped-task", taskKey: taskKey(a) } };
};

test("collision admission keeps group/task target policy and does not validate ids prematurely", () => {
  const actor = { type: "grouped-group", groupId: 123 };
  assert.equal(acceptsGroupedDragCollision(actor, { type: "grouped-task" }), true);
  assert.equal(acceptsGroupedDragCollision(actor, { type: "grouped-group-over" }), true);
  assert.equal(
    acceptsGroupedDragCollision(actor, { type: "grouped-expanded-group-header" }),
    false,
  );
  assert.equal(
    acceptsGroupedDragCollision({ type: "grouped-task" }, { type: "grouped-group-over" }),
    false,
  );
  assert.equal(acceptsGroupedDragCollision(null, { type: "unknown" }), true);
});

test("unknown/nonstring/mismatched source data stays a no-op with compatible decoder outputs", () => {
  const { view, active } = fixture();
  for (const value of [
    null,
    false,
    0,
    "grouped-task",
    { type: "grouped-task", taskKey: 1 },
    { type: "grouped-task", taskKey: "" },
  ]) {
    assert.equal(
      projectGroupedDragOver(
        view,
        value,
        { type: "grouped-empty-drop-zone", groupId: "g1" },
        "after",
      ),
      view,
    );
  }
  assert.equal(getGroupedTaskDragTaskKey({ type: "grouped-group", taskKey: "wrong" }), null);
  assert.equal(getGroupedTaskDragGroupId({ type: "grouped-group", groupId: "" }), "");
  assert.equal(projectGroupedDragOver(view, active, null, "after"), view);
  assert.equal(
    projectGroupedDragOver(
      view,
      active,
      { type: "grouped-task", taskKey: active.taskKey },
      "after",
    ),
    view,
  );
});

test("header and footer preserve direction-dependent root/group boundary placement", () => {
  const { view, active } = fixture();
  const header = { type: "grouped-expanded-group-header", groupId: "g1" };
  const footer = { type: "grouped-expanded-group-footer", groupId: "g1" };
  assert.deepEqual(describe(projectGroupedDragOver(view, active, header, "before")), [
    "a",
    ["g1", ["b", "c"]],
    ["empty", []],
    "d",
  ]);
  assert.deepEqual(describe(projectGroupedDragOver(view, active, header, "after")), [
    ["g1", ["a", "b", "c"]],
    ["empty", []],
    "d",
  ]);
  assert.deepEqual(describe(projectGroupedDragOver(view, active, footer, "before")), [
    ["g1", ["b", "c", "a"]],
    ["empty", []],
    "d",
  ]);
  assert.deepEqual(describe(projectGroupedDragOver(view, active, footer, "after")), [
    ["g1", ["b", "c"]],
    "a",
    ["empty", []],
    "d",
  ]);
});

test("collapsed boundaries stay in root, and an empty group receives its first task", () => {
  const { view, active } = fixture();
  const collapsed = { type: "grouped-collapsed-group", groupId: "g1" };
  assert.deepEqual(describe(projectGroupedDragOver(view, active, collapsed, "after")), [
    ["g1", ["b", "c"]],
    "a",
    ["empty", []],
    "d",
  ]);
  const filled = projectGroupedDragOver(
    view,
    active,
    { type: "grouped-empty-drop-zone", groupId: "empty" },
    "before",
  );
  assert.deepEqual(describe(filled), [["g1", ["b", "c"]], ["empty", ["a"]], "d"]);
  assert.equal(filled.nodes[0], view.nodes[1]);
});

test("task/group targets call the installed structural commands and keep workspace identities isolated", () => {
  const { view, active, c, d } = fixture();
  assert.deepEqual(
    describe(
      projectGroupedDragOver(view, active, { type: "grouped-task", taskKey: taskKey(c) }, "before"),
    ),
    [["g1", ["b", "a", "c"]], ["empty", []], "d"],
  );
  const actor = { type: "grouped-group", groupId: "g1" };
  assert.deepEqual(
    describe(
      projectGroupedDragOver(
        view,
        actor,
        { type: "grouped-group-over", groupId: "empty" },
        "after",
      ),
    ),
    ["a", ["empty", []], ["g1", ["b", "c"]], "d"],
  );
  assert.deepEqual(
    describe(
      projectGroupedDragOver(view, actor, { type: "grouped-task", taskKey: taskKey(d) }, "after"),
    ),
    ["a", ["empty", []], "d", ["g1", ["b", "c"]]],
  );
  assert.equal(
    projectGroupedDragOver(view, actor, { type: "grouped-group-over", groupId: "g1" }, "after"),
    view,
  );
  const remote = task("a", "remote-fixture");
  assert.equal(
    projectGroupedDragOver(
      view,
      { type: "grouped-task", taskKey: taskKey(remote) },
      { type: "grouped-task", taskKey: taskKey(d) },
      "after",
    ),
    view,
  );
});

test("order signature ignores metadata while retaining original tokens and task identity separators", () => {
  const { view, a } = fixture();
  assert.equal(
    getGroupedTaskViewSignature(view),
    `t:${taskKey(a)}|g:g1[/w\u0000b,/w\u0000c]|g:empty[]|t:/w\u0000d`,
  );
  const renamed = {
    nodes: view.nodes.map((node) =>
      node.type === "group" ? { ...node, group: { ...node.group, title: "renamed" } } : node,
    ),
  };
  assert.equal(getGroupedTaskViewSignature(renamed), getGroupedTaskViewSignature(view));
});
