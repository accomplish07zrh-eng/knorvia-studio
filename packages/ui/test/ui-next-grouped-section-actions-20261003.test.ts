// SPDX-License-Identifier: Apache-2.0
// Source/port command/permission contracts; scoped results are not React/store/host acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KnorviaGroupedTaskView } from "@knorvia/services";
import type { KnorviaTaskMeta } from "@knorvia/shared";
import {
  GroupedSectionInteractionOwner,
  type GroupedSectionInteractionPorts,
} from "../src/workspace-grouped-tasks/groupedSectionInteractionOwner.js";
import { GroupedSectionMenuProjection } from "../src/workspace-grouped-tasks/groupedSectionMenuProjection.js";
import { taskKey } from "../src/workspace-grouped-tasks/ids.js";
import {
  filterGroupedViewByTaskKeys,
  replaceTaskInGroupedView,
} from "../src/workspace-grouped-tasks/view.js";

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
const group = { id: "g", title: "G", color: "gray" as const, createdAt: 1, updatedAt: 1 };
const initial: KnorviaGroupedTaskView = { nodes: [{ type: "group", group, tasks: [a, b] }] };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((resolve) => queueMicrotask(() => queueMicrotask(resolve)));
function fixture() {
  let view = initial,
    collapsed = new Set(["g", "other"]);
  const journal: unknown[] = [],
    orders: Array<{ view: KnorviaGroupedTaskView; permits: () => boolean }> = [];
  const renames: ReturnType<typeof deferred<KnorviaTaskMeta>>[] = [];
  const unread: ReturnType<typeof deferred<KnorviaTaskMeta>>[] = [];
  const archives: ReturnType<typeof deferred<KnorviaTaskMeta>>[] = [];
  const creates: ReturnType<typeof deferred<{ id: string }>>[] = [];
  const service: NonNullable<ReturnType<GroupedSectionInteractionPorts["taskService"]>> = {
    renameTask: (params) => {
      journal.push(["rename", params]);
      const reply = deferred<KnorviaTaskMeta>();
      renames.push(reply);
      return reply.promise;
    },
    setTaskUnread: (params) => {
      journal.push(["unread", params]);
      const reply = deferred<KnorviaTaskMeta>();
      unread.push(reply);
      return reply.promise;
    },
    archiveTask: (params) => {
      journal.push(["archive", params]);
      const reply = deferred<KnorviaTaskMeta>();
      archives.push(reply);
      return reply.promise;
    },
  };
  let context: ReturnType<GroupedSectionInteractionPorts["draft"]> = {
    activeTaskId: "a",
    activeWorkspacePath: "/w",
    activeWorkspaceIdentity: "remote-fixture",
    view,
  };
  const ports: GroupedSectionInteractionPorts = {
    authoritative: () => view,
    displayed: () => filterGroupedViewByTaskKeys(view, owner.read().archiving),
    draft: () => context,
    taskService: () => service,
    setCollapsed: (update) => {
      collapsed = update(collapsed);
    },
    createDraft: (placement) => {
      journal.push(["draft", placement]);
    },
    closeDraft: (path, identity) => {
      journal.push(["close-draft", path, identity]);
    },
    createGroup: () => {
      const reply = deferred<{ id: string }>();
      creates.push(reply);
      return reply.promise;
    },
    renameGroup: async (id, title) => {
      journal.push(["rename-group", id, title]);
    },
    colorGroup: async (id, color) => {
      journal.push(["color-group", id, color]);
    },
    ungroup: async (id) => {
      journal.push(["ungroup", id]);
    },
    order: async (next, permits) => {
      orders.push({ view: next, permits });
    },
    commitMetadata: (kind, previous, next, canWriteView) => {
      const allowed = canWriteView();
      journal.push(["metadata", kind, previous, next, allowed]);
      if (allowed) view = replaceTaskInGroupedView(view, next);
    },
    commitArchive: (previous, next) => {
      journal.push(["archived", previous, next]);
    },
    notify: (id) => {
      journal.push(id);
    },
  };
  const owner = new GroupedSectionInteractionOwner(() => ports),
    stop = owner.activate();
  return {
    owner,
    stop,
    ports,
    journal,
    orders,
    renames,
    unread,
    archives,
    creates,
    service,
    view: () => view,
    replaceView: (next: KnorviaGroupedTaskView) => {
      view = next;
    },
    context: (next: Partial<typeof context>) => {
      context = { ...context, ...next };
    },
    collapsed: () => collapsed,
  };
}

