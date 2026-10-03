// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  types,
  workspace,
  state,
  task,
  value,
  freeze,
  storeUrl,
} from "./ui-b4-store-fixtures-20260930.js";

const s: typeof import("../src/store/sessionStoreSelectors.js") = await import(
  storeUrl("sessionStoreSelectors")
);

test("B4 defaults: fixed exports, own undefined runtime fields and stable fallback", () => {
  assert.deepEqual(Object.keys(types).sort(), [
    "DEFAULT_TASK_RUNTIME_STATE",
    "DEFAULT_TASK_UI_STATE",
    "DEFAULT_WORKSPACE_INIT_STATE",
    "createDefaultWorkspaceState",
    "getDefaultWorkspaceState",
  ]);
  assert.deepEqual(types.DEFAULT_TASK_RUNTIME_STATE, {
    status: "notReady",
    error: null,
    provider: undefined,
    contextWindow: null,
    usage: null,
    apiRetry: null,
    backgroundTaskControls: [],
    activeTurnKind: undefined,
    activeInputId: undefined,
    activeInputOwnerClientId: undefined,
  });
  assert.deepEqual(types.DEFAULT_TASK_UI_STATE, {
    permissionRequest: null,
    pendingPermissionRequests: [],
    elicitationRequest: null,
    pendingElicitationRequests: [],
    elicitationFormDraftsByRequestId: {},
    error: null,
  });
  assert.deepEqual(types.DEFAULT_WORKSPACE_INIT_STATE, {
    status: "idle",
    error: null,
    attempts: 0,
  });
  assert.equal(types.getDefaultWorkspaceState(), types.getDefaultWorkspaceState());
});

test("B4 defaults: full workspace shape, field order and fresh mutable collections", () => {
  const a = workspace(),
    b = workspace();
  assert.deepEqual(a, {
    activeTaskId: null,
    workspaceInit: { status: "idle", error: null, attempts: 0 },
    draftRuntime: { status: "idle", error: null },
    draftSessionId: null,
    draftRuntimeInvalidationVersion: 0,
    composerTextInsertVersion: 0,
    composerTextInsertRequest: null,
    timelineBottomRequestVersion: 0,
    timelineBottomRequest: null,
    draftError: null,
    modelSwitchRequestId: null,
    modelSwitchPending: false,
    modelSwitchStage: "idle",
    taskRuntimeByTaskId: {},
    taskUiByTaskId: {},
    taskConfigOptionsByTaskId: {},
    taskConfigOptionsStatusByTaskId: {},
    taskUnreadByTaskId: {},
    optimisticTaskListByTaskId: {},
    groupedDraftTask: null,
    draftCreateSource: "session",
    promotedGroupedDraftTaskByTaskId: {},
    selectedProvider: "knorvia",
    selectedSupplierKey: "native:knorvia",
    isGhostSupplier: false,
    supplierMismatchReason: null,
    configOptions: null,
    configOptionsStatus: "idle",
    slashCommands: [],
    taskListVersion: 0,
    taskListCache: null,
    draftFocusVersion: 0,
  });
  assert.deepEqual(Object.keys(a), [
    "activeTaskId",
    "workspaceInit",
    "draftRuntime",
    "draftSessionId",
    "draftRuntimeInvalidationVersion",
    "composerTextInsertVersion",
    "composerTextInsertRequest",
    "timelineBottomRequestVersion",
    "timelineBottomRequest",
    "draftError",
    "modelSwitchRequestId",
    "modelSwitchPending",
    "modelSwitchStage",
    "taskRuntimeByTaskId",
    "taskUiByTaskId",
    "taskConfigOptionsByTaskId",
    "taskConfigOptionsStatusByTaskId",
    "taskUnreadByTaskId",
    "optimisticTaskListByTaskId",
    "groupedDraftTask",
    "draftCreateSource",
    "promotedGroupedDraftTaskByTaskId",
    "selectedProvider",
    "selectedSupplierKey",
    "isGhostSupplier",
    "supplierMismatchReason",
    "configOptions",
    "configOptionsStatus",
    "slashCommands",
    "taskListVersion",
    "taskListCache",
    "draftFocusVersion",
  ]);
  assert.deepEqual(Object.keys(a), Object.keys(b));
  for (const key of [
    "workspaceInit",
    "draftRuntime",
    "taskRuntimeByTaskId",
    "taskUiByTaskId",
    "taskConfigOptionsByTaskId",
    "taskConfigOptionsStatusByTaskId",
    "taskUnreadByTaskId",
    "optimisticTaskListByTaskId",
    "promotedGroupedDraftTaskByTaskId",
    "slashCommands",
  ] as const) {
    assert.notEqual(a[key], b[key]);
  }
  assert.notEqual(a.workspaceInit, types.DEFAULT_WORKSPACE_INIT_STATE);
  assert.equal(Object.isFrozen(a), false);
  assert.equal(Object.isFrozen(a.taskUiByTaskId), false);
});

