// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  createFileWorkspaceHookTrustStore,
  FileWorkspaceHookTrustStore,
  type TrustRecord,
} from "./workspace-hook-trust-test-api.js";
import { fixture, record, readRaw } from "./workspace-hook-trust.fixture.js";

const at = (ms: number) => new Date(ms).toISOString();
const keys = (rows: TrustRecord[]) =>
  rows.map((row) => `${row.workspaceIdentity}:${row.hookDeclarationDigest}`);
const own = (digit: string, changes: Partial<TrustRecord> = {}) =>
  record(digit, { workspaceIdentity: "one", ...changes });

test("runtime null digest selection retains whole-workspace revoke behavior", async (t) => {
  const f = await fixture(t);
  const other = own("a", { workspaceIdentity: "other" });
  await f.store.grant([own("a"), own("b"), other]);
  const result = await f.store.revoke({
    workspaceIdentity: "one",
    hookDeclarationDigests: null as unknown as readonly string[],
  });
  assert.deepEqual(result.records, [other]);
});

test("class and public factory synchronously construct without filesystem work", async (t) => {
  const f = await fixture(t);
  const before = await readdir(f.root);
  const filePath = join(f.root, "not-created", "trust.json");
  const direct = new FileWorkspaceHookTrustStore({ filePath });
  const factory = createFileWorkspaceHookTrustStore({ filePath });
  assert.ok(direct instanceof FileWorkspaceHookTrustStore);
  assert.ok(factory instanceof FileWorkspaceHookTrustStore);
  for (const method of ["load", "grant", "revoke", "touch", "compact"] as const) {
    assert.equal(typeof direct[method], "function");
  }
  assert.deepEqual(await readdir(f.root), before);
});

test("missing load returns a Promise and the complete missing discriminant without a trust file", async (t) => {
  const f = await fixture(t);
  const pending = f.store.load();
  assert.ok(pending instanceof Promise);
  assert.deepEqual(await pending, { status: "missing", records: [] });
  await assert.rejects(stat(f.filePath), { code: "ENOENT" });
  await assert.rejects(stat(f.lockPath), { code: "ENOENT" });
  assert.deepEqual(await readdir(f.root), []);
});

test("prequeue validation keeps synchronous throws distinct from empty-revoke rejection and performs no IO", async (t) => {
  let writes = 0;
  const f = await fixture(t, {
    now: () => Number.NaN,
    beforeRename: () => {
      writes++;
    },
  });
  const before = await readdir(f.root);
  assert.throws(() => f.store.grant([own("a", { hookDeclarationDigest: "bad" })]));
  assert.throws(() => f.store.grant([Object.assign(own("a"), { unexpected: true })]));
  for (const maxAgeMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => f.store.compact({ current: [], maxAgeMs, maxRecords: 1 }), {
      message: "maxAgeMs must be a nonnegative finite number",
    });
  }
  for (const maxRecords of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => f.store.compact({ current: [], maxAgeMs: 0, maxRecords }), {
      message: "maxRecords must be a positive integer",
    });
  }
  assert.throws(
    () => f.store.touch({ workspaceIdentity: "one", hookDeclarationDigests: [] }),
    RangeError,
  );
  const rejected = f.store.revoke({ workspaceIdentity: "one", hookDeclarationDigests: [] });
  assert.ok(rejected instanceof Promise);
  await assert.rejects(rejected, {
    message: "hookDeclarationDigests must be undefined or non-empty",
  });
  assert.equal(writes, 0);
  assert.deepEqual(await readdir(f.root), before);
});

test("grant copies and validates at call time, preserves keyed order and distinguishes workspaces", async (t) => {
  const f = await fixture(t);
  const a = own("a");
  const b = own("b");
  const otherA = own("a", { workspaceIdentity: "other" });
  await f.store.grant([a, b, otherA]);
  const changedB = own("b", { displayCommandAtGrant: "updated b" });
  const changedA = own("a", { workspaceIdentity: " one ", displayCommandAtGrant: "updated a" });
  const c = own("c", { displayCommandAtGrant: "last c" });
  const input = [changedB, own("c"), c, changedA];
  const pending = f.store.grant(input);
  changedB.displayCommandAtGrant = "mutated after call";
  changedA.workspaceIdentity = "mutated";
  input.push(own("d"));
  const result = await pending;
  assert.deepEqual(keys(result.records), keys([a, b, otherA, c]));
  assert.deepEqual(
    result.records.map((row) => row.displayCommandAtGrant),
    ["updated a", "updated b", otherA.displayCommandAtGrant, "last c"],
  );
  assert.deepEqual(await readRaw(f), result);
});

