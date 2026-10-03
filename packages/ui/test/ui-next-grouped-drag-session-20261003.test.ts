// SPDX-License-Identifier: Apache-2.0
// Pending drag/session contracts; not executed or claimed as React/DndKit acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import {
  GroupedDragSessionOwner,
  type GroupedDragPorts,
} from "../src/workspace-grouped-tasks/groupedDragSessionOwner.js";
import { taskKey } from "../src/workspace-grouped-tasks/ids.js";

const task = (taskId: string): KnorviaTaskMeta => ({
  taskId,
  traceId: taskId,
  title: taskId,
  createdAt: 1,
  updatedAt: 1,
  mode: "build",
  workspacePath: "/w",
  workspaceIdentity: "remote-fixture",
});
const a = task("a"),
  b = task("b");
const active = { type: "grouped-task", taskKey: taskKey(a) };
const actor = (data: unknown) => ({ data: { current: data } });
const start = (data: unknown = active) => ({ active: actor(data) }) as unknown as DragStartEvent;
const end = (data: unknown = active) => ({ active: actor(data) }) as unknown as DragEndEvent;
const over = (data: unknown, target: unknown) =>
  ({ active: actor(data), over: actor(target) }) as unknown as DragOverEvent;
const move = (y: number) => ({ delta: { y } }) as unknown as DragMoveEvent;
const flush = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function harness() {
  const origin: KnorviaGroupedTaskView = {
    nodes: [
      { type: "task", task: a },
      { type: "task", task: b },
      {
        type: "group",
        group: { id: "g", title: "G", color: "gray", createdAt: 1, updatedAt: 1 },
        tasks: [],
      },
    ],
  };
  let collapsed = new Set(["other"]);
  const animations: KnorviaGroupedTaskView[] = [],
    journal: unknown[] = [],
    permissions: Array<() => boolean> = [];
  const reply = deferred();
  const ports: GroupedDragPorts = {
    authoritative: () => origin,
    collapsed: () => collapsed,
    setCollapsed: (update) => {
      collapsed = update(collapsed);
      journal.push("collapsed");
    },
    payload: () => ({
      kind: "knorvia/session",
      workspacePath: a.workspacePath,
      workspaceIdentity: a.workspaceIdentity,
      remoteSessionId: "attachment-fixture",
      sessionId: a.taskId,
    }),
    measure: (kind, key) => {
      journal.push(["measure", kind, key]);
      return 123;
    },
    animate: (view) => {
      animations.push(view);
    },
    persist: (view, permission) => {
      permissions.push(permission);
      journal.push(["save", view]);
      return reply.promise;
    },
    failed: () => {
      journal.push("toast");
    },
    track: () => ({
      getPosition: () => ({ x: 77, y: 88 }),
      dispose: () => {
        journal.push("dispose");
      },
    }),
    updateWorkbench: (payload, x, y) => {
      journal.push(["preview", payload, x, y]);
    },
    finishWorkbench: () => false,
    cancelWorkbench: () => {
      journal.push("cancel-preview");
    },
  };
  const owner = new GroupedDragSessionOwner(() => ports),
    stop = owner.activate();
  const pointerDown = () => owner.pointerDown({} as Document, {} as Event);
  return {
    owner,
    stop,
    ports,
    origin,
    animations,
    journal,
    reply,
    permissions,
    pointerDown,
    collapsed: () => collapsed,
  };
}

test("task activation measures once and sends attachment identity with captured viewport coordinates", () => {
  const h = harness();
  h.pointerDown();
  h.owner.start(start());
  h.owner.over(over(active, { type: "grouped-task", taskKey: taskKey(b) }));
  h.owner.move(move(9));
  h.owner.move(move(10));
  assert.deepEqual(h.owner.read(), { activeTaskKey: taskKey(a), activeGroupId: null, width: 123 });
  assert.equal(
    h.journal.filter((entry) => Array.isArray(entry) && entry[0] === "measure").length,
    1,
  );
  assert.deepEqual(
    h.journal.find((entry) => Array.isArray(entry) && entry[0] === "preview"),
    ["preview", h.ports.payload(taskKey(a)), 77, 88],
  );
  h.owner.cancel();
  assert.equal(h.animations.at(-1), h.origin);
  assert.deepEqual(h.owner.read(), { activeTaskKey: null, activeGroupId: null, width: null });
  h.stop();
});

test("direction reversal replays the last target, while ordinary moves keep the current preview", () => {
  const h = harness();
  h.owner.start(start());
  h.owner.over(over(active, { type: "grouped-task", taskKey: taskKey(b) }));
  assert.equal(h.animations[0]!.nodes[0]!.type === "task" && h.animations[0]!.nodes[0]!.task, b);
  h.owner.move(move(8));
  assert.equal(h.animations.length, 1);
  h.owner.move(move(7));
  assert.equal(h.animations[1]!.nodes[0]!.type === "task" && h.animations[1]!.nodes[0]!.task, a);
  h.stop();
});