test("menu arrays retain independent positional identities across task-only and group-metadata changes", () => {
  const projection = new GroupedSectionMenuProjection(),
    first = projection.project(initial);
  const taskOnly = projection.project({
    nodes: [{ type: "group", group, tasks: [{ ...a, title: "changed" }] }],
  });
  assert.equal(taskOnly.menus, first.menus);
  assert.equal(taskOnly.ids, first.ids);
  const metadata = projection.project({
    nodes: [{ type: "group", group: { ...group, title: "renamed" }, tasks: [a] }],
  });
  assert.notEqual(metadata.menus, first.menus);
  assert.equal(metadata.ids, first.ids);
  assert.deepEqual(metadata.menus, [{ id: "g", title: "renamed", color: "gray" }]);
});

test("contextual drafts retain task/group/top selection and only explicit close touches the persisted draft", () => {
  const h = fixture();
  h.owner.createContextualDraft();
  assert.deepEqual([...h.collapsed()], ["other"]);
  const uncollapsed = h.collapsed();
  h.owner.createGroupDraft("g");
  assert.equal(h.collapsed(), uncollapsed);
  h.context({ activeTaskId: null, placement: { type: "group", groupId: "other" } });
  h.owner.createContextualDraft();
  h.owner.createTopDraft();
  h.owner.toggleCollapsed("g");
  assert.notEqual(h.collapsed(), uncollapsed);
  assert.deepEqual(h.journal.slice(0, 4), [
    ["draft", { type: "group", groupId: "g" }],
    ["draft", { type: "group", groupId: "g" }],
    ["draft", { type: "group", groupId: "other" }],
    ["draft", { type: "top" }],
  ]);
  h.owner.closeDraft();
  h.stop();
  assert.equal(
    h.journal.filter((entry) => Array.isArray(entry) && entry[0] === "close-draft").length,
    1,
  );
});

test("menu order retains hidden archive members and the shared bridge permission revokes old order callbacks", () => {
  const h = fixture();
  // 组内第一项置顶本来是 no-op；原夹具误把它当作顶层移动，未产生 order。
  h.owner.moveToTop(a);
  assert.equal(h.orders.length, 0);
  // 该用例需要非首位的顶层任务，才能同时观察完整归档成员与 order 许可。
  h.replaceView({
    nodes: [
      { type: "group", group, tasks: [b] },
      { type: "task", task: a },
    ],
  });
  h.owner.archive(b);
  assert.equal(h.owner.read().archiving.has(taskKey(b)), true);
  h.owner.moveToTop(a);
  assert.equal(h.orders.length, 1);
  const reordered = h.orders[0]!;
  assert.equal(reordered.view.nodes.length, 2);
  const first = reordered.view.nodes[0]!;
  assert.equal(first.type === "task" && first.task, a);
  assert.equal(reordered.view.nodes[1]!.type, "group");
  const node = reordered.view.nodes[1]!;
  assert.equal(node.type === "group" && node.tasks[0], b);
  assert.equal(reordered.permits(), true);
  h.owner.invalidateOrder(); // section drag-start bridge
  assert.equal(reordered.permits(), false);
  const dragAllows = h.owner.permitOrder(); // section drag-persist bridge
  h.owner.moveToTop(a);
  assert.equal(dragAllows(), false);
  h.stop();
  assert.equal(h.orders[1]!.permits(), false);
});

test("rename trims the host payload and an old completion cannot close a newly opened dialog", async () => {
  const h = fixture();
  h.owner.startRename(a);
  h.owner.setRenameDraft("  a  ");
  await h.owner.submitRename();
  assert.equal(h.renames.length, 0);
  assert.equal(h.owner.read().renamingTaskKey, null);
  h.owner.startRename(a);
  h.owner.setRenameDraft("  renamed  ");
  const pending = h.owner.submitRename();
  assert.deepEqual(h.journal[0], [
    "rename",
    { taskId: "a", workspacePath: "/w", workspaceIdentity: "remote-fixture", title: "renamed" },
  ]);
  h.owner.startRename(b);
  h.owner.setRenameDraft("next dialog");
  h.renames[0]!.resolve({ ...a, title: "renamed" });
  await pending;
  assert.equal(h.owner.read().renamingTaskKey, taskKey(b));
  assert.equal(h.owner.read().renameDraft, "next dialog");
  h.stop();
});

