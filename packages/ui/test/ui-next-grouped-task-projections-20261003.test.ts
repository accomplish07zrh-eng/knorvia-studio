// SPDX-License-Identifier: Apache-2.0
// Pending contract scenarios; not run against baseline, candidate or emitted code.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaGroupedTaskView, KnorviaGroupedTaskViewNode } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { taskKey } from "../src/workspace-grouped-tasks/ids.js";
import {
  areAllGroupedTaskGroupsExpanded, cloneView, filterGroupedViewByTaskKeys,
  findTaskInGroupedView, getGroupedTaskGroupIds, moveGroupAroundTopLevelNode,
  moveTaskByMenu, moveTaskOverTask, moveTaskToGroupEnd, moveTaskToGroupStart,
  moveTaskToRootAroundGroup, moveTaskToTopByMenu, pruneCollapsedGroupedTaskGroupIds,
  removeTaskFromGroupedView, replaceTaskInGroupedView, resolveGroupedDraftTaskPlacementForTask,
} from "../src/workspace-grouped-tasks/view.js";
import { isPotentialVerticalScrollContainer, planGroupedTaskScroll } from "../src/workspace-grouped-tasks/virtualized-scroll.js";

const task = (id: string, workspaceIdentity?: string): KnorviaTaskMeta => ({
  taskId: id, traceId: "fixture-trace", title: id, workspacePath: "/w", workspaceIdentity,
  mode: "build", createdAt: 1, updatedAt: 1,
});
const group = (id: string, tasks: KnorviaTaskMeta[]): KnorviaGroupedTaskViewNode => ({
  type: "group", group: { id, title: id, color: "gray", createdAt: 1, updatedAt: 1 }, tasks,
});
const root = (task: KnorviaTaskMeta): KnorviaGroupedTaskViewNode => ({ type: "task", task });
const describe = (view: KnorviaGroupedTaskView) => view.nodes.map((node) => node.type === "group"
  ? [node.group.id, node.tasks.map((task) => task.taskId)] : node.task.taskId);
const fixture = () => {
  const a = task("a"), b = task("b"), c = task("c"), d = task("d"), e = task("e");
  const view: KnorviaGroupedTaskView = { nodes: [root(a), group("g1", [b, c]), group("g2", [d]), root(e)] };
  return { a, b, c, d, e, view };
};

test("root-to-group and group-to-root task drops follow the destination parent", () => {
  const { a, c, e, view } = fixture();
  const moved = moveTaskOverTask(view, { activeTaskKey: taskKey(a), overTaskKey: taskKey(c), position: "before" });
  assert.deepEqual(describe(moved), [["g1", ["b", "a", "c"]], ["g2", ["d"]], "e"]);
  assert.equal(moved.nodes[1], view.nodes[2]);
  const outward = moveTaskOverTask(view, { activeTaskKey: taskKey(c), overTaskKey: taskKey(e), position: "after" });
  assert.deepEqual(describe(outward), ["a", ["g1", ["b"]], ["g2", ["d"]], "e", "c"]);
  assert.deepEqual(describe(view), ["a", ["g1", ["b", "c"]], ["g2", ["d"]], "e"]);
});

test("moving downward inside a group re-locates the destination after removal", () => {
  const { b, c, view } = fixture();
  assert.deepEqual(describe(moveTaskOverTask(view, { activeTaskKey: taskKey(b), overTaskKey: taskKey(c), position: "after" })), ["a", ["g1", ["c", "b"]], ["g2", ["d"]], "e"]);
});

test("group boundary commands retain original tasks and unrelated node references", () => {
  const { b, view } = fixture();
  const first = moveTaskToGroupStart(view, { activeTaskKey: taskKey(b), groupId: "g2" });
  const last = moveTaskToGroupEnd(view, { activeTaskKey: taskKey(b), groupId: "g2" });
  assert.deepEqual(describe(first), ["a", ["g1", ["c"]], ["g2", ["b", "d"]], "e"]);
  assert.deepEqual(describe(last), ["a", ["g1", ["c"]], ["g2", ["d", "b"]], "e"]);
  assert.equal(first.nodes[0], view.nodes[0]);
  assert.equal(findTaskInGroupedView(first, taskKey(b)), b);
});

test("task can move before or after a group without losing the group", () => {
  const { c, view } = fixture();
  assert.deepEqual(describe(moveTaskToRootAroundGroup(view, { activeTaskKey: taskKey(c), groupId: "g2", position: "before" })), ["a", ["g1", ["b"]], "c", ["g2", ["d"]], "e"]);
  assert.deepEqual(describe(moveTaskToRootAroundGroup(view, { activeTaskKey: taskKey(c), groupId: "g1", position: "after" })), ["a", ["g1", ["b"]], "c", ["g2", ["d"]], "e"]);
});

