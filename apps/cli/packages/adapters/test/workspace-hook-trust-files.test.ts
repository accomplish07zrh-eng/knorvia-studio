// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  fixture,
  record,
  readRaw,
  deferred,
  guard,
  onlyTrustFile,
} from "./workspace-hook-trust.fixture.js";
import { createFileWorkspaceHookTrustStore } from "./workspace-hook-trust-test-api.js";

test("an absent rename delay entry ends retrying without treating the array length as a delay", async (t) => {
  const failure = Object.assign(new Error("synthetic busy with sparse schedule"), {
    code: "EBUSY",
  });
  let attempts = 0;
  const retryDelays: number[] = [];
  retryDelays.length = 1;
  assert.equal(0 in retryDelays, false);
  const f = await fixture(t, {
    renameRetryDelaysMs: retryDelays,
    renameFile: async () => {
      attempts++;
      throw failure;
    },
  });
  await assert.rejects(f.store.grant([record()]), (error) => error === failure);
  assert.equal(attempts, 1);
  assert.deepEqual(await readdir(f.root), []);
});

test("bad JSON, unknown version, duplicate identity and mixed invalid records fail closed", async (t) => {
  const contents = [
    "{broken",
    JSON.stringify({ schemaVersion: 2, records: [] }),
    JSON.stringify({ schemaVersion: 1, records: [record(), record()] }),
    JSON.stringify({
      schemaVersion: 1,
      records: [record(), { ...record("b"), decision: "revoked" }],
    }),
  ];
  for (const content of contents) {
    const f = await fixture(t, { now: () => 123 });
    await writeFile(f.filePath, content);
    const result = await f.store.load();
    assert.deepEqual(result, {
      status: "corrupt",
      records: [],
      recoveredCorruptPath: `${f.filePath}.corrupt-123`,
    });
    assert.equal(await readFile(`${f.filePath}.corrupt-123`, "utf8"), content);
    await assert.rejects(readFile(f.filePath), { code: "ENOENT" });
  }
});

test("failed corrupt isolation still returns the intended path and does not claim partial trust", async (t) => {
  const f = await fixture(t, {
    now: () => 123,
    renameFile: async () => assert.fail("wrong rename port"),
  });
  await writeFile(f.filePath, "{broken");
  await mkdir(`${f.filePath}.corrupt-123`);
  assert.deepEqual(await f.store.load(), {
    status: "corrupt",
    records: [],
    recoveredCorruptPath: `${f.filePath}.corrupt-123`,
  });
  assert.equal(await readFile(f.filePath, "utf8"), "{broken");
});

test("mutation starts empty after corrupt recovery and writes authoritative schema JSON", async (t) => {
  const f = await fixture(t, { now: () => 123 });
  await writeFile(f.filePath, "{broken");
  const result = await f.store.grant([record()]);
  assert.deepEqual(result, { schemaVersion: 1, records: [record()] });
  assert.equal(await readFile(f.filePath, "utf8"), JSON.stringify(result, null, 2) + "\n");
  assert.equal(await readFile(`${f.filePath}.corrupt-123`, "utf8"), "{broken");
});

test("beforeRename sees complete temporary bytes while the previous final file is unchanged", async (t) => {
  let inspect = async () => {};
  const f = await fixture(t, { beforeRename: () => inspect() });
  const initial = { schemaVersion: 1, records: [record()] };
  await writeFile(f.filePath, JSON.stringify(initial));
  let arrived = false;
  inspect = async () => {
    arrived = true;
    assert.deepEqual(await readRaw(f), initial);
    const temps = (await readdir(f.root)).filter((name) => name.endsWith(".tmp"));
    assert.equal(temps.length, 1);
    assert.ok(temps[0]!.startsWith(`.${basename(f.filePath)}.${process.pid}.`));
    assert.match(temps[0]!, /\.\d+\.[a-f0-9]*\.tmp$/);
    const bytes = await readFile(join(f.root, temps[0]!), "utf8");
    assert.equal(
      bytes,
      JSON.stringify({ schemaVersion: 1, records: [record(), record("b")] }, null, 2) + "\n",
    );
  };
  await f.store.grant([record("b")]);
  assert.equal(arrived, true);
  await onlyTrustFile(f);
});

test("beforeRename failure retains its exact value, preserves final bytes and queue continues", async (t) => {
  const failure = { stage: "beforeRename", identity: true };
  let calls = 0;
  const f = await fixture(t, {
    beforeRename: () => {
      if (++calls === 1) throw failure;
    },
  });
  const initial = JSON.stringify({ schemaVersion: 1, records: [record()] });
  await writeFile(f.filePath, initial);
  const first = f.store.grant([record("b")]);
  await assert.rejects(first, (error) => error === failure);
  assert.equal(await readFile(f.filePath, "utf8"), initial);
  await onlyTrustFile(f);
  const next = await f.store.grant([record("c")]);
  assert.deepEqual(
    next.records.map((row) => row.hookDeclarationDigest),
    ["a".repeat(64), "c".repeat(64)],
  );
});

