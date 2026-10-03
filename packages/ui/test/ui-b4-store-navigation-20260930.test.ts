// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { TaskNavigationHistory, WorkspaceNavEntry } from "../src/lib/taskNavigationHistory.js";
import { pushNavEntry } from "../src/lib/taskNavigationHistory.js";
import { state, storeUrl, value } from "./ui-b4-store-fixtures-20260930.js";

const { createNavigationSlice }: typeof import("../src/store/sessionStoreNavigation.js") =
  await import(storeUrl("sessionStoreNavigation"));

function ports() {
  let current = {
    ...state({}),
    taskNavHistory: { entries: [], cursor: -1 } as TaskNavigationHistory,
  };
  const events: unknown[] = [];
  const pending: Array<(state: typeof current) => Partial<typeof current>> = [];
  const slice = createNavigationSlice(
    (partial) => {
      events.push(typeof partial === "function" ? "set:function" : "set:object");
      if (typeof partial === "function") pending.push(partial);
      else current = { ...current, ...partial };
    },
    () => {
      events.push("get");
      return current;
    },
  );
  current = { ...current, ...slice };
  return {
    slice,
    events,
    pending,
    current: () => current,
    replace(history: TaskNavigationHistory) {
      current = { ...current, taskNavHistory: history };
    },
    flush() {
      const callback = pending.shift()!;
      const patch = callback(current);
      assert.deepEqual(Object.keys(patch), ["taskNavHistory"]);
      current = { ...current, ...patch };
      return patch;
    },
  };
}

test("B4 navigation: fixed action key order and independent factory state", () => {
  const a = ports(),
    b = ports();
  assert.deepEqual(Object.keys(a.slice), [
    "taskNavHistory",
    "taskNavPushAutomations",
    "taskNavPushPluginStore",
    "taskNavGoBack",
    "taskNavGoForward",
    "removeTaskFromNavHistory",
  ]);
  assert.deepEqual(a.slice.taskNavHistory, { entries: [], cursor: -1 });
  assert.notEqual(a.slice.taskNavHistory, b.slice.taskNavHistory);
  assert.notEqual(a.slice.taskNavHistory.entries, b.slice.taskNavHistory.entries);
  assert.notEqual(a.slice.taskNavGoBack, b.slice.taskNavGoBack);
});

test("B4 navigation: pushes defer history lookup and preserve raw optional data", () => {
  const p = ports();
  assert.equal(
    p.slice.taskNavPushAutomations(" /raw/../path ", " identity ", "automation", "workflow"),
    undefined,
  );
  assert.deepEqual(p.events, ["set:function"]);
  p.replace(pushNavEntry(p.current().taskNavHistory, "/other", "A"));
  p.flush();
  assert.deepEqual(p.current().taskNavHistory.entries, [
    { kind: "task", workspacePath: "/other", taskId: "A" },
    {
      kind: "automations",
      workspacePath: " /raw/../path ",
      workspaceIdentity: " identity ",
      automationId: "automation",
      automationTab: "workflow",
    },
  ]);
  p.slice.taskNavPushPluginStore(String.raw`C:\fixture\a%20b`, "");
  p.flush();
  assert.deepEqual(p.current().taskNavHistory.entries[2], {
    kind: "plugin-store",
    workspacePath: String.raw`C:\fixture\a%20b`,
  });
  p.slice.taskNavPushAutomations("/empty", undefined, "", value(""));
  p.flush();
  assert.deepEqual(p.current().taskNavHistory.entries[3], {
    kind: "automations",
    workspacePath: "/empty",
  });
});

test("B4 navigation: duplicate pushes still enqueue one update with original history identity", () => {
  const p = ports();
  p.slice.taskNavPushPluginStore("p", "remote");
  p.flush();
  const original = p.current().taskNavHistory;
  p.events.length = 0;
  p.slice.taskNavPushPluginStore("p", "remote");
  assert.deepEqual(p.events, ["set:function"]);
  assert.equal(p.flush().taskNavHistory, original);
});

test("B4 navigation: boundary movement gets once, returns null and never writes", () => {
  const p = ports();
  assert.equal(p.slice.taskNavGoBack(), null);
  assert.equal(p.slice.taskNavGoForward(), null);
  assert.deepEqual(p.events, ["get", "get"]);
  assert.equal(p.pending.length, 0);
});