test("group cancel retains its existing preview boundary and restores only temporary collapsed prefs", () => {
  const h = harness(),
    data = { type: "grouped-group", groupId: "g" };
  h.pointerDown();
  h.owner.start(start(data));
  assert.deepEqual([...h.collapsed()], ["other", "g"]);
  h.owner.over(over(data, { type: "grouped-task", taskKey: taskKey(a) }));
  const preview = h.animations.at(-1),
    count = h.animations.length;
  h.owner.cancel();
  assert.equal(h.animations.length, count);
  assert.notEqual(preview, h.origin);
  assert.deepEqual([...h.collapsed()], ["other"]);
  assert.equal(h.journal.includes("dispose"), true);
  h.stop();
});

test("Workbench drop and same-order end restore origin without writing grouped order", () => {
  const h = harness();
  h.ports.finishWorkbench = (_payload, x, y) => {
    assert.deepEqual([x, y], [77, 88]);
    return true;
  };
  h.pointerDown();
  h.owner.start(start());
  h.owner.over(over(active, { type: "grouped-task", taskKey: taskKey(b) }));
  h.owner.end(end());
  assert.equal(h.animations.at(-1), h.origin);
  assert.equal(h.permissions.length, 0);
  h.owner.start(start());
  h.owner.end(end());
  assert.equal(h.permissions.length, 0);
  h.stop();
});

test("failed order restores origin/toast, but a new gesture revokes only the old rollback permission", async () => {
  const h = harness();
  h.owner.start(start());
  h.owner.over(over(active, { type: "grouped-task", taskKey: taskKey(b) }));
  h.owner.end(end());
  assert.equal(h.permissions[0]!(), true);
  h.owner.start(start());
  assert.equal(h.permissions[0]!(), false);
  h.owner.over(over(active, { type: "grouped-empty-drop-zone", groupId: "g" }));
  const newerPreview = h.animations.at(-1),
    count = h.animations.length;
  h.reply.reject(new Error("late failure"));
  await flush();
  assert.equal(h.animations.length, count);
  assert.equal(h.animations.at(-1), newerPreview);
  assert.equal(h.journal.includes("toast"), true);
  h.stop();
  const current = harness();
  current.owner.start(start());
  current.owner.over(over(active, { type: "grouped-task", taskKey: taskKey(b) }));
  current.owner.end(end());
  current.reply.reject(new Error("current failure"));
  await flush();
  assert.equal(current.animations.at(-1), current.origin);
  assert.equal(current.journal.includes("toast"), true);
  current.stop();
});

test("scope cleanup restores captured prefs, disposes pointer and forbids late animations/toasts", async () => {
  const h = harness();
  h.owner.start(start());
  h.owner.over(over(active, { type: "grouped-task", taskKey: taskKey(b) }));
  h.owner.end(end());
  h.pointerDown();
  h.owner.start(start({ type: "grouped-group", groupId: "g" }));
  const originalRestore = h.ports.setCollapsed;
  let wrongScopeRestore = 0;
  h.ports.setCollapsed = () => {
    wrongScopeRestore += 1;
  };
  const count = h.animations.length;
  h.stop();
  assert.equal(wrongScopeRestore, 0);
  assert.deepEqual([...h.collapsed()], ["other"]);
  assert.equal(h.journal.includes("dispose"), true);
  h.reply.reject(new Error("unmounted failure"));
  await flush();
  assert.equal(h.animations.length, count);
  assert.equal(h.journal.includes("toast"), false);
  h.ports.setCollapsed = originalRestore;
});

test("start and end failures retain the original error while releasing all temporary resources", () => {
  const h = harness(),
    failure = new Error("width failure");
  h.pointerDown();
  h.ports.measure = () => {
    throw failure;
  };
  assert.throws(
    () => h.owner.start(start({ type: "grouped-group", groupId: "g" })),
    (error) => error === failure,
  );
  assert.deepEqual([...h.collapsed()], ["other"]);
  assert.equal(h.journal.includes("dispose"), true);
  h.ports.measure = () => 12;
  h.pointerDown();
  h.owner.start(start());
  h.ports.finishWorkbench = () => {
    throw failure;
  };
  h.ports.cancelWorkbench = () => {
    throw new Error("cleanup failure");
  };
  assert.throws(
    () => h.owner.end(end()),
    (error) => error === failure,
  );
  assert.equal(h.owner.read().activeTaskKey, null);
  h.ports.cancelWorkbench = () => {};
  h.stop();
});

test("reentrant group start restores the old snapshot while retaining the newly captured tracker", () => {
  const h = harness();
  h.pointerDown();
  h.owner.start(start({ type: "grouped-group", groupId: "g" }));
  h.pointerDown();
  const disposed = h.journal.filter((entry) => entry === "dispose").length;
  h.owner.start(start());
  assert.equal(h.journal.filter((entry) => entry === "dispose").length, disposed);
  assert.deepEqual([...h.collapsed()], ["other"]);
  h.owner.move(move(1));
  assert.equal(
    h.journal.some((entry) => Array.isArray(entry) && entry[0] === "preview"),
    true,
  );
  h.stop();
});
