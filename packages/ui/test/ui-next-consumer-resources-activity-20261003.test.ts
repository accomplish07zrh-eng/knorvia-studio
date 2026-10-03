// SPDX-License-Identifier: Apache-2.0
// Pending resource/metadata boundary contracts; not executed.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EditorInfo, KnorviaTaskMeta } from "@knorvia/shared";
import {
  observeFileTreeDragEnd,
  InstalledFileTreeEditorRequests,
} from "../src/workspace-file-tree/fileTreeConsumerResources.js";
import {
  attachTaskListRowActivity,
  getTaskListRowActivity,
  getTaskListAttention,
  isTaskListRowActive,
  mergeTaskListMembershipFields,
} from "../src/v4/taskListRowActivity.js";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const flush = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(() => queueMicrotask(resolve));
  });

test("a true-interval drag lease resets on each terminal signal and never writes after cleanup", () => {
  const callbacks = new Map<string, () => void>(),
    removed: string[] = [];
  const target = {
    addEventListener: (type: string, callback: () => void) => {
      callbacks.set(type, callback);
    },
    removeEventListener: (type: string) => {
      removed.push(type);
    },
  } as unknown as Window;
  let resets = 0;
  const cleanup = observeFileTreeDragEnd(target, () => {
    resets += 1;
  });
  for (const type of ["dragend", "drop", "blur"]) callbacks.get(type)!();
  assert.equal(resets, 3);
  cleanup();
  assert.deepEqual(removed, ["dragend", "drop", "blur"]);
  callbacks.get("drop")!();
  cleanup();
  assert.equal(resets, 3);
  assert.equal(removed.length, 3);
});

test("partial drag listener setup and teardown failures attempt remaining cleanup and keep original errors", () => {
  const journal: string[] = [],
    installError = new Error("install failed"),
    removalError = new Error("remove failed");
  const target = {
    addEventListener: (type: string) => {
      journal.push(`add:${type}`);
      if (type === "drop") throw installError;
    },
    removeEventListener: (type: string) => {
      journal.push(`remove:${type}`);
      if (type === "dragend") throw removalError;
    },
  } as unknown as Window;
  assert.throws(
    () => observeFileTreeDragEnd(target, () => {}),
    (error) => error === installError,
  );
  assert.deepEqual(journal, ["add:dragend", "add:drop", "remove:dragend", "remove:drop"]);
});

test("editor request replacement keeps existing state, accepts only current success and retains old failure diagnosis", async () => {
  const accepted: EditorInfo[][] = [],
    failures: unknown[] = [];
  const requests = new InstalledFileTreeEditorRequests({
    accept: (items) => {
      accepted.push(items);
    },
    failed: (error) => {
      failures.push(error);
    },
  });
  const old = deferred<EditorInfo[]>(),
    current = deferred<EditorInfo[]>();
  const stopOld = requests.begin({ getInstalledEditors: () => old.promise });
  const stopCurrent = requests.begin({ getInstalledEditors: () => current.promise });
  stopOld();
  current.resolve([]);
  await flush();
  assert.equal(accepted.length, 1);
  const failure = new Error("old platform rejected");
  old.reject(failure);
  await flush();
  assert.deepEqual(failures, [failure]);
  stopCurrent();
  const late = deferred<EditorInfo[]>(),
    stopLate = requests.begin({ getInstalledEditors: () => late.promise });
  stopLate();
  late.resolve([]);
  await flush();
  assert.equal(accepted.length, 1);
});

const task = (): KnorviaTaskMeta => ({
  taskId: "task-fixture",
  traceId: "trace-fixture",
  title: "old",
  mode: "build",
  workspacePath: "/fixture",
  createdAt: 1,
  updatedAt: 2,
});

test("sidecar owns active phase/background and attention priority without persisting task status", () => {
  const original = task(),
    activity = { phase: "completedSuccess" as const, lastActivityAt: 99, hasBackgroundWork: true };
  const row = attachTaskListRowActivity(original, activity);
  assert.equal(getTaskListRowActivity(row), activity);
  assert.equal(getTaskListRowActivity(original), null);
  assert.equal(isTaskListRowActive(row), true);
  assert.equal(isTaskListRowActive({ ...original, status: "running" }), false);
  assert.deepEqual(
    getTaskListAttention(
      attachTaskListRowActivity(original, {
        ...activity,
        pendingInteractions: { permissionCount: 2, userInputCount: 1 },
      }),
    ),
    { kind: "userInput", count: 3 },
  );
  assert.equal(
    getTaskListAttention(
      attachTaskListRowActivity(original, {
        ...activity,
        pendingInteractions: { permissionCount: 0, userInputCount: 0 },
      }),
    ),
    null,
  );
});

test("membership fields preserve activity identity/time/status and explicit undefined unread ownership", () => {
  const activity = { phase: "running" as const, lastActivityAt: 88, hasBackgroundWork: false };
  const original = attachTaskListRowActivity(
    { ...task(), status: "running" as const, unreadAt: 5 },
    activity,
  );
  const membership = {
    ...task(),
    title: "renamed",
    createdAt: 10,
    updatedAt: 20,
    unreadAt: undefined,
  };
  const merged = mergeTaskListMembershipFields(original, membership);
  assert.equal(merged.title, "renamed");
  assert.equal(merged.createdAt, 1);
  assert.equal(merged.updatedAt, 88);
  assert.equal(merged.status, "running");
  assert.equal(merged.unreadAt, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(merged, "unreadAt"), true);
  assert.equal(getTaskListRowActivity(merged), activity);
  const withoutUnread = task();
  assert.equal(mergeTaskListMembershipFields(original, withoutUnread).unreadAt, 5);
  assert.equal(mergeTaskListMembershipFields(task(), membership), membership);
});
