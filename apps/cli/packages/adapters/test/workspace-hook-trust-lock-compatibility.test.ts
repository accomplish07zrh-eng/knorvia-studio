// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { readFile, readdir, utimes, writeFile } from "node:fs/promises";
import test from "node:test";
import { fixture, record, onlyTrustFile } from "./workspace-hook-trust.fixture.js";
import { ownedProcess } from "./workspace-hook-trust-process.fixture.js";
import { createFileWorkspaceHookTrustStore } from "./workspace-hook-trust-test-api.js";

async function stale(path: string) {
  const time = new Date(Date.now() - 60000);
  await utimes(path, time, time);
}
test("an aged same-process lock is retained without probing another instance", async (t) => {
  const f = await fixture(t, {
    lockTimeoutMs: 50,
    probeProcessStartTime: async () => assert.fail("same-process probe"),
  });
  const content = JSON.stringify({
    pid: process.pid,
    token: "synthetic-existing",
    startTime: 1,
    startTimeBasis: "process",
  });
  await writeFile(f.lockPath, content);
  await stale(f.lockPath);
  await assert.rejects(f.store.grant([record()]), {
    message: `Timed out acquiring Workspace Hook Trust store lock: ${f.lockPath}`,
  });
  assert.equal(await readFile(f.lockPath, "utf8"), content);
  assert.deepEqual(await readdir(f.root), ["trust.json.lock"]);
});
test("aged malformed or unowned locks can be reclaimed and publish real records", async (t) => {
  for (const content of ["{bad", "{}", "[]"]) {
    const f = await fixture(t);
    await writeFile(f.lockPath, content);
    await stale(f.lockPath);
    assert.deepEqual((await f.store.grant([record()])).records, [record()]);
    await onlyTrustFile(f);
  }
});
test("recent malformed locks still respect the stale threshold", async (t) => {
  const f = await fixture(t, { lockTimeoutMs: 50, staleLockMs: 60000 });
  await writeFile(f.lockPath, "{bad");
  await assert.rejects(f.store.load(), {
    message: `Timed out acquiring Workspace Hook Trust store lock: ${f.lockPath}`,
  });
  assert.equal(await readFile(f.lockPath, "utf8"), "{bad");
});
test("a marked live instance uses the inclusive 2000ms tolerance before reclaiming", async (t) => {
  const f = await fixture(t);
  const owner = await ownedProcess(f, "idle");
  // 只推进锁测试时钟，避免主机调度耗尽 50ms 而遮蔽 2000/2001ms 身份边界。
  const probeElapsedMs = 10;
  let lockNow = Date.now();
  t.mock.method(Date, "now", () => lockNow);
  let probes = 0;
  const store = createFileWorkspaceHookTrustStore({
    filePath: f.filePath,
    lockTimeoutMs: 50,
    probeProcessStartTime: async (pid) => {
      assert.equal(pid, owner.pid);
      probes++;
      lockNow += probeElapsedMs;
      return owner.startTime;
    },
  });
  for (const delta of [2000, 2001]) {
    const content = JSON.stringify({
      pid: owner.pid,
      token: "synthetic-owner",
      startTime: owner.startTime - delta,
      startTimeBasis: "process",
    });
    await writeFile(f.lockPath, content);
    await stale(f.lockPath);
    probes = 0;
    if (delta === 2000) {
      await assert.rejects(store.grant([record()]), {
        message: `Timed out acquiring Workspace Hook Trust store lock: ${f.lockPath}`,
      });
      assert.equal(await readFile(f.lockPath, "utf8"), content);
    } else {
      assert.deepEqual((await store.grant([record()])).records, [record()]);
      await onlyTrustFile(f);
    }
    assert.ok(probes > 0);
    assert.equal(owner.isHeld(), true);
  }
});
test("a live owner with an unavailable probe is retained", async (t) => {
  const f = await fixture(t);
  const owner = await ownedProcess(f, "idle");
  const content = JSON.stringify({
    pid: owner.pid,
    token: "synthetic-owner",
    startTime: 1,
    startTimeBasis: "process",
  });
  await writeFile(f.lockPath, content);
  await stale(f.lockPath);
  let probes = 0;
  const store = createFileWorkspaceHookTrustStore({
    filePath: f.filePath,
    lockTimeoutMs: 50,
    probeProcessStartTime: async (pid) => {
      assert.equal(pid, owner.pid);
      probes++;
      return null;
    },
  });
  await assert.rejects(store.load(), {
    message: `Timed out acquiring Workspace Hook Trust store lock: ${f.lockPath}`,
  });
  assert.ok(probes > 0);
  assert.equal(owner.isHeld(), true);
  assert.equal(await readFile(f.lockPath, "utf8"), content);
});
test("an exited task-owned process leaves a reclaimable aged lock", async (t) => {
  const f = await fixture(t);
  const owner = await ownedProcess(f, "idle");
  await owner.stop();
  assert.throws(() => process.kill(owner.pid, 0), { code: "ESRCH" });
  const content = JSON.stringify({
    pid: owner.pid,
    token: "synthetic-exited",
    startTime: owner.startTime,
    startTimeBasis: "process",
  });
  await writeFile(f.lockPath, content);
  await stale(f.lockPath);
  const store = createFileWorkspaceHookTrustStore({
    filePath: f.filePath,
    probeProcessStartTime: async () =>
      assert.fail("confirmed dead owner does not require a start probe"),
  });
  assert.deepEqual((await store.grant([record()])).records, [record()]);
  await onlyTrustFile(f);
});
test("a metadata failure keeps its identity, cleans its lock and does not poison the queue", async (t) => {
  const failure = { stage: "synthetic-metadata" };
  let calls = 0;
  const f = await fixture(t, {
    writeLockOwnerMetadata: async (handle, content) => {
      if (++calls === 1) throw failure;
      await handle.writeFile(content, "utf8");
    },
  });
  await assert.rejects(f.store.grant([record()]), (error) => error === failure);
  assert.deepEqual(await readdir(f.root), []);
  assert.deepEqual((await f.store.grant([record("b")])).records, [record("b")]);
  assert.equal(calls, 2);
  await onlyTrustFile(f);
});
test("release preserves a replacement token rather than deleting the later owner", async (t) => {
  let replace = async () => {};
  const f = await fixture(t, { beforeRename: () => replace() });
  const content = JSON.stringify({ pid: process.pid, token: "synthetic-replacement" });
  replace = () => writeFile(f.lockPath, content);
  assert.deepEqual((await f.store.grant([record()])).records, [record()]);
  assert.equal(await readFile(f.lockPath, "utf8"), content);
  assert.deepEqual((await readdir(f.root)).toSorted(), ["trust.json", "trust.json.lock"]);
});