test("empty grant still publishes the canonical complete v1 JSON with a final newline", async (t) => {
  let writes = 0;
  const f = await fixture(t, {
    beforeRename: () => {
      writes++;
    },
  });
  const empty = await f.store.grant([]);
  assert.deepEqual(empty, { schemaVersion: 1, records: [] });
  assert.equal(await readFile(f.filePath, "utf8"), `${JSON.stringify(empty, null, 2)}\n`);
  const existing = await f.store.grant([own("a")]);
  assert.deepEqual(await f.store.grant([]), existing);
  assert.equal(writes, 3);
});

test("revoke distinguishes precise, whole-workspace and untrimmed identity selection", async (t) => {
  const f = await fixture(t);
  const rows = [own("a"), own("b"), own("a", { workspaceIdentity: "other" })];
  await f.store.grant(rows);
  assert.deepEqual((await f.store.revoke({ workspaceIdentity: " one " })).records, rows);
  const selected = await f.store.revoke({
    workspaceIdentity: "one",
    hookDeclarationDigests: ["a".repeat(64)],
  });
  assert.deepEqual(selected.records, rows.slice(1));
  const all = await f.store.revoke({ workspaceIdentity: "one" });
  assert.deepEqual(all.records, [rows[2]]);
  assert.deepEqual(await readRaw(f), all);
});

test("revoke snapshots digest selection while reading workspace identity when its queued work executes", async (t) => {
  const f = await fixture(t);
  const rows = [
    own("a"),
    own("a", { workspaceIdentity: "other" }),
    own("b", { workspaceIdentity: "other" }),
  ];
  await f.store.grant(rows);
  const input = { workspaceIdentity: "one", hookDeclarationDigests: ["a".repeat(64)] };
  const pending = f.store.revoke(input);
  input.workspaceIdentity = "other";
  input.hookDeclarationDigests[0] = "b".repeat(64);
  assert.deepEqual((await pending).records, [rows[0], rows[2]]);
});

test("touch ignores unused invalid dates, rejects a matched invalid date asynchronously and continues afterward", async (t) => {
  let writes = 0;
  const f = await fixture(t, {
    beforeRename: () => {
      writes++;
    },
  });
  const a = own("a");
  await f.store.grant([a]);
  for (const input of [
    { workspaceIdentity: " one ", hookDeclarationDigests: [a.hookDeclarationDigest] },
    { workspaceIdentity: "one", hookDeclarationDigests: [] },
    { workspaceIdentity: "one", hookDeclarationDigests: ["b".repeat(64)] },
  ]) {
    assert.deepEqual((await f.store.touch({ ...input, usedAt: "bad-date" })).records, [a]);
  }
  assert.equal(writes, 4);
  const before = await readFile(f.filePath, "utf8");
  const rejected = f.store.touch({
    workspaceIdentity: "one",
    hookDeclarationDigests: [a.hookDeclarationDigest],
    usedAt: "bad-date",
  });
  assert.ok(rejected instanceof Promise);
  await assert.rejects(rejected);
  assert.equal(await readFile(f.filePath, "utf8"), before);
  const recovered = await f.store.touch({
    workspaceIdentity: "one",
    hookDeclarationDigests: [a.hookDeclarationDigest],
    usedAt: at(1),
  });
  assert.equal(recovered.records[0]?.lastUsedAt, at(1));
  assert.equal(writes, 5);
});

