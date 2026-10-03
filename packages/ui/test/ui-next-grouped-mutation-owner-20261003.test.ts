// SPDX-License-Identifier: Apache-2.0
// Pending mutation/data-compatibility contracts; no execution or host/React acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  IKnorviaTaskService,
  KnorviaGroupedTaskView,
  KnorviaTaskGroup,
} from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import { GroupedTaskMutationOwner } from "../src/workspace-grouped-tasks/groupedMutationOwner.js";
import { viewToOrderInput } from "../src/workspace-grouped-tasks/groupedMutationProjection.js";

const task = (taskId: string, workspaceIdentity?: string): KnorviaTaskMeta => ({
  taskId,
  traceId: taskId,
  title: taskId,
  createdAt: 1,
  updatedAt: 2,
  mode: "build",
  workspacePath: "/w",
  workspaceIdentity,
});
const group = (id: string): KnorviaTaskGroup => ({
  id,
  title: id,
  color: "gray",
  createdAt: 1,
  updatedAt: 2,
});
const fixture = (): KnorviaGroupedTaskView => ({
  nodes: [
    { type: "task", task: task("a"), sortOrder: -2000 },
    { type: "group", group: group("g"), tasks: [task("b")] },
  ],
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function harness() {
  let view = fixture();
  const events: string[] = [],
    failures: unknown[] = [];
  const owner = new GroupedTaskMutationOwner({
    setView: (update) => {
      view = typeof update === "function" ? update(view) : update;
      events.push("view");
    },
    setSaving: (saving) => {
      events.push(`saving:${saving}`);
    },
    invalidate: () => {
      events.push("invalidate");
    },
    refreshCurrent: async () => {
      events.push("current-refresh");
    },
    log: (message, error) => {
      events.push(message);
      failures.push(error);
    },
  });
  const service: Pick<
    IKnorviaTaskService,
    | "createTaskGroup"
    | "renameTaskGroup"
    | "updateTaskGroupColor"
    | "applyGroupedTaskViewOrder"
    | "deleteTaskGroup"
  > = {
    createTaskGroup: async () => group("created"),
    renameTaskGroup: async ({ groupId, title }) => ({ ...group(groupId), title }),
    updateTaskGroupColor: async ({ groupId, color }) => ({ ...group(groupId), color }),
    applyGroupedTaskViewOrder: async () => {
      events.push("write-order");
      return { nodes: [] };
    },
    deleteTaskGroup: async () => {
      events.push("delete-group");
    },
  };
  const refresh = async () => {
    events.push("captured-refresh");
  };
  const stop = owner.activate();
  events.length = 0;
  return { owner, service, refresh, events, failures, stop, view: () => view };
}

test("serialization preserves identity/order/scopes and excludes complete metadata", () => {
  const view: KnorviaGroupedTaskView = {
    nodes: [
      { type: "task", task: task("a", "one") },
      { type: "group", group: group("g"), tasks: [task("b", " one "), task("c", "two")] },
    ],
  };
  assert.deepEqual(viewToOrderInput({ view }), {
    workspaceScopes: [
      { workspacePath: "/w", workspaceIdentity: " one " },
      { workspacePath: "/w", workspaceIdentity: "two" },
    ],
    topLevelNodes: [
      { type: "task", task: { workspacePath: "/w", workspaceIdentity: "one", taskId: "a" } },
      { type: "group", groupId: "g" },
    ],
    groups: [
      {
        groupId: "g",
        taskRefs: [
          { workspacePath: "/w", workspaceIdentity: " one ", taskId: "b" },
          { workspacePath: "/w", workspaceIdentity: "two", taskId: "c" },
        ],
      },
    ],
  });
});

test("create prepends with original sort spacing and waits for captured refresh", async () => {
  const h = harness();
  const created = await h.owner.create(h.service, h.refresh);
  assert.equal(h.view().nodes[0]!.type === "group" && h.view().nodes[0]!.group, created);
  assert.equal(h.view().nodes[0]!.sortOrder, -3000);
  assert.deepEqual(h.events, [
    "saving:true",
    "view",
    "invalidate",
    "captured-refresh",
    "saving:false",
  ]);
  h.stop();
});

test("edit no-ops preserve identity; failure restores captured view and rethrows the original error", async () => {
  const h = harness(),
    previous = h.view();
  await h.owner.edit(previous, "g", { title: "  " }, h.service);
  assert.equal(h.view(), previous);
  assert.deepEqual(h.events, []);
  const failure = new Error("rename rejected");
  h.service.renameTaskGroup = async () => {
    throw failure;
  };
  await assert.rejects(
    h.owner.edit(previous, "g", { title: "  next  " }, h.service),
    (error) => error === failure,
  );
  assert.equal(h.view(), previous);
  assert.equal(h.failures[0], failure);
  assert.equal(h.events.at(-1), "saving:false");
  h.stop();
});

test("host order response is ignored, while order failure restores view and refreshes captured state", async () => {
  const h = harness(),
    previous = h.view(),
    next = { nodes: previous.nodes.slice().reverse() };
  await h.owner.order(previous, next, h.service, h.refresh);
  assert.equal(h.view(), next);
  assert.equal(h.events.includes("current-refresh"), true);
  const failure = new Error("order rejected");
  h.service.applyGroupedTaskViewOrder = async () => {
    throw failure;
  };
  await assert.rejects(
    h.owner.order(next, previous, h.service, h.refresh),
    (error) => error === failure,
  );
  assert.equal(h.view(), next);
  assert.equal(h.events.includes("captured-refresh"), true);
  h.stop();
});

test("ungroup preserves tasks at the original node position before deleting the group", async () => {
  const h = harness();
  await h.owner.ungroup(h.view(), "g", h.service, h.refresh);
  assert.deepEqual(
    h.view().nodes.map((node) => (node.type === "task" ? node.task.taskId : node.group.id)),
    ["a", "b"],
  );
  assert.deepEqual(h.events, [
    "saving:true",
    "view",
    "saving:true",
    "write-order",
    "invalidate",
    "current-refresh",
    "saving:false",
    "delete-group",
    "invalidate",
    "captured-refresh",
    "saving:false",
  ]);
  h.stop();
});

test("scope cleanup lets the host operation finish without late view/saving writes", async () => {
  const h = harness(),
    reply = deferred<KnorviaTaskGroup>();
  h.service.createTaskGroup = () => reply.promise;
  const pending = h.owner.create(h.service, h.refresh);
  h.stop();
  const stopNew = h.owner.activate();
  const before = h.view(),
    eventCount = h.events.length;
  const created = group("late");
  reply.resolve(created);
  assert.equal(await pending, created);
  assert.equal(h.view(), before);
  assert.equal(h.events.length, eventCount);
  stopNew();
});

test("order forwards its publication permission through refresh and suppresses a superseded rollback", async () => {
  let permission = true,
    propagated: (() => boolean) | undefined;
  const previous = fixture(),
    next = { nodes: previous.nodes.slice().reverse() };
  let view = previous;
  const failure = new Error("late order failure"),
    reply = deferred<Awaited<ReturnType<IKnorviaTaskService["applyGroupedTaskViewOrder"]>>>();
  const owner = new GroupedTaskMutationOwner({
    setView: (update) => {
      view = typeof update === "function" ? update(view) : update;
    },
    setSaving: () => {},
    invalidate: () => {},
    log: () => {},
    refreshCurrent: async (canPublish) => {
      propagated = canPublish;
    },
  });
  const h = harness(),
    stop = owner.activate(),
    canPublish = () => permission;
  await owner.order(previous, next, h.service, h.refresh, canPublish);
  assert.equal(propagated, canPublish);
  permission = false;
  assert.equal(propagated!(), false);
  permission = true;
  h.service.applyGroupedTaskViewOrder = () => reply.promise;
  const pending = owner.order(next, previous, h.service, h.refresh, canPublish);
  permission = false;
  view = next;
  reply.reject(failure);
  await assert.rejects(pending, (error) => error === failure);
  assert.equal(view, next);
  assert.equal(h.events.includes("captured-refresh"), false);
  stop();
  h.stop();
});