test("drag no-ops preserve exact view identity", () => {
  const { a, b, view } = fixture();
  assert.equal(moveTaskOverTask(view, { activeTaskKey: taskKey(a), overTaskKey: taskKey(a), position: "before" }), view);
  assert.equal(moveTaskOverTask(view, { activeTaskKey: "missing", overTaskKey: taskKey(b), position: "before" }), view);
  assert.equal(moveTaskToGroupStart(view, { activeTaskKey: taskKey(a), groupId: "missing" }), view);
  assert.equal(moveTaskToGroupEnd(view, { activeTaskKey: taskKey(a), groupId: "missing" }), view);
  assert.equal(moveTaskToRootAroundGroup(view, { activeTaskKey: taskKey(a), groupId: "missing", position: "before" }), view);
});

test("group drop on another group's member targets the whole group", () => {
  const { d, view } = fixture();
  const result = moveGroupAroundTopLevelNode(view, { activeGroupId: "g1", over: { type: "task", taskKey: taskKey(d) }, position: "after" });
  assert.deepEqual(describe(result), ["a", ["g2", ["d"]], ["g1", ["b", "c"]], "e"]);
  assert.equal(result.nodes[2], view.nodes[1]);
});

test("group self/member drops and missing targets do not detach a group", () => {
  const { b, view } = fixture();
  assert.equal(moveGroupAroundTopLevelNode(view, { activeGroupId: "g1", over: { type: "task", taskKey: taskKey(b) }, position: "before" }), view);
  assert.equal(moveGroupAroundTopLevelNode(view, { activeGroupId: "g1", over: { type: "group", groupId: "g1" }, position: "after" }), view);
  assert.equal(moveGroupAroundTopLevelNode(view, { activeGroupId: "g1", over: { type: "group", groupId: "missing" }, position: "before" }), view);
});

test("menu leaving a group places the task after its previous group", () => {
  const { b, view } = fixture();
  assert.deepEqual(describe(moveTaskByMenu(view, b, null)), ["a", ["g1", ["c"]], "b", ["g2", ["d"]], "e"]);
  assert.equal(moveTaskByMenu(view, b, "g1"), view);
  assert.deepEqual(describe(moveTaskByMenu(view, b, "g2")), ["a", ["g1", ["c"]], ["g2", ["d", "b"]], "e"]);
});

test("menu preserves the existing invalid group and empty-string destination boundaries", () => {
  const { a, b, view } = fixture();
  assert.deepEqual(describe(moveTaskByMenu(view, b, "missing")), ["a", ["g1", ["c"]], ["g2", ["d"]], "e"]);
  assert.deepEqual(describe(moveTaskByMenu(view, a, "")), [["g1", ["b", "c"]], ["g2", ["d"]], "e", "a"]);
});

test("menu top acts within the current group or root and preserves already-first identity", () => {
  const { a, b, c, e, view } = fixture();
  assert.equal(moveTaskToTopByMenu(view, a), view);
  assert.equal(moveTaskToTopByMenu(view, b), view);
  assert.deepEqual(describe(moveTaskToTopByMenu(view, c)), ["a", ["g1", ["c", "b"]], ["g2", ["d"]], "e"]);
  assert.deepEqual(describe(moveTaskToTopByMenu(view, e)), ["e", "a", ["g1", ["b", "c"]], ["g2", ["d"]]]);
});

test("same taskId and path in distinct workspace identities are separate entities", () => {
  const local = task("same"), remote = task("same", "remote-fixture");
  const view: KnorviaGroupedTaskView = { nodes: [root(local), group("remote", [remote])] };
  assert.notEqual(taskKey(local), taskKey(remote));
  const updated = { ...remote, title: "Remote title" };
  const result = replaceTaskInGroupedView(view, updated);
  assert.equal(findTaskInGroupedView(result, taskKey(local)), local);
  assert.equal(findTaskInGroupedView(result, taskKey(remote)), updated);
  assert.deepEqual(resolveGroupedDraftTaskPlacementForTask(view, taskKey(remote)), { type: "group", groupId: "remote" });
});