test("same-instance grant, load and grant execute in call order across an explicit gate", async (t) => {
  const entered = deferred();
  const release = deferred();
  let calls = 0;
  const f = await fixture(t, {
    beforeRename: async () => {
      if (++calls === 1) {
        entered.resolve();
        await guard(release.promise);
      }
    },
  });
  const first = f.store.grant([record()]);
  await guard(entered.promise);
  const read = f.store.load();
  const last = f.store.grant([record("b")]);
  release.resolve();
  assert.equal((await first).records.length, 1);
  assert.deepEqual(await read, { status: "ok", records: [record()] });
  assert.equal((await last).records.length, 2);
  await onlyTrustFile(f);
});

test("known Error rename codes retry finitely then publish real bytes", async (t) => {
  for (const code of ["EPERM", "EBUSY", "EACCES"]) {
    let calls = 0;
    const failure = Object.assign(new Error("synthetic busy"), { code });
    const f = await fixture(t, {
      renameRetryDelaysMs: [0, 0],
      renameFile: async (from, to) => {
        if (++calls < 3) throw failure;
        await rename(from, to);
      },
    });
    await f.store.grant([record()]);
    assert.equal(calls, 3);
    assert.deepEqual((await readRaw(f)).records, [record()]);
    await onlyTrustFile(f);
  }
});

test("rename retry exhaustion preserves exact error and cleans temp/lock without changing final", async (t) => {
  for (const delays of [[], [0]]) {
    let calls = 0;
    const failure = Object.assign(new Error("synthetic denied"), { code: "EPERM" });
    const f = await fixture(t, {
      renameRetryDelaysMs: delays,
      renameFile: async () => {
        calls++;
        throw failure;
      },
    });
    const initial = JSON.stringify({ schemaVersion: 1, records: [record()] });
    await writeFile(f.filePath, initial);
    await assert.rejects(f.store.grant([record("b")]), (error) => error === failure);
    assert.equal(calls, delays.length + 1);
    assert.equal(await readFile(f.filePath, "utf8"), initial);
    await onlyTrustFile(f);
  }
});

test("non-Error or unsupported rename errors do not retry", async (t) => {
  for (const failure of [
    { code: "EPERM" },
    Object.assign(new Error("invalid"), { code: "EINVAL" }),
  ]) {
    let calls = 0;
    const f = await fixture(t, {
      renameRetryDelaysMs: [0, 0],
      renameFile: async () => {
        calls++;
        throw failure;
      },
    });
    await assert.rejects(f.store.grant([record()]), (error) => error === failure);
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(f.root), []);
  }
});

test("separate instances serialize: blocked contender can retry after the owner releases", async (t) => {
  const entered = deferred();
  const release = deferred();
  const f = await fixture(t, {
    beforeRename: async () => {
      entered.resolve();
      await guard(release.promise);
    },
  });
  const owner = f.store.grant([record()]);
  await guard(entered.promise);
  const contender = createFileWorkspaceHookTrustStore({
    filePath: f.filePath,
    lockTimeoutMs: 50,
    staleLockMs: 30000,
    probeProcessStartTime: async () => assert.fail("same pid does not need OS probe"),
  });
  try {
    await assert.rejects(
      contender.grant([record("b")]),
      (error) =>
        error instanceof Error &&
        error.message === `Timed out acquiring Workspace Hook Trust store lock: ${f.lockPath}`,
    );
  } finally {
    release.resolve();
  }
  await owner;
  assert.equal((await contender.grant([record("b")])).records.length, 2);
  await onlyTrustFile(f);
});

test("metadata EEXIST cleans the created lock and retries before the successful publication", async (t) => {
  const failure = Object.assign(new Error("synthetic metadata conflict"), { code: "EEXIST" });
  let attempts = 0;
  let publications = 0;
  const f = await fixture(t, {
    writeLockOwnerMetadata: async (handle, content) => {
      attempts++;
      if (attempts === 1) throw failure;
      assert.equal(attempts, 2);
      assert.equal(publications, 0);
      await handle.writeFile(content, "utf8");
    },
    beforeRename: () => {
      publications++;
    },
  });
  assert.deepEqual((await f.store.grant([record()])).records, [record()]);
  assert.equal(attempts, 2);
  assert.equal(publications, 1);
  await onlyTrustFile(f);
});