for (const [path, identity, expected] of [
  ["/same", undefined, "/same"],
  ["/same", null, "/same"],
  ["/same", "", "/same"],
  ["/same", " \t ", "/same"],
  [" /raw/../a%20b ", " remote:exact ", "remote:exact"],
  [String.raw`C:\fixture\a%20b`, " identity ", "identity"],
  ["/same", " /same ", "/same"],
] as const) {
  test(`B4 key: raw path and nullish/trimmed identity ${String(identity)}`, () => {
    assert.equal(s.resolveWorkspaceStateKey(path, value(identity)), expected);
  });
}

test("B4 read: stable empty fallback, identity priority and inherited buckets", () => {
  const local = workspace(),
    remote = workspace(),
    inherited = workspace();
  const buckets = Object.assign(Object.create({ inherited }), { "/same": local, remote });
  const input = state(buckets);
  assert.equal(s.getWorkspaceState(input, "/empty"), types.getDefaultWorkspaceState());
  assert.equal(s.getWorkspaceState(input, "/same", " missing "), local);
  assert.equal(s.getWorkspaceState(input, "/same", " remote "), remote);
  assert.equal(s.selectWorkspaceKnorviaState(input, "/same", "remote"), remote);
  assert.equal(s.getWorkspaceState(input, "inherited"), inherited);
  for (const missing of [undefined, null, false, 0, ""]) {
    buckets.remote = value(missing);
    assert.equal(s.getWorkspaceState(input, "/same", "remote"), local);
  }
});

test("B4 update: one updater, no-op references and single-key immutable patch", () => {
  const local = workspace(),
    other = workspace();
  const buckets = { "/same": local, other };
  const input = state(buckets);
  let calls = 0;
  const noOp = s.updateWorkspaceState(input, "/same", (current) => {
    calls++;
    assert.equal(current, local);
    return current;
  });
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(noOp), ["workspaces"]);
  assert.equal(noOp.workspaces, buckets);
  const next = { ...local, activeTaskId: "selected" };
  const patch = s.updateWorkspaceState(freeze(input), "/same", () => next);
  assert.notEqual(patch.workspaces, buckets);
  assert.equal(patch.workspaces["/same"], next);
  assert.equal(patch.workspaces.other, other);
  assert.equal(input.workspaces["/same"], local);
});

test("B4 identity: no-op seed stays unwritten; existing bucket never merges path", () => {
  const local = workspace(),
    remote = workspace();
  local.activeTaskId = "path-only";
  const input = state({ "/same": local });
  let seen: ReturnType<typeof workspace> | undefined;
  const patch = s.updateWorkspaceState(
    input,
    "/same",
    (current) => {
      seen = current;
      return current;
    },
    "remote",
  );
  assert.notEqual(seen, local);
  assert.equal(seen!.activeTaskId, null);
  assert.equal(patch.workspaces, input.workspaces);
  assert.equal(Object.hasOwn(input.workspaces, "remote"), false);
  input.workspaces.remote = remote;
  const next = { ...remote, activeTaskId: "own" };
  const updated = s.updateWorkspaceState(
    input,
    "/same",
    (current) => {
      assert.equal(current, remote);
      return next;
    },
    "remote",
  );
  assert.equal(updated.workspaces.remote, next);
  assert.equal(updated.workspaces["/same"], local);
});

