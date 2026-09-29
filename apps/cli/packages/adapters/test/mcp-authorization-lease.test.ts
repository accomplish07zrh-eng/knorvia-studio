// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { test } from "node:test";
import { harness, nativeLock, timeoutCode, deferred } from "./mcp-lease-provider.fixture.js";

test("lease public surface and UTF-16 filename mapping remain exact", async (t) => {
  const { lease } = await harness(t);
  assert.deepEqual(Object.keys(lease).sort(), [
    "deletePendingAuthorizationIfOwned",
    "loadPendingAuthorization",
    "publishPendingAuthorization",
    "sanitizeKeyPrefix",
    "tryAcquireAuthorizationLease",
  ]);
  assert.deepEqual(
    Object.values(lease).map((fn) => fn.length),
    [3, 2, 3, 1, 1],
  );
  for (const [raw, expected] of [
    ["mcp:oauth:ab-CD_/?中", "mcp-oauth-ab-CD----"],
    ["a💡b", "a--b"],
    ["", ""],
    ["../x", "---x"],
    ["UPPER--case", "UPPER--case"],
  ]) {
    assert.equal(lease.sanitizeKeyPrefix(raw!), expected);
  }
});
test("lease calls one lock with native path and budgets and borrows exact release", async (t) => {
  const { lease, ports, root } = await harness(t);
  const calls: unknown[][] = [];
  let releases = 0;
  const release = async () => {
    releases++;
  };
  ports.acquireFileLock = async (...args) => {
    calls.push([...args]);
    return release;
  };
  const input = {
    credentialsFilePath: join(root, "credentials.json"),
    keyPrefix: "mcp:oauth:owned",
  };
  const first = await lease.tryAcquireAuthorizationLease(input);
  const second = await lease.tryAcquireAuthorizationLease(input);
  assert.ok(first && second);
  assert.deepEqual(
    calls,
    [1, 2].map(() => [join(root, "mcp-oauth-owned.authz"), [25], 100, 250]),
  );
  assert.deepEqual(Object.keys(first), ["attemptId", "release"]);
  assert.match(first.attemptId, /^[0-9a-f]{32}$/);
  assert.notEqual(first.attemptId, second.attemptId);
  assert.equal(first.release, release);
  assert.equal(releases, 0);
  await first.release();
  assert.equal(releases, 1);
});
test("lease waits for acquisition before publishing a result", async (t) => {
  const { lease, ports } = await harness(t);
  const gate = deferred<() => Promise<void>>();
  ports.acquireFileLock = () => gate.promise;
  let settled = false;
  const result = lease
    .tryAcquireAuthorizationLease({ credentialsFilePath: "owned/credentials", keyPrefix: "p" })
    .then((value) => {
      settled = true;
      return value;
    });
  await Promise.resolve();
  assert.equal(settled, false);
  const release = async () => {};
  gate.resolve(release);
  assert.equal((await result)?.release, release);
});
for (const [label, error, follower] of [
  ["own timeout", { code: timeoutCode }, true],
  ["inherited timeout", Object.create({ code: timeoutCode }) as object, true],
  ["array timeout", Object.assign([], { code: timeoutCode }), true],
  ["permission", { code: "EPERM" }, false],
  ["numeric code", { code: 4 }, false],
  ["primitive", timeoutCode, false],
  ["null", null, false],
  ["undefined", undefined, false],
  ["function code", Object.assign(() => {}, { code: timeoutCode }), false],
] as const) {
  test("lease error boundary: " + label, async (t) => {
    const { lease, ports } = await harness(t);
    ports.acquireFileLock = async () => {
      throw error;
    };
    const promise = lease.tryAcquireAuthorizationLease({
      credentialsFilePath: "owned/credentials",
      keyPrefix: "p",
    });
    if (follower) assert.equal(await promise, undefined);
    else await assert.rejects(promise, (e) => e === error);
  });
}
test("lease preserves a code getter failure without record filtering", async (t) => {
  const { lease, ports } = await harness(t);
  const marker = new Error("owned code read failure");
  ports.acquireFileLock = async () => {
    throw {
      get code() {
        throw marker;
      },
    };
  };
  await assert.rejects(
    lease.tryAcquireAuthorizationLease({
      credentialsFilePath: "owned/credentials",
      keyPrefix: "p",
    }),
    (e) => e === marker,
  );
});
for (const [first, second] of [
  [timeoutCode, "EPERM"],
  ["EPERM", timeoutCode],
  [timeoutCode, null],
] as const) {
  test("lease error code is read once: " + first + " then " + String(second), async (t) => {
    const { lease, ports } = await harness(t);
    let reads = 0;
    const getterFailure = new Error("Unexpected second code lookup");
    const error = {
      get code() {
        reads++;
        if (reads === 1) return first;
        if (second === null) throw getterFailure;
        return second;
      },
    };
    ports.acquireFileLock = async () => {
      throw error;
    };
    const result = lease.tryAcquireAuthorizationLease({
      credentialsFilePath: "owned/credentials",
      keyPrefix: "p",
    });
    if (first === timeoutCode) assert.equal(await result, undefined);
    else await assert.rejects(result, (actual) => actual === error);
    assert.equal(reads, 1);
  });
}

test("path getter failure occurs outside lock error classification", async (t) => {
  const { lease } = await harness(t);
  const error = { code: timeoutCode };
  const input = {
    get credentialsFilePath(): string {
      throw error;
    },
    keyPrefix: "p",
  };
  await assert.rejects(lease.tryAcquireAuthorizationLease(input), (e) => e === error);
});
test("retained native lock excludes a second owner and accepts one after release", async (t) => {
  const { lease, ports, root } = await harness(t);
  ports.acquireFileLock = nativeLock.acquireFileLock;
  const input = {
    credentialsFilePath: join(root, "credential.json"),
    keyPrefix: "mcp:oauth:owned-native",
  };
  const first = await lease.tryAcquireAuthorizationLease(input);
  assert.ok(first);
  try {
    assert.equal(await lease.tryAcquireAuthorizationLease(input), undefined);
    const files = await readdir(root);
    assert.ok(files.includes("mcp-oauth-owned-native.authz.lock"));
    assert.ok(!files.includes("credential.json"));
  } finally {
    await first.release();
  }
  const next = await lease.tryAcquireAuthorizationLease(input);
  assert.ok(next);
  await next.release();
  assert.ok(!(await readdir(root)).includes("mcp-oauth-owned-native.authz.lock"));
});
