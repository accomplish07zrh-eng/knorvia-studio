// SPDX-License-Identifier: Apache-2.0
// Pending refresh contracts; not executed or presented as hook/mutation acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { GroupedTaskViewRefreshOwner } from "../src/workspace-grouped-tasks/groupedRefreshOwner.js";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function job(load: () => Promise<string>, hasNodes = false, isCurrent = true) {
  const journal: unknown[] = [];
  return {
    journal,
    options: {
      load,
      hasNodes: () => hasNodes,
      isCurrent: () => isCurrent,
      accept: (value: string) => {
        journal.push(["accepted", value]);
      },
      setLoading: (value: boolean) => {
        journal.push(["loading", value]);
      },
      initialize: () => {
        journal.push("initialized");
      },
      onError: (error: unknown) => {
        journal.push(["error", error]);
      },
    },
  };
}

test("only the latest refresh can accept, log or close first-screen loading", async () => {
  const owner = new GroupedTaskViewRefreshOwner(),
    deactivate = owner.activate();
  const old = deferred<string>(),
    current = deferred<string>();
  const first = job(() => old.promise),
    second = job(() => current.promise);
  const firstRun = owner.run(first.options),
    secondRun = owner.run(second.options);
  old.reject(new Error("superseded failure"));
  await firstRun;
  assert.deepEqual(first.journal, [["loading", true]]);
  current.resolve("current-view");
  await secondRun;
  assert.deepEqual(second.journal, [
    ["loading", true],
    ["accepted", "current-view"],
    ["loading", false],
    "initialized",
  ]);
  deactivate();
});

test("shared load failure is logged once and initialization ends even without nodes", async () => {
  const owner = new GroupedTaskViewRefreshOwner(),
    deactivate = owner.activate();
  const shared = deferred<string>(),
    failure = new Error("RPC failure");
  const first = job(() => shared.promise),
    second = job(() => shared.promise);
  const runs = [owner.run(first.options), owner.run(second.options)];
  shared.reject(failure);
  await Promise.all(runs);
  assert.deepEqual(first.journal, [["loading", true]]);
  assert.deepEqual(second.journal, [
    ["loading", true],
    ["error", failure],
    ["loading", false],
    "initialized",
  ]);
  deactivate();
});

test("an existing list suppresses loading=true and a cache-rejected value never replaces it", async () => {
  const owner = new GroupedTaskViewRefreshOwner(),
    deactivate = owner.activate();
  const pending = job(async () => "cache-invalidated", true, false);
  await owner.run(pending.options);
  assert.deepEqual(pending.journal, [["loading", false], "initialized"]);
  deactivate();
});

test("scope cleanup revokes old publication and cannot deactivate a replayed scope", async () => {
  const owner = new GroupedTaskViewRefreshOwner(),
    deactivateOld = owner.activate();
  const pending = deferred<string>(),
    old = job(() => pending.promise);
  const oldRun = owner.run(old.options);
  deactivateOld();
  const deactivateNew = owner.activate();
  deactivateOld();
  const current = job(async () => "replayed");
  await owner.run(current.options);
  pending.resolve("late-old");
  await oldRun;
  assert.deepEqual(old.journal, [["loading", true]]);
  assert.equal(
    current.journal.some((entry) => Array.isArray(entry) && entry[0] === "accepted"),
    true,
  );
  deactivateNew();
});

test("inactive run sends no load, and accept/build errors retain the original failure path", async () => {
  const owner = new GroupedTaskViewRefreshOwner();
  let loads = 0;
  const dormant = job(async () => {
    loads += 1;
    return "unmounted";
  });
  await owner.run(dormant.options);
  assert.equal(loads, 0);
  assert.deepEqual(dormant.journal, []);
  const deactivate = owner.activate(),
    active = job(async () => "accepted-data");
  const failure = new Error("join failure");
  active.options.accept = () => {
    throw failure;
  };
  await owner.run(active.options);
  assert.deepEqual(active.journal, [
    ["loading", true],
    ["error", failure],
    ["loading", false],
    "initialized",
  ]);
  deactivate();
});

test("the response boundary rechecks a drag publication permission revoked during a load", async () => {
  const owner = new GroupedTaskViewRefreshOwner(),
    deactivate = owner.activate();
  const reply = deferred<string>(),
    pending = job(() => reply.promise);
  let canPublish = true;
  pending.options.isCurrent = () => canPublish;
  const run = owner.run(pending.options);
  canPublish = false;
  reply.resolve("order accepted before the next gesture");
  await run;
  assert.deepEqual(pending.journal, [["loading", true], ["loading", false], "initialized"]);
  deactivate();
});