test("B4 identity: exact union migration, field/reset boundaries, order and nested identity", () => {
  const base = workspace();
  const a = task("a", " remote "),
    duplicateOtherIdentity = task("a", "other"),
    b = task("b", "remote"),
    c = task("c", "other");
  base.taskListCache = [a, duplicateOtherIdentity, c];
  base.optimisticTaskListByTaskId = { b, c };
  base.activeTaskId = "b";
  base.taskListVersion = 8;
  base.taskRuntimeByTaskId = {
    a: value({ status: "completed" }),
    b: value({ status: "error" }),
    c: value({ status: "running" }),
  };
  base.taskUiByTaskId = { a: value({ error: { marker: true } }), c: value({ error: null }) };
  base.taskConfigOptionsByTaskId = { a: [], b: [], c: [] };
  base.taskConfigOptionsStatusByTaskId = { a: "ready", b: "error", c: "loading" };
  base.taskUnreadByTaskId = { a: false, b: true, c: true };
  base.configOptions = [];
  base.configOptionsStatus = "ready";
  base.slashCommands = [];
  base.selectedSupplierKey = "custom:fixture";
  base.isGhostSupplier = true;
  base.draftSessionId = "do-not-copy";
  base.draftRuntime.status = "running";
  base.draftFocusVersion = 42;
  Object.assign(base, { unknown: { private: true } });
  const input = freeze(state({ "/same": base }));
  const patch = s.updateWorkspaceState(input, "/same", (current) => ({ ...current }), " remote ");
  const seed = patch.workspaces.remote!;
  assert.deepEqual(Object.keys(seed), Object.keys(workspace()));
  assert.deepEqual(seed.taskListCache, [a, duplicateOtherIdentity]);
  assert.notEqual(seed.taskListCache, base.taskListCache);
  assert.equal(seed.taskListCache![0], a);
  assert.equal(seed.activeTaskId, "b");
  assert.equal(seed.taskListVersion, 8);
  for (const key of ["configOptions", "slashCommands"] as const) assert.equal(seed[key], base[key]);
  assert.equal(seed.selectedSupplierKey, "custom:fixture");
  assert.equal(seed.isGhostSupplier, true);
  for (const key of [
    "taskRuntimeByTaskId",
    "taskUiByTaskId",
    "taskConfigOptionsByTaskId",
    "taskConfigOptionsStatusByTaskId",
    "taskUnreadByTaskId",
    "optimisticTaskListByTaskId",
  ] as const) {
    assert.notEqual(seed[key], base[key]);
    assert.equal(Object.hasOwn(seed[key], "c"), false);
  }
  assert.equal(seed.taskRuntimeByTaskId.a, base.taskRuntimeByTaskId.a);
  assert.equal(seed.taskConfigOptionsByTaskId.a, base.taskConfigOptionsByTaskId.a);
  assert.equal(seed.optimisticTaskListByTaskId.b, b);
  assert.equal(seed.draftSessionId, null);
  assert.equal(seed.draftRuntime.status, "idle");
  assert.equal(seed.draftFocusVersion, 0);
  assert.equal(Object.hasOwn(seed, "unknown"), false);
  assert.equal(patch.workspaces["/same"], base);
});

for (const cache of [null, []] as const) {
  test(`B4 identity: empty cache shape with optimistic union ${cache === null ? "null" : "array"}`, () => {
    const base = workspace();
    base.taskListCache = value(cache);
    base.optimisticTaskListByTaskId = { a: task("a", "remote") };
    const seed = s.updateWorkspaceState(
      state({ p: base }),
      "p",
      (current) => ({ ...current }),
      "remote",
    ).workspaces.remote!;
    assert.deepEqual(seed.taskListCache, cache);
    if (cache !== null) assert.notEqual(seed.taskListCache, cache);
  });
}

test("B4 identity: zero matching tasks resets task state and keeps selected presentation", () => {
  const base = workspace();
  base.taskListCache = [];
  base.taskListVersion = 9;
  base.activeTaskId = "x";
  base.taskRuntimeByTaskId.x = value({ status: "error" });
  base.configOptions = [];
  const seed = s.updateWorkspaceState(
    state({ p: base }),
    "p",
    (current) => ({ ...current }),
    "remote",
  ).workspaces.remote!;
  assert.equal(seed.taskListCache, null);
  assert.equal(seed.taskListVersion, 0);
  assert.equal(seed.activeTaskId, null);
  assert.deepEqual(seed.taskRuntimeByTaskId, {});
  assert.equal(seed.configOptions, base.configOptions);
});

test("B4 identity: own enumerable record keys, symbols and __proto__ data keys", () => {
  const base = workspace();
  const t = task("__proto__", "remote");
  base.taskListCache = [t];
  base.activeTaskId = "__proto__";
  const runtime = value({ status: "completed" });
  base.taskRuntimeByTaskId = Object.create({ inherited: runtime });
  Object.defineProperty(base.taskRuntimeByTaskId, "__proto__", {
    value: runtime,
    enumerable: true,
  });
  Object.assign(base.taskRuntimeByTaskId, { [Symbol("not-migrated")]: runtime });
  const seed = s.updateWorkspaceState(
    state({ p: base }),
    "p",
    (current) => ({ ...current }),
    "remote",
  ).workspaces.remote!;
  assert.equal(Object.hasOwn(seed.taskRuntimeByTaskId, "__proto__"), true);
  assert.equal(seed.taskRuntimeByTaskId.__proto__, runtime);
  assert.equal(Object.getPrototypeOf(seed.taskRuntimeByTaskId), Object.prototype);
  assert.deepEqual(Reflect.ownKeys(seed.taskRuntimeByTaskId), ["__proto__"]);
});

