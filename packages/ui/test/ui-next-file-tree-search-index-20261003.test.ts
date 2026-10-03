// SPDX-License-Identifier: Apache-2.0
// Pending request/state contracts; React scope and worker consumers still need final validation.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyWorkspaceFileSearchIndex,
  reduceWorkspaceFileSearchIndex,
  WorkspaceFileSearchIndexRequests,
  type WorkspaceFileSearchIndexAction,
} from "../src/workspace-file-tree/searchIndexState.js";

function deferred() {
  let resolve!: (value: string) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<string>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function indexOwner() {
  let snapshot = emptyWorkspaceFileSearchIndex();
  const journal: WorkspaceFileSearchIndexAction[] = [];
  const publish = (action: WorkspaceFileSearchIndexAction) => {
    journal.push(action);
    snapshot = reduceWorkspaceFileSearchIndex(snapshot, action);
  };
  const requests = new WorkspaceFileSearchIndexRequests(publish);
  return { requests, publish, journal, snapshot: () => snapshot };
}

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("a refresh loader can check its lease before issuing subsequent packed reads", async () => {
  const index = indexOwner();
  const first = deferred();
  let guard!: () => boolean;
  let packedReads = 0;
  const cancel = index.requests.start(async (isCurrent) => {
    guard = isCurrent;
    await first.promise;
    if (!isCurrent()) return "";
    packedReads += 1;
    return "fresh-packed";
  });
  assert.equal(guard(), true);
  cancel();
  assert.equal(guard(), false);
  index.requests.start(async () => "new-scope");
  first.resolve("cache refreshed");
  await settle();
  assert.equal(packedReads, 0);
  assert.equal(index.snapshot().packed, "new-scope");
});

test("a newer request owns completion and old cleanup cannot revoke it", async () => {
  const index = indexOwner(),
    first = deferred(),
    second = deferred();
  const cancelFirst = index.requests.start(() => first.promise);
  index.requests.start(() => second.promise);
  cancelFirst();
  first.resolve("old");
  await settle();
  assert.equal(index.snapshot().packed, "");
  assert.equal(index.snapshot().loading, true);
  second.resolve("current");
  await settle();
  assert.deepEqual(index.snapshot(), {
    packed: "current",
    loading: false,
    loaded: true,
    error: null,
  });
  assert.deepEqual(
    index.journal.map((action) => action.type),
    ["start", "start", "ready", "settled"],
  );
});

test("refresh retains completed bytes and loaded status, clears errors, and surfaces the current failure", async () => {
  const index = indexOwner();
  index.requests.start(async () => "completed-index");
  await settle();
  const refresh = deferred();
  index.requests.start(() => refresh.promise);
  assert.deepEqual(index.snapshot(), {
    packed: "completed-index",
    loading: true,
    loaded: true,
    error: null,
  });
  refresh.reject("not-an-Error");
  await settle();
  assert.equal(index.snapshot().packed, "completed-index");
  assert.equal(index.snapshot().loaded, true);
  assert.equal(index.snapshot().loading, false);
  assert.equal(index.snapshot().error?.message, "not-an-Error");
  index.requests.start(async () => "recovered");
  assert.equal(index.snapshot().error, null);
  await settle();
  assert.equal(index.snapshot().packed, "recovered");
});

test("disable or scope reset invalidates acceptance while preserving the selected state transition", async () => {
  const index = indexOwner(),
    late = deferred();
  const cancel = index.requests.start(() => late.promise);
  cancel();
  index.publish({ type: "paused" });
  late.resolve("disabled-late");
  await settle();
  assert.deepEqual(index.snapshot(), emptyWorkspaceFileSearchIndex());
  const oldScope = deferred();
  index.requests.start(() => oldScope.promise);
  index.requests.invalidate();
  index.publish({ type: "reset" });
  index.requests.start(async () => "new-scope");
  oldScope.reject(new Error("old-scope-failure"));
  await settle();
  assert.equal(index.snapshot().packed, "new-scope");
  assert.equal(index.snapshot().error, null);
});

test("unmount/replay permits a new request but the cancelled reply emits no state action", async () => {
  const index = indexOwner(),
    previous = deferred();
  index.requests.start(() => previous.promise)();
  const journalLength = index.journal.length;
  previous.reject(new Error("late-after-unmount"));
  await settle();
  assert.equal(index.journal.length, journalLength);
  index.requests.start(async () => "replay");
  await settle();
  assert.equal(index.snapshot().packed, "replay");
});

test("a loader that throws synchronously settles and preserves the original Error object", async () => {
  const index = indexOwner(),
    failure = new Error("loader setup");
  index.requests.start(() => {
    throw failure;
  });
  await settle();
  assert.equal(index.snapshot().error, failure);
  assert.equal(index.snapshot().loading, false);
  assert.equal(index.snapshot().loaded, false);
});