test("latest task metadata owns local view acceptance while every successful host reply keeps its target facts", async () => {
  const h = fixture();
  h.owner.startRename(a);
  h.owner.setRenameDraft("first");
  const first = h.owner.submitRename();
  h.owner.setRenameDraft("second");
  const second = h.owner.submitRename();
  h.renames[1]!.resolve({ ...a, title: "second" });
  await second;
  h.renames[0]!.resolve({ ...a, title: "first" });
  await first;
  const metadata = h.journal.filter(
    (entry): entry is unknown[] => Array.isArray(entry) && entry[0] === "metadata",
  );
  assert.deepEqual(
    metadata.map((entry) => entry[4]),
    [true, false],
  );
  const node = h.view().nodes[0]!;
  assert.equal(node.type === "group" && node.tasks[0]!.title, "second");
  h.stop();
});

test("rename failures keep the current draft and missing services cancel without a host write", async () => {
  const h = fixture();
  h.owner.startRename(a);
  h.owner.setRenameDraft("new title");
  const pending = h.owner.submitRename();
  h.renames[0]!.reject(new Error("host"));
  await pending;
  assert.equal(h.owner.read().renameDraft, "new title");
  assert.equal(h.journal.at(-1), "taskList.renameFailed");
  h.ports.taskService = () => undefined;
  await h.owner.submitRename();
  assert.equal(h.owner.read().renamingTaskKey, null);
  h.stop();
});

test("unread metadata permission does not revoke a same-edit rename dialog completion", async () => {
  const h = fixture();
  h.owner.startRename(a);
  h.owner.setRenameDraft("new title");
  const pending = h.owner.submitRename();
  h.owner.markUnread(a);
  h.renames[0]!.resolve({ ...a, title: "new title" });
  await pending;
  assert.equal(h.owner.read().renamingTaskKey, null);
  h.stop();
});

test("unread service replacement revokes view acceptance without cancelling captured target store/cache writes", async () => {
  const h = fixture();
  h.owner.markUnread(a);
  h.ports.taskService = () => undefined;
  h.unread[0]!.resolve({ ...a, unreadAt: 5 });
  await flush();
  assert.deepEqual((h.journal.at(-1) as unknown[]).slice(0, 2), ["metadata", "unread"]);
  assert.equal((h.journal.at(-1) as unknown[])[4], false);
  h.stop();
});

test("archive failure only releases its current key lease; successful hiding waits for authoritative absence", async () => {
  const h = fixture();
  h.owner.archive(a);
  h.owner.archive(a);
  h.archives[0]!.reject(new Error("old"));
  await flush();
  assert.equal(h.owner.read().archiving.has(taskKey(a)), true);
  h.archives[1]!.reject(new Error("current"));
  await flush();
  assert.equal(h.owner.read().archiving.has(taskKey(a)), false);
  h.owner.archive(a);
  h.archives[2]!.resolve(a);
  await flush();
  const hidden = h.owner.read().archiving;
  h.owner.reconcileArchives(initial);
  assert.equal(h.owner.read().archiving, hidden);
  h.owner.reconcileArchives({ nodes: [] });
  assert.equal(h.owner.read().archiving.size, 0);
  h.stop();
});

test("archive leases pause while inactive, resume same-service work, and release failed or replaced-service work", async () => {
  const h = fixture();
  h.owner.archive(a);
  h.stop();
  h.archives[0]!.reject(new Error("paused failure"));
  await flush();
  assert.equal(h.owner.read().archiving.has(taskKey(a)), true);
  const stop = h.owner.activate();
  assert.equal(h.owner.read().archiving.has(taskKey(a)), false);
  h.owner.archive(a);
  stop();
  const resumed = h.owner.activate();
  assert.equal(h.owner.read().archiving.has(taskKey(a)), true);
  h.ports.taskService = () => undefined;
  h.owner.reconcileArchiveServices();
  assert.equal(h.owner.read().archiving.has(taskKey(a)), false);
  resumed();
});

test("new-group setup stays in its issuing scope and acknowledgement only clears a matching id", async () => {
  const h = fixture();
  h.owner.createGroup();
  h.creates[0]!.resolve({ id: "new" });
  await flush();
  h.owner.acknowledgeSetup("other");
  assert.equal(h.owner.read().newGroupSetupId, "new");
  h.owner.acknowledgeSetup("new");
  assert.equal(h.owner.read().newGroupSetupId, null);
  h.owner.createGroup();
  h.stop();
  const stop = h.owner.activate();
  h.creates[1]!.resolve({ id: "stale" });
  await flush();
  assert.equal(h.owner.read().newGroupSetupId, null);
  stop();
});
