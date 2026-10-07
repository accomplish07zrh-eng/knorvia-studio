import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTaskEntityKey } from "../src/lib/taskQueryCache.js";
import { useTaskQueryCacheStore } from "../src/store/taskQueryCacheStore.js";

const task = {
  taskId: "attention-fixture",
  traceId: "attention-fixture",
  title: "Synthetic task",
  workspacePath: "/synthetic/project",
  workspaceIdentity: "synthetic-identity",
  mode: "build" as const,
  createdAt: 1,
  updatedAt: 10,
  status: "completed" as const,
  unreadAt: 100,
};

test("late read ACK and rollback preserve a newer authoritative unread marker", () => {
  const store = useTaskQueryCacheStore.getState();
  const key = buildTaskEntityKey(task);
  try {
    for (const outcome of ["success", "failure"] as const) {
      store.clearAll();
      store.upsertTaskMeta(task);
      const token = store.setTaskUnreadOverlay(task, undefined, 100);
      store.upsertTaskMeta({ ...task, updatedAt: 20, unreadAt: 101 });
      if (outcome === "success") store.reconcileTaskUnread(task, undefined, token);
      else store.rollbackTaskUnread(task, 100, token);
      assert.equal(useTaskQueryCacheStore.getState().taskMetaByEntityKey[key]?.unreadAt, 101);
    }
  } finally {
    store.clearAll();
  }
});

test("a second identical clear, cache reset and foreign workspace revoke older responses", () => {
  const store = useTaskQueryCacheStore.getState();
  const key = buildTaskEntityKey(task);
  try {
    store.clearAll();
    store.upsertTaskMeta(task);
    const old = store.setTaskUnreadOverlay(task, undefined, 100);
    const fresh = store.setTaskUnreadOverlay(task, undefined, 100);
    assert.equal(store.rollbackTaskUnread(task, 100, old), false);
    assert.equal(useTaskQueryCacheStore.getState().taskMetaByEntityKey[key]?.unreadAt, undefined);
    assert.equal(
      store.reconcileTaskUnread({ ...task, workspaceIdentity: "foreign" }, 999, fresh),
      false,
    );
    assert.equal(store.reconcileTaskUnread(task, undefined, fresh), true);
    assert.equal(store.reconcileTaskUnread(task, 100, old), false);
    const beforeReset = store.setTaskUnreadOverlay(task, undefined, 100);
    store.clearAll();
    store.upsertTaskMeta({ ...task, unreadAt: 102 });
    assert.equal(store.reconcileTaskUnread(task, undefined, beforeReset), false);
    assert.equal(useTaskQueryCacheStore.getState().taskMetaByEntityKey[key]?.unreadAt, 102);
  } finally {
    store.clearAll();
  }
});

test("membership responses preserve new markers through overlay release and late old lists", () => {
  const store = useTaskQueryCacheStore.getState();
  const key = buildTaskEntityKey(task);
  const descriptor = {
    kind: "timeline" as const,
    sortBy: "updated" as const,
    search: "",
    expanded: true,
    visibleLimit: null,
    workspaceKeys: [task.workspaceIdentity],
  };
  try {
    for (const batch of [false, true]) {
      store.clearAll();
      store.upsertTaskMeta(task);
      const token = store.setTaskUnreadOverlay(task, undefined, 100);
      const write = (unreadAt: number | undefined) => {
        const entry = {
          queryKey: "attention-query",
          descriptor,
          items: [{ ...task, unreadAt }],
          total: 1,
          hasMore: false,
        };
        if (batch) store.setQueryResults([entry]);
        else store.setQueryResult(entry);
      };
      write(101);
      write(100); // Earlier query may finish after the newer event released its overlay.
      assert.equal(useTaskQueryCacheStore.getState().taskMetaByEntityKey[key]?.unreadAt, 101);
      assert.equal(store.reconcileTaskUnread(task, undefined, token), false);
      assert.equal(useTaskQueryCacheStore.getState().taskMetaByEntityKey[key]?.unreadAt, 101);
    }
    const token = store.setTaskUnreadOverlay(task, undefined, 101);
    store.invalidateWorkspaceKeys([task.workspaceIdentity]);
    store.upsertTaskMeta({ ...task, unreadAt: 102 });
    assert.equal(store.rollbackTaskUnread(task, 101, token), false);
    assert.equal(useTaskQueryCacheStore.getState().taskMetaByEntityKey[key]?.unreadAt, 102);
  } finally {
    store.clearAll();
  }
});

test("a pending background unread write cannot hide a newer event through a list response", () => {
  const store = useTaskQueryCacheStore.getState();
  const key = buildTaskEntityKey(task);
  const descriptor = {
    kind: "timeline" as const,
    sortBy: "updated" as const,
    search: "",
    expanded: true,
    visibleLimit: null,
    workspaceKeys: [task.workspaceIdentity],
  };
  try {
    for (const rollback of [false, true]) {
      store.clearAll();
      store.upsertTaskMeta(task);
      const token = store.setTaskUnreadOverlay(task, 101, 100);
      for (const unreadAt of [102, 100])
        store.setQueryResults([
          {
            queryKey: "background",
            descriptor,
            items: [{ ...task, unreadAt }],
            total: 1,
            hasMore: false,
          },
        ]);
      const accepted = rollback
        ? store.rollbackTaskUnread(task, 100, token)
        : store.reconcileTaskUnread(task, 101, token);
      assert.equal(accepted, false);
      assert.equal(useTaskQueryCacheStore.getState().taskMetaByEntityKey[key]?.unreadAt, 102);
    }
  } finally {
    store.clearAll();
  }
});
