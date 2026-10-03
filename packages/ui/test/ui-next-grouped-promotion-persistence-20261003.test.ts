// SPDX-License-Identifier: Apache-2.0
// Pending promotion contracts; not executed or presented as hook/store/host acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaGroupedTaskView, KnorviaTaskGroup } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import type { WorkspaceOptimisticTaskOverlay } from "../src/hooks/workspaceTaskListOptimisticOverlay.js";
import { buildTaskEntityKey } from "../src/lib/taskQueryCache.js";
import { GroupedPromotionPersistenceOwner, planGroupedPromotions } from "../src/workspace-grouped-tasks/groupedPromotionPersistence.js";

type Promotion = WorkspaceOptimisticTaskOverlay["promotedGroupedDraftTaskByTaskId"][string];
const task = (taskId: string): KnorviaTaskMeta => ({ taskId, title: taskId, traceId: taskId, workspacePath: "/w", mode: "build", createdAt: 1, updatedAt: 2 });
const group: KnorviaTaskGroup = { id: "g", title: "g", color: "gray", createdAt: 1, updatedAt: 2 };
const promotion = (placement: Promotion["placement"]): Promotion => ({ placement, draftId: "draft", workspacePath: "/w", createdAt: 1 });
const overlay = (promotedGroupedDraftTaskByTaskId: Record<string, Promotion>): WorkspaceOptimisticTaskOverlay => ({ tasks: [], activeTaskId: null, promotedGroupedDraftTaskByTaskId });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let count = 0; count < 8; count += 1) await Promise.resolve(); };

test("planner preserves root-first/group-first conditions and overlay duplicate ordering", () => {
  const a = task("a"), b = task("b"), missing = task("missing");
  const view: KnorviaGroupedTaskView = { nodes: [{ type: "task", task: a }, { type: "group", group, tasks: [b] }] };
  const displayedView: KnorviaGroupedTaskView = { nodes: [{ type: "group", group, tasks: [missing, b] }, { type: "task", task: a }] };
  const overlays = [overlay({ a: promotion({ type: "top" }), b: promotion({ type: "group", groupId: "g" }), missing: promotion({ type: "group", groupId: "g" }) })];
  const plan = planGroupedPromotions({ view, displayedView, overlays: [...overlays, ...overlays], visibleMissing: new Set([buildTaskEntityKey(missing)]) });
  assert.deepEqual(plan.settledRoots, [a, a]);
  assert.deepEqual(plan.groupTasks, [missing, missing]);
});

test("root markers clear immediately and one group signature waits for refresh before clearing", async () => {
  const a = task("a"), b = task("b"), cleared: string[] = [], events: string[] = [];
  const refresh = deferred<void>(), write = deferred<KnorviaGroupedTaskView>();
  const owner = new GroupedPromotionPersistenceOwner({
    clear: (_path, id) => { cleared.push(id); }, invalidate: () => { events.push("invalidate"); },
    refreshCurrent: () => { events.push("refresh"); return refresh.promise; }, log: () => { events.push("error"); },
  });
  const stop = owner.activate(), view: KnorviaGroupedTaskView = { nodes: [{ type: "task", task: b }] };
  let writes = 0;
  const service = { applyGroupedTaskViewOrder: () => { writes += 1; return write.promise; } };
  const plan = { settledRoots: [a], groupTasks: [b] };
  owner.reconcile(plan, view, service);
  owner.reconcile(plan, view, service);
  assert.deepEqual(cleared, ["a", "a"]);
  assert.equal(writes, 1);
  write.resolve(view);
  await settle();
  assert.deepEqual(events, ["invalidate", "refresh"]);
  assert.deepEqual(cleared, ["a", "a"]);
  refresh.resolve();
  await settle();
  assert.deepEqual(cleared, ["a", "a", "b"]);
  owner.reconcile(plan, view, service);
  assert.equal(writes, 1);
  stop();
});

test("failure revokes only its own signature and a later reconcile can retry", async () => {
  const a = task("a"), view: KnorviaGroupedTaskView = { nodes: [{ type: "task", task: a }] };
  const errors: unknown[] = [], replies: Array<ReturnType<typeof deferred<KnorviaGroupedTaskView>>> = [];
  const owner = new GroupedPromotionPersistenceOwner({ clear: () => {}, invalidate: () => {}, refreshCurrent: async () => {}, log: (_message, error) => { errors.push(error); } });
  const stop = owner.activate(), plan = { settledRoots: [], groupTasks: [a] };
  const service = { applyGroupedTaskViewOrder: () => { const reply = deferred<KnorviaGroupedTaskView>(); replies.push(reply); return reply.promise; } };
  owner.reconcile(plan, view, service);
  const failure = new Error("write failed");
  replies[0]!.reject(failure);
  await settle();
  assert.deepEqual(errors, [failure]);
  owner.reconcile(plan, view, service);
  assert.equal(replies.length, 2);
  stop();
  replies[1]!.resolve(view);
  await settle();
});

test("scope replay prevents old results clearing drafts or deleting a new same-signature reservation", async () => {
  const a = task("a"), view: KnorviaGroupedTaskView = { nodes: [{ type: "task", task: a }] };
  const cleared: string[] = [], replies: Array<ReturnType<typeof deferred<KnorviaGroupedTaskView>>> = [];
  const owner = new GroupedPromotionPersistenceOwner({ clear: (_path, id) => { cleared.push(id); }, invalidate: () => {}, refreshCurrent: async () => {}, log: () => {} });
  const service = { applyGroupedTaskViewOrder: () => { const reply = deferred<KnorviaGroupedTaskView>(); replies.push(reply); return reply.promise; } };
  const plan = { settledRoots: [], groupTasks: [a] }, stopOld = owner.activate();
  owner.reconcile(plan, view, service);
  stopOld();
  const stopNew = owner.activate();
  owner.reconcile(plan, view, service);
  replies[0]!.reject(new Error("old scope failed"));
  await settle();
  owner.reconcile(plan, view, service);
  assert.equal(replies.length, 2);
  assert.deepEqual(cleared, []);
  replies[1]!.resolve(view);
  await settle();
  assert.deepEqual(cleared, ["a"]);
  stopNew();
});
