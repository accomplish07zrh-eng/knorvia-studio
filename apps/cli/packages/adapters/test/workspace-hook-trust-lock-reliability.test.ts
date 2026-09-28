// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { readFile, readdir, utimes, writeFile } from "node:fs/promises";
import test from "node:test";
import { fixture, record, readRaw } from "./workspace-hook-trust.fixture.js";
import { ownedProcess } from "./workspace-hook-trust-process.fixture.js";
import { createFileWorkspaceHookTrustStore } from "./workspace-hook-trust-test-api.js";

async function age(path: string) {
  const before = new Date(Date.now() - 60000);
  await utimes(path, before, before);
}

test("default writer metadata names the live process instance and an explicit process basis", async (t) => {
  const f = await fixture(t);
  const owner = await ownedProcess(f, "writer");
  const metadata = JSON.parse(await readFile(f.lockPath, "utf8")) as {
    pid: number;
    startTime: number;
    startTimeBasis?: string;
  };
  assert.equal(owner.isHeld(), true);
  assert.equal(metadata.pid, owner.pid);
  assert.ok(
    Math.abs(metadata.startTime - owner.startTime) <= 2000,
    `lock start differs from live owner by ${metadata.startTime - owner.startTime}ms`,
  );
  assert.equal(metadata.startTimeBasis, "process");
});

test("an aged live writer remains exclusive and the later writer preserves its committed record", async (t) => {
  const f = await fixture(t);
  const owner = await ownedProcess(f, "writer");
  await age(f.lockPath);
  let publications = 0;
  const contender = createFileWorkspaceHookTrustStore({
    filePath: f.filePath,
    lockTimeoutMs: 100,
    probeProcessStartTime: async (pid) => {
      assert.equal(pid, owner.pid);
      return owner.startTime;
    },
    beforeRename: () => {
      publications++;
    },
  });
  await assert.rejects(contender.grant([record("2")]), {
    message: `Timed out acquiring Workspace Hook Trust store lock: ${f.lockPath}`,
  });
  assert.equal(publications, 0);
  assert.equal(owner.isHeld(), true);
  await owner.stop();
  assert.deepEqual((await contender.grant([record("2")])).records, [record("1"), record("2")]);
  assert.deepEqual((await readRaw(f)).records, [record("1"), record("2")]);
  assert.deepEqual(await readdir(f.root), ["trust.json"]);
});

for (const scenario of [
  "legacy",
  "unknown-basis",
  "infinite-stored-start",
  "infinite-probe",
] as const) {
  test(`an aged live ${scenario} lock is retained conservatively`, async (t) => {
    const f = await fixture(t);
    const owner = await ownedProcess(f, "idle");
    const content = JSON.stringify({
      pid: owner.pid,
      token: "synthetic-owner",
      startTime: scenario === "infinite-probe" ? owner.startTime : owner.startTime - 10000,
      ...(scenario === "legacy"
        ? {}
        : { startTimeBasis: scenario === "unknown-basis" ? "unknown" : "process" }),
    });
    const raw =
      scenario === "infinite-stored-start"
        ? content.replace(/"startTime":[^,}]+/, '"startTime":1e999')
        : content;
    await writeFile(f.lockPath, raw);
    await age(f.lockPath);
    let publications = 0;
    const store = createFileWorkspaceHookTrustStore({
      filePath: f.filePath,
      lockTimeoutMs: 100,
      probeProcessStartTime: async (pid) => {
        assert.equal(pid, owner.pid);
        return scenario === "infinite-probe" ? Infinity : owner.startTime;
      },
      beforeRename: () => {
        publications++;
      },
    });
    await assert.rejects(store.grant([record()]), {
      message: `Timed out acquiring Workspace Hook Trust store lock: ${f.lockPath}`,
    });
    assert.equal(publications, 0);
    assert.equal(owner.isHeld(), true);
    assert.equal(await readFile(f.lockPath, "utf8"), raw);
  });
}
