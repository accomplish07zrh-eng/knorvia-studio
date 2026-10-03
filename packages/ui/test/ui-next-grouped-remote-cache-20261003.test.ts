// SPDX-License-Identifier: Apache-2.0
// Pending cache contracts; no execution or React/mutation acceptance claim.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GroupedRemoteDataSingleFlight,
  GroupedViewCarryCache,
} from "../src/workspace-grouped-tasks/groupedRemoteDataCache.js";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test("same-key requests share the exact Promise and start the fetch only in a microtask", async () => {
  const cache = new GroupedRemoteDataSingleFlight<object>(),
    pending = deferred<object>();
  let fetches = 0;
  const first = cache.load("key", () => {
    fetches += 1;
    return pending.promise;
  });
  const shared = cache.load("key", () => {
    throw new Error("must not fetch twice");
  });
  assert.equal(first, shared);
  assert.equal(fetches, 0);
  await Promise.resolve();
  assert.equal(fetches, 1);
  const value = {};
  pending.resolve(value);
  assert.equal(await first, value);
  assert.equal(cache.isCurrent("key", value), true);
  assert.equal(
    await cache.load("key", () => {
      throw new Error("completed hit");
    }),
    value,
  );
});

test("a newer other key prevents an older completion from replacing the single accepted value", async () => {
  const cache = new GroupedRemoteDataSingleFlight<object>(),
    a = deferred<object>(),
    b = deferred<object>();
  const first = cache.load("a", () => a.promise),
    second = cache.load("b", () => b.promise);
  const aValue = {},
    bValue = {};
  b.resolve(bValue);
  await second;
  a.resolve(aValue);
  await first;
  assert.equal(cache.isCurrent("a", aValue), false);
  assert.equal(cache.isCurrent("b", bValue), true);
});

test("sharing an earlier pending key makes that reservation the newest demand", async () => {
  const cache = new GroupedRemoteDataSingleFlight<object>(),
    a = deferred<object>(),
    b = deferred<object>();
  const first = cache.load("a", () => a.promise),
    second = cache.load("b", () => b.promise);
  assert.equal(
    cache.load("a", () => {
      throw new Error("shared");
    }),
    first,
  );
  const aValue = {},
    bValue = {};
  b.resolve(bValue);
  await second;
  a.resolve(aValue);
  await first;
  assert.equal(cache.isCurrent("a", aValue), true);
  assert.equal(cache.isCurrent("b", bValue), false);
});

test("even a completed cache hit supersedes another key's in-flight demand", async () => {
  const cache = new GroupedRemoteDataSingleFlight<object>(),
    accepted = {};
  await cache.load("a", async () => accepted);
  const b = deferred<object>(),
    pending = cache.load("b", () => b.promise);
  assert.equal(
    await cache.load("a", () => {
      throw new Error("cached");
    }),
    accepted,
  );
  const bValue = {};
  b.resolve(bValue);
  await pending;
  assert.equal(cache.isCurrent("a", accepted), true);
  assert.equal(cache.isCurrent("b", bValue), false);
});

test("invalidated replies still resolve for callers without refilling or deleting a new reservation", async () => {
  const cache = new GroupedRemoteDataSingleFlight<object>(),
    old = deferred<object>(),
    current = deferred<object>();
  const stale = cache.load("key", () => old.promise);
  cache.invalidate();
  const pending = cache.load("key", () => current.promise);
  const oldValue = {},
    currentValue = {};
  old.resolve(oldValue);
  assert.equal(await stale, oldValue);
  assert.equal(cache.isCurrent("key", oldValue), false);
  assert.equal(
    cache.load("key", () => {
      throw new Error("new reservation retained");
    }),
    pending,
  );
  current.resolve(currentValue);
  await pending;
  assert.equal(cache.isCurrent("key", currentValue), true);
});

test("a synchronous loader failure rejects the shared Promise and permits a retry", async () => {
  const cache = new GroupedRemoteDataSingleFlight<object>(),
    failure = new Error("sync fetch");
  const failed = cache.load("key", () => {
    throw failure;
  });
  assert.equal(
    cache.load("key", async () => ({})),
    failed,
  );
  await assert.rejects(failed, (error) => error === failure);
  const recovered = {};
  assert.equal(await cache.load("key", async () => recovered), recovered);
});

test("carry cache evicts on writes, never refreshes order on reads, and preserves view references", () => {
  const cache = new GroupedViewCarryCache(2),
    a = { nodes: [] },
    b = { nodes: [] },
    c = { nodes: [] };
  cache.write("a", a);
  cache.write("b", b);
  assert.equal(cache.read("a"), a);
  cache.write("c", c);
  assert.equal(cache.read("a"), undefined);
  cache.write("b", b);
  cache.write("a", a);
  assert.equal(cache.read("c"), undefined);
  assert.equal(cache.read("b"), b);
  assert.equal(cache.read("a"), a);
});