test("cloning separates structural arrays without cloning metadata or group definitions", () => {
  const { view } = fixture();
  const copy = cloneView(view);
  assert.notEqual(copy.nodes, view.nodes);
  for (let i = 0; i < view.nodes.length; i += 1) {
    const before = view.nodes[i]!, after = copy.nodes[i]!;
    assert.notEqual(after, before);
    if (before.type === "group" && after.type === "group") {
      assert.equal(after.group, before.group);
      assert.notEqual(after.tasks, before.tasks);
      assert.equal(after.tasks[0], before.tasks[0]);
    }
  }
});

test("find follows top-level order, while remove prefers a duplicate inside a group", () => {
  const duplicate = task("duplicate"), member = { ...duplicate, title: "Member duplicate" };
  const view: KnorviaGroupedTaskView = { nodes: [root(duplicate), group("g", [member])] };
  assert.equal(findTaskInGroupedView(view, taskKey(duplicate)), duplicate);
  const result = removeTaskFromGroupedView(view, taskKey(duplicate));
  assert.deepEqual(describe(result), ["duplicate", ["g", []]]);
  assert.notEqual(result.nodes[0], view.nodes[0]);
  assert.deepEqual(describe(view), ["duplicate", ["g", ["duplicate"]]]);
});

test("replacement updates all matches, retains root misses and rebuilds every group projection", () => {
  const { a, b, view } = fixture();
  const updated = { ...b, title: "Changed" };
  const result = replaceTaskInGroupedView(view, updated);
  assert.equal(result.nodes[0], view.nodes[0]);
  assert.equal(findTaskInGroupedView(result, taskKey(a)), a);
  assert.equal(findTaskInGroupedView(result, taskKey(b)), updated);
  assert.notEqual(result.nodes[2], view.nodes[2]);
});

test("archive filtering is reversible projection and retains empty groups", () => {
  const { b, c, view } = fixture();
  assert.equal(filterGroupedViewByTaskKeys(view, new Set(["missing"])), view);
  const result = filterGroupedViewByTaskKeys(view, new Set([taskKey(b), taskKey(c)]));
  assert.deepEqual(describe(result), ["a", ["g1", []], ["g2", ["d"]], "e"]);
  assert.equal(result.nodes[2], view.nodes[2]);
  assert.deepEqual(describe(view), ["a", ["g1", ["b", "c"]], ["g2", ["d"]], "e"]);
});

test("group expansion and draft selectors retain set order and distinguish empty lists", () => {
  const { a, c, view } = fixture();
  assert.deepEqual(getGroupedTaskGroupIds(view), ["g1", "g2"]);
  assert.equal(areAllGroupedTaskGroupsExpanded([], new Set()), false);
  assert.equal(areAllGroupedTaskGroupsExpanded(["g1", "g2"], new Set()), true);
  assert.equal(areAllGroupedTaskGroupsExpanded(["g1", "g2"], new Set(["g2"])), false);
  assert.deepEqual([...pruneCollapsedGroupedTaskGroupIds(new Set(["g2", "missing", "g1"]), ["g1", "g2"])], ["g2", "g1"]);
  assert.deepEqual(resolveGroupedDraftTaskPlacementForTask(view, taskKey(c)), { type: "group", groupId: "g1" });
  assert.deepEqual(resolveGroupedDraftTaskPlacementForTask(view, taskKey(a)), { type: "top" });
  assert.deepEqual(resolveGroupedDraftTaskPlacementForTask(view, "missing"), { type: "top" });
});

test("virtualizer ignores only the stale unrequested initial vertical zero", () => {
  const observed = { horizontal: false, scrollTop: 120, scrollOffset: 0 };
  assert.equal(planGroupedTaskScroll(0, {}, observed), null);
  assert.deepEqual(planGroupedTaskScroll(0, { behavior: "auto" }, observed), { top: 0, behavior: "auto" });
  assert.deepEqual(planGroupedTaskScroll(0, { adjustments: 2 }, observed), { top: 2, behavior: undefined });
  assert.deepEqual(planGroupedTaskScroll(10, { adjustments: -2, behavior: "smooth" }, observed), { top: 8, behavior: "smooth" });
  assert.deepEqual(planGroupedTaskScroll(0, {}, { ...observed, scrollOffset: 120 }), { top: 0, behavior: undefined });
  assert.deepEqual(planGroupedTaskScroll(0, {}, { ...observed, horizontal: true }), { left: 0, behavior: undefined });
});

test("overflow capability preserves the existing unanchored matching rule", () => {
  for (const value of ["auto", "scroll", "overlay", "auto hidden", "prefix-scroll"]) assert.equal(isPotentialVerticalScrollContainer(value), true);
  for (const value of ["hidden", "visible", "AUTO", ""]) assert.equal(isPotentialVerticalScrollContainer(value), false);
});
