// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { readFile, readdir, utimes, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import test from "node:test";
import { fixture, record } from "./workspace-hook-trust.fixture.js";
import { ownedProcess } from "./workspace-hook-trust-process.fixture.js";
import { createFileWorkspaceHookTrustStore } from "./workspace-hook-trust-test-api.js";

test("a process probe ENOENT stays in contention and preserves the existing owner", async (t) => {
  const f = await fixture(t);
  const owner = await ownedProcess(f, "idle");
  const content = JSON.stringify({
    pid: owner.pid,
    token: "synthetic-owner",
    startTime: owner.startTime,
    startTimeBasis: "process",
  });
  await writeFile(f.lockPath, content);
  const stale = new Date(Date.now() - 60000);
  await utimes(f.lockPath, stale, stale);
  let probes = 0;
  const failure = Object.assign(new Error("synthetic probe disappeared"), { code: "ENOENT" });
  const store = createFileWorkspaceHookTrustStore({
    filePath: f.filePath,
    lockTimeoutMs: 100,
    probeProcessStartTime: async (pid) => {
      assert.equal(pid, owner.pid);
      probes++;
      throw failure;
    },
  });
  await assert.rejects(store.grant([record()]), {
    message: `Timed out acquiring Workspace Hook Trust store lock: ${f.lockPath}`,
  });
  assert.ok(probes > 0);
  assert.equal(owner.isHeld(), true);
  assert.equal(await readFile(f.lockPath, "utf8"), content);
  assert.deepEqual(await readdir(f.root), ["trust.json.lock"]);
});

test("other probe errors keep their exact identity and never delete the existing owner", async (t) => {
  const f = await fixture(t);
  const owner = await ownedProcess(f, "idle");
  const content = JSON.stringify({
    pid: owner.pid,
    token: "synthetic-owner",
    startTime: owner.startTime,
    startTimeBasis: "process",
  });
  await writeFile(f.lockPath, content);
  const stale = new Date(Date.now() - 60000);
  await utimes(f.lockPath, stale, stale);
  for (const failure of [
    Object.assign(new Error("synthetic probe denied"), { code: "EACCES" }),
    { code: "ENOENT" },
  ]) {
    let probes = 0;
    const store = createFileWorkspaceHookTrustStore({
      filePath: f.filePath,
      lockTimeoutMs: 100,
      probeProcessStartTime: async (pid) => {
        assert.equal(pid, owner.pid);
        probes++;
        throw failure;
      },
    });
    await assert.rejects(store.grant([record()]), (error) => error === failure);
    assert.equal(probes, 1);
    assert.equal(await readFile(f.lockPath, "utf8"), content);
    assert.equal(owner.isHeld(), true);
  }
});

test("an exclusive temporary-file collision never deletes another existing file", async (t) => {
  const f = await fixture(t);
  const fixedTime = 1700000000000;
  const fixedRandom = 0.5;
  const path = join(
    f.root,
    `.${basename(f.filePath)}.${process.pid}.${fixedTime}.${fixedRandom.toString(16).slice(2)}.tmp`,
  );
  const previous = JSON.stringify({ schemaVersion: 1, records: [record("a")] });
  await writeFile(f.filePath, previous);
  await writeFile(path, "pre-existing task-owned sentinel");
  const now = Date.now,
    random = Math.random;
  try {
    Date.now = () => fixedTime;
    Math.random = () => fixedRandom;
    await assert.rejects(f.store.grant([record("b")]), { code: "EEXIST" });
  } finally {
    Date.now = now;
    Math.random = random;
  }
  assert.equal(await readFile(f.filePath, "utf8"), previous);
  assert.equal(await readFile(path, "utf8"), "pre-existing task-owned sentinel");
  await assert.rejects(readFile(f.lockPath), { code: "ENOENT" });
});