test("B4 navigation: successful movement sets before returning original entry/entries references", () => {
  const p = ports();
  let history = pushNavEntry(p.current().taskNavHistory, "p", "A", "remote");
  history = pushNavEntry(history, "p", "B", "remote");
  p.replace(history);
  const entries = history.entries;
  assert.equal(p.slice.taskNavGoBack(), entries[0]);
  assert.deepEqual(p.events, ["get", "set:object"]);
  assert.equal(p.current().taskNavHistory.entries, entries);
  assert.equal(p.current().taskNavHistory.cursor, 0);
  p.events.length = 0;
  assert.equal(p.slice.taskNavGoForward(), entries[1]);
  assert.deepEqual(p.events, ["get", "set:object"]);
  assert.equal(p.current().taskNavHistory.cursor, 1);
});

test("B4 navigation: forward history is truncated and owner keeps its 50-entry bound", () => {
  const p = ports();
  for (let i = 0; i < 60; i++) {
    p.slice.taskNavPushPluginStore(`p${i}`);
    p.flush();
  }
  assert.equal(p.current().taskNavHistory.entries.length, 50);
  assert.equal(p.current().taskNavHistory.entries[0]!.workspacePath, "p10");
  p.slice.taskNavGoBack();
  p.slice.taskNavPushAutomations("new");
  p.flush();
  assert.equal(p.current().taskNavHistory.entries.length, 50);
  assert.equal(
    p.current().taskNavHistory.entries.some((x) => x.workspacePath === "p59"),
    false,
  );
});

test("B4 navigation: remove defers to current history, keeps non-task entries and current deletion fallback", () => {
  const p = ports();
  const taskA: WorkspaceNavEntry = { kind: "task", workspacePath: "p", taskId: "A" };
  const plugin: WorkspaceNavEntry = { kind: "plugin-store", workspacePath: "p" };
  const taskB: WorkspaceNavEntry = { kind: "task", workspacePath: "p", taskId: "B" };
  p.slice.removeTaskFromNavHistory("A");
  p.replace({ entries: [taskA, plugin, taskA, taskB], cursor: 2 });
  p.flush();
  assert.deepEqual(p.current().taskNavHistory.entries, [plugin, taskB]);
  assert.equal(p.current().taskNavHistory.entries[0], plugin);
  assert.equal(p.current().taskNavHistory.cursor, 1);
  const original = p.current().taskNavHistory;
  p.slice.removeTaskFromNavHistory("missing");
  assert.equal(p.flush().taskNavHistory, original);
});

test("B4 navigation: deleting the sole task empties history; holes do not invent a target", () => {
  const p = ports();
  p.replace({ entries: [{ kind: "task", workspacePath: "p", taskId: "A" }], cursor: 0 });
  p.slice.removeTaskFromNavHistory("A");
  p.flush();
  assert.deepEqual(p.current().taskNavHistory, { entries: [], cursor: -1 });
  p.replace({
    entries: value([undefined, { kind: "plugin-store", workspacePath: "p" }]),
    cursor: 1,
  });
  p.events.length = 0;
  assert.equal(p.slice.taskNavGoBack(), null);
  assert.deepEqual(p.events, ["get"]);
});

test("B4 navigation: get/set/helper failures propagate with original call order", () => {
  const failure = new Error("port failure"),
    events: string[] = [];
  const failedGet = createNavigationSlice(
    () => {
      events.push("set");
    },
    () => {
      events.push("get");
      throw failure;
    },
  );
  assert.throws(
    () => failedGet.taskNavGoBack(),
    (error) => error === failure,
  );
  assert.deepEqual(events, ["get"]);
  const ready = {
    ...state({}),
    taskNavHistory: {
      entries: [
        { kind: "plugin-store", workspacePath: "p" },
        { kind: "plugin-store", workspacePath: "q" },
      ],
      cursor: 1,
    },
  };
  const failedSet = createNavigationSlice(
    () => {
      events.push("set");
      throw failure;
    },
    () => {
      events.push("get");
      return value(ready);
    },
  );
  events.length = 0;
  assert.throws(
    () => failedSet.taskNavGoBack(),
    (error) => error === failure,
  );
  assert.deepEqual(events, ["get", "set"]);
  assert.throws(
    () => failedSet.taskNavPushPluginStore("p"),
    (error) => error === failure,
  );
  const malformed = ports();
  malformed.replace(value(null));
  assert.throws(() => malformed.slice.taskNavGoForward(), TypeError);
  malformed.slice.removeTaskFromNavHistory("A");
  assert.throws(() => malformed.flush(), TypeError);
});