test("touch captures fallback time and digests at call time but permits backward time and late identity", async (t) => {
  let time = 1000;
  let calls = 0;
  const f = await fixture(t, {
    now: () => {
      calls++;
      return time;
    },
  });
  const rows = [
    own("a", { lastUsedAt: at(9000) }),
    own("a", { workspaceIdentity: "other", lastUsedAt: at(9000) }),
    own("b", { workspaceIdentity: "other" }),
  ];
  await f.store.grant(rows);
  const input: { workspaceIdentity: string; hookDeclarationDigests: string[]; usedAt?: string } = {
    workspaceIdentity: "one",
    hookDeclarationDigests: ["a".repeat(64)],
  };
  const pending = f.store.touch(input);
  assert.equal(calls, 1);
  time = 8000;
  input.workspaceIdentity = "other";
  input.hookDeclarationDigests[0] = "b".repeat(64);
  input.usedAt = at(5000);
  const result = await pending;
  assert.deepEqual(result.records, [rows[0], { ...rows[1], lastUsedAt: at(1000) }, rows[2]]);
  await f.store.touch({ workspaceIdentity: "one", hookDeclarationDigests: [], usedAt: at(2) });
  assert.equal(calls, 1, "an explicit usedAt must not consult the clock");
});

test("compact keeps pinned entries in store order even when they exceed the limit or age", async (t) => {
  const f = await fixture(t);
  const rows = [
    own("a", { grantedAt: at(1) }),
    own("b", { grantedAt: at(9000) }),
    own("c", { grantedAt: at(2) }),
  ];
  await f.store.grant(rows);
  const result = await f.store.compact({
    current: [rows[2]!, rows[0]!],
    maxAgeMs: 0,
    maxRecords: 1,
    now: 10000,
  });
  assert.deepEqual(result.records, [rows[0], rows[2]]);
  assert.deepEqual(await readRaw(f), result);
});

test("compact includes the age boundary and future dates, uses lastUsedAt and stable ties before limiting", async (t) => {
  const f = await fixture(t);
  const rows = [
    own("a", { grantedAt: at(9000), lastUsedAt: at(8999) }),
    own("b", { grantedAt: at(1), lastUsedAt: at(9000) }),
    own("c", { grantedAt: at(12000) }),
    own("d", { grantedAt: at(9500) }),
    own("e", { grantedAt: at(9500) }),
  ];
  await f.store.grant(rows);
  const full = await f.store.compact({ current: [], maxAgeMs: 1000, maxRecords: 10, now: 10000 });
  assert.deepEqual(full.records, [rows[2], rows[3], rows[4], rows[1]]);
  const limited = await f.store.compact({ current: [], maxAgeMs: 1000, maxRecords: 2, now: 10000 });
  assert.deepEqual(limited.records, [rows[2], rows[3]]);
});

test("compact captures current keys and now immediately but reads age and limit inside the queued operation", async (t) => {
  let time = 10000;
  let calls = 0;
  const f = await fixture(t, {
    now: () => {
      calls++;
      return time;
    },
  });
  const rows = [
    own("a", { grantedAt: at(1) }),
    own("b", { grantedAt: at(10000) }),
    own("c", { grantedAt: at(9000) }),
    own("d", { grantedAt: at(8999) }),
  ];
  await f.store.grant(rows);
  const input = {
    current: [{ workspaceIdentity: "one", hookDeclarationDigest: "a".repeat(64) }],
    maxAgeMs: 0,
    maxRecords: 1,
    now: undefined as number | undefined,
  };
  const pending = f.store.compact(input);
  assert.equal(calls, 1);
  input.current[0]!.hookDeclarationDigest = "d".repeat(64);
  input.maxAgeMs = 1000;
  input.maxRecords = 3;
  input.now = 100000;
  time = 200000;
  assert.deepEqual((await pending).records, rows.slice(0, 3));
  assert.equal(calls, 1);
});

test("returned records are detached and later operations reread external file changes", async (t) => {
  const f = await fixture(t);
  const a = own("a");
  const returned = await f.store.grant([a]);
  returned.records[0]!.displayCommandAtGrant = "caller-only edit";
  returned.records.push(own("b"));
  assert.deepEqual(await f.store.load(), { status: "ok", records: [a] });
  const c = own("c");
  await writeFile(f.filePath, JSON.stringify({ schemaVersion: 1, records: [c] }));
  assert.deepEqual((await f.store.grant([own("d")])).records, [c, own("d")]);
});