test("B4 update: missing path creates fresh seed, raw updater return is not validated", () => {
  const input = state({});
  const a = s.updateWorkspaceState(input, "p", (current) => ({ ...current }), "remote").workspaces
    .remote!;
  const b = s.updateWorkspaceState(input, "p", (current) => ({ ...current }), "remote").workspaces
    .remote!;
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  assert.notEqual(a, types.getDefaultWorkspaceState());
  assert.equal(s.updateWorkspaceState(input, "p", () => value(null)).workspaces.p, null);
});

for (const status of ["notReady", "idle", "running", "completed", "error", "waiting", "unknown"]) {
  test(`B4 display: task/draft status and empty error are preserved ${status}`, () => {
    const w = workspace();
    w.draftRuntime = value({ status, error: "" });
    assert.deepEqual(s.getWorkspaceDisplayedTaskState(w), { taskStatus: status, taskError: "" });
    w.activeTaskId = "a";
    const runtime = value<typeof types.DEFAULT_TASK_RUNTIME_STATE>({ status, error: null });
    w.taskRuntimeByTaskId.a = runtime;
    assert.equal(s.getTaskRuntimeState(w, "a"), runtime);
    assert.deepEqual(s.getWorkspaceDisplayedTaskState(w), { taskStatus: status, taskError: null });
  });
}

test("B4 accessors: singleton nullish fallbacks and existing UI/init references", () => {
  const w = workspace();
  assert.equal(s.getTaskRuntimeState(w, "missing"), types.DEFAULT_TASK_RUNTIME_STATE);
  assert.equal(s.getTaskUiState(w, "missing"), types.DEFAULT_TASK_UI_STATE);
  assert.equal(s.getWorkspaceInitState(w), w.workspaceInit);
  assert.equal(
    s.getWorkspaceInitState(value({ workspaceInit: null })),
    types.DEFAULT_WORKSPACE_INIT_STATE,
  );
  for (const x of [false, 0, ""]) {
    w.taskRuntimeByTaskId.a = value(x);
    w.taskUiByTaskId.a = value(x);
    assert.equal(s.getTaskRuntimeState(w, "a"), x);
    assert.equal(s.getTaskUiState(w, "a"), x);
  }
});

test("B4 metadata: null/partial inputs, first cache match and direct reference fast paths", () => {
  const a = task("a"),
    later = task("a"),
    b = task("b");
  later.title = "Last duplicate";
  assert.equal(s.getTaskMeta({}, "a"), null);
  assert.deepEqual(s.getVisibleTaskMetas({}), []);
  assert.equal(s.getTaskMeta({ taskListCache: [a, later] }, "a"), a);
  assert.equal(s.getTaskMeta({ optimisticTaskListByTaskId: { b } }, "b"), b);
  assert.equal(
    s.getTaskMeta({ taskListCache: [a], optimisticTaskListByTaskId: { a: value(false) } }, "a"),
    a,
  );
});

test("B4 metadata: existing merge owner controls title, terminal state, undefined unread and nested identity", () => {
  const a = task("a"),
    optimistic = {
      ...a,
      title: "Manual",
      titleOverridden: true,
      status: "completed" as const,
      updatedAt: 5,
      unreadAt: undefined,
    };
  a.title = "New session";
  a.unreadAt = 10;
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  Object.assign(optimistic, { unknown: cycle });
  const input = freeze({ taskListCache: [a], optimisticTaskListByTaskId: { a: optimistic } });
  const result = s.getTaskMeta(input, "a")!;
  assert.notEqual(result, a);
  assert.notEqual(result, optimistic);
  assert.equal(result.title, "Manual");
  assert.equal(result.status, "completed");
  assert.equal(Object.hasOwn(result, "unreadAt"), true);
  assert.equal(result.unreadAt, undefined);
  assert.equal(value<Record<string, unknown>>(result).unknown, cycle);
});

