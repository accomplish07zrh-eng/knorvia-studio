// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { state, workspace, task, types, storeUrl, value } from "./ui-b4-store-fixtures-20260930.js";

const publicStore: typeof import("../src/store/sessionStore.js") = await import(
  storeUrl("sessionStore")
);
const store = publicStore.useKnorviaSessionStore;
const initial = store.getState();
afterEach(() => store.setState(initial, true));

test("B4 store consumer: public selectors/types re-exports are the actual store boundary", () => {
  assert.equal(publicStore.getDefaultWorkspaceState, types.getDefaultWorkspaceState);
  assert.equal(store.getState().getWorkspaceState("missing"), types.getDefaultWorkspaceState());
  const remote = workspace(),
    local = workspace();
  store.setState({ workspaces: { p: local, remote } });
  assert.equal(store.getState().getWorkspaceState("p", "remote"), remote);
  assert.equal(publicStore.selectWorkspaceKnorviaState(store.getState(), "p", "remote"), remote);
});

test("B4 store consumer: task selection preserves identity, cached config and explicit read acknowledgement", () => {
  const local = workspace(),
    remote = workspace();
  const meta = { ...task("A", "remote"), unreadAt: 10 };
  const options = value<NonNullable<typeof remote.configOptions>>([
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "p/model",
      options: [],
    },
  ]);
  remote.taskListCache = [meta];
  remote.optimisticTaskListByTaskId.A = meta;
  remote.taskUnreadByTaskId.A = true;
  remote.taskConfigOptionsByTaskId.A = options;
  remote.taskConfigOptionsStatusByTaskId.A = "ready";
  store.setState({ workspaces: { p: local, remote } });
  store.getState().setActiveTaskId("p", "A", "remote");
  const next = store.getState().getWorkspaceState("p", "remote");
  assert.equal(next.activeTaskId, "A");
  assert.equal(store.getState().workspaces.p, local);
  assert.equal(next.taskConfigOptionsByTaskId.A, options);
  assert.equal(Object.hasOwn(next.optimisticTaskListByTaskId.A!, "unreadAt"), true);
  assert.equal(publicStore.getTaskUnreadIndicator(next, "A", meta), false);
  assert.deepEqual(store.getState().taskNavHistory.entries, [
    { kind: "task", workspacePath: "p", workspaceIdentity: "remote", taskId: "A" },
  ]);
});

test("B4 store consumer: unchanged task slice updates terminal runtime in only its identity bucket", () => {
  const local = workspace(),
    remote = workspace();
  store.setState({ workspaces: { p: local, remote } });
  store.getState().setTaskRuntimeState("p", "A", "running", null, "remote");
  store.getState().setTaskRuntimeState("p", "A", "error", "fixture failure", "remote");
  const next = store.getState().getWorkspaceState("p", "remote");
  assert.equal(publicStore.getTaskRuntimeState(next, "A").status, "error");
  assert.equal(publicStore.getTaskRuntimeState(next, "A").error, "fixture failure");
  assert.equal(store.getState().workspaces.p, local);
  assert.equal(publicStore.getTaskRuntimeState(local, "A"), types.DEFAULT_TASK_RUNTIME_STATE);
});

test("B4 store consumer: navigation notifications, back boundary and workspace state identity", () => {
  const buckets = { p: workspace() };
  store.setState({ workspaces: buckets });
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  try {
    store.getState().taskNavPushPluginStore("p");
    const history = store.getState().taskNavHistory;
    store.getState().taskNavPushPluginStore("p");
    assert.equal(calls, 2);
    assert.equal(store.getState().taskNavHistory, history);
    assert.equal(store.getState().taskNavGoBack(), null);
    assert.equal(calls, 2);
    store.getState().taskNavPushAutomations("p", "remote", "auto", "idle");
    const first = store.getState().taskNavHistory.entries[0];
    assert.equal(store.getState().taskNavGoBack(), first);
    assert.equal(calls, 4);
    assert.equal(store.getState().workspaces, buckets);
  } finally {
    unsubscribe();
  }
});

test("B4 store consumer: task deletion clears selection and leaves non-task history entries", () => {
  store.setState({ ...state({ p: workspace() }), taskNavHistory: { entries: [], cursor: -1 } });
  store.getState().setActiveTaskId("p", "A");
  store.getState().taskNavPushPluginStore("p");
  store.getState().removeTaskState("p", "A");
  assert.equal(store.getState().getWorkspaceState("p").activeTaskId, null);
  assert.deepEqual(store.getState().taskNavHistory.entries, [
    { kind: "plugin-store", workspacePath: "p" },
  ]);
});