test("B4 visible metadata: duplicate cache position, optimistic value/key mismatch and enumeration order", () => {
  const first = task("a"),
    last = task("a"),
    b = task("b"),
    c = task("c"),
    mismatch = task("z");
  last.title = "last";
  const input = freeze({
    taskListCache: [first, b, last],
    optimisticTaskListByTaskId: {
      a: { ...first, title: "overlay", updatedAt: 9 },
      "2": c,
      wrong: mismatch,
    },
  });
  const result = s.getVisibleTaskMetas(input);
  assert.deepEqual(
    result.map((x) => x.taskId),
    ["a", "b", "c", "z"],
  );
  assert.equal(result[0]!.title, "overlay");
  assert.equal(result[1], b);
  assert.equal(result[2], c);
  assert.equal(result[3], mismatch);
  assert.notEqual(s.getVisibleTaskMetas(input), result);
  assert.equal(s.getVisibleTaskMetas({ taskListCache: [first, last] })[0], last);
});

for (const unreadAt of [undefined, null, 0, NaN, -1, 9, ""] as const) {
  test(`B4 unread: stored beats fallback and strict boolean map ${String(unreadAt)}`, () => {
    const a = { ...task("a"), unreadAt: value<number | undefined>(unreadAt) };
    const input = { taskListCache: [a], taskUnreadByTaskId: {} };
    assert.equal(s.getTaskUnreadIndicator(input, "a", { unreadAt: 100 }), Boolean(unreadAt));
    assert.equal(s.getTaskUnreadIndicator(input, "missing", { unreadAt: 100 }), true);
    for (const cached of [1, "true", false, true]) {
      input.taskUnreadByTaskId = value({ a: cached });
      assert.equal(s.getTaskUnreadIndicator(input, "a"), Boolean(unreadAt) || cached === true);
    }
  });
}

test("B4 failures: public malformed structures and updater errors are not swallowed", () => {
  assert.throws(() => s.getWorkspaceState(value(null), "p"), TypeError);
  assert.throws(() => s.resolveWorkspaceStateKey("p", value(1)), TypeError);
  assert.throws(() => s.getTaskRuntimeState(value({}), "a"), TypeError);
  assert.throws(() => s.getTaskMeta({ taskListCache: value([null]) }, "a"), TypeError);
  assert.throws(() => s.getVisibleTaskMetas({ taskListCache: value([null]) }), TypeError);
  const input = state({ p: workspace() }),
    failure = new Error("updater");
  assert.throws(
    () =>
      s.updateWorkspaceState(input, "p", () => {
        throw failure;
      }),
    (error) => error === failure,
  );
  assert.equal(Object.keys(input.workspaces).length, 1);
});

test("B4 read order: base lookup precedes key resolution and identity lookup", () => {
  const events: string[] = [],
    local = workspace(),
    remote = workspace();
  const buckets = {
    get p() {
      events.push("path");
      return local;
    },
    get remote() {
      events.push("identity");
      return remote;
    },
  };
  const identity = value<string>({
    trim() {
      events.push("trim");
      return "remote";
    },
  });
  assert.equal(s.getWorkspaceState(state(buckets), "p", identity), remote);
  assert.deepEqual(events, ["path", "trim", "identity"]);
});

test("B4 identity: record getters are evaluated before filtering; zero union skips malformed task maps", () => {
  const base = workspace(),
    failure = new Error("excluded own record getter");
  base.taskRuntimeByTaskId = value(null);
  const input = state({ p: base });
  assert.doesNotThrow(() =>
    s.updateWorkspaceState(input, "p", (current) => ({ ...current }), "remote"),
  );
  base.taskListCache = [task("a", "remote")];
  base.taskRuntimeByTaskId = {
    get excluded(): never {
      throw failure;
    },
  };
  assert.throws(
    () => s.updateWorkspaceState(input, "p", (current) => ({ ...current }), "remote"),
    (error) => error === failure,
  );
});

test("B4 update: outer unknown/symbol buckets survive and updater errors never write", () => {
  const marker = Symbol("bucket"),
    buckets = Object.assign({ p: workspace() }, { [marker]: workspace() });
  const next = workspace();
  const patch = s.updateWorkspaceState(state(buckets), "p", () => next);
  assert.equal(value<Record<symbol, unknown>>(patch.workspaces)[marker], buckets[marker]);
  const failure = new Error("not committed");
  assert.throws(
    () =>
      s.updateWorkspaceState(
        state(buckets),
        "p",
        () => {
          throw failure;
        },
        "remote",
      ),
    (error) => error === failure,
  );
  assert.equal(Object.hasOwn(buckets, "remote"), false);
});
