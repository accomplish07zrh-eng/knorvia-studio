import assert from "node:assert/strict";
import test from "node:test";
import { deferred, flush, loadOwner, ports } from "./status-persistence-fixture.mjs";

// Newly authored, unexecuted acceptance scenarios. These inspect data and effect
// boundaries through supplied ports; actual OS/file/schema acceptance is deferred.
test("status observations distinguish missing IO from malformed/schema errors by phase and identity", async () => {
  const state = ports();
  const { readPersistedStatusDetailed, readPersistedStatus } = await loadOwner(
    "statusSnapshot",
    state,
  );
  const admitted = { state: "stopped", updatedAt: 9 };
  state.parseStatus = () => admitted;
  state.reads.push("{}");
  const valid = await readPersistedStatusDetailed(state.layout);
  assert.equal(valid.status, admitted);
  assert.equal(valid.state, "valid");

  const missing = Object.assign(new Error("fixture missing"), { code: "ENOENT" });
  state.reads.push(missing);
  assert.deepEqual(await readPersistedStatusDetailed(state.layout), {
    state: "missing",
    status: null,
  });
  const unreadable = Object.assign(new Error("fixture denied"), { code: "EACCES" });
  state.reads.push(unreadable);
  assert.deepEqual(await readPersistedStatusDetailed(state.layout), {
    state: "unreadable",
    status: null,
    error: unreadable,
  });
  const plainMissing = { code: "ENOENT" };
  state.reads.push(plainMissing);
  assert.equal((await readPersistedStatusDetailed(state.layout)).error, plainMissing);

  state.reads.push("not JSON");
  const malformed = await readPersistedStatusDetailed(state.layout);
  assert.equal(malformed.state, "invalid");
  assert.ok(malformed.error instanceof SyntaxError);
  state.parseStatus = () => {
    throw missing;
  };
  state.reads.push("{}");
  const schemaFailure = await readPersistedStatusDetailed(state.layout);
  assert.equal(schemaFailure.state, "invalid");
  assert.equal(schemaFailure.error, missing);
  state.reads.push(missing);
  assert.equal(await readPersistedStatus(), null);
});

test("snapshot writes use live values, one serial write/rename sequence and unchanged file format", async () => {
  const state = ports();
  const { createStatusPersister } = await loadOwner("statusSnapshot", state);
  const firstWrite = deferred();
  let live = { version: "one", generation: 1 };
  let gets = 0;
  state.writeGate = () => (state.writes.length === 1 ? firstWrite.promise : undefined);
  const persist = createStatusPersister(
    "/fixture/status.json",
    function () {
      assert.equal(this, undefined);
      gets++;
      return live;
    },
    () => {
      assert.fail("unexpected persistence error");
    },
  );
  const first = persist();
  const second = persist();
  live = { version: "two", generation: 2 };
  await flush();
  assert.equal(gets, 1);
  assert.equal(state.writes.length, 1);
  assert.equal(state.journal.filter(([kind]) => kind === "rename").length, 0);
  live = { version: "three", generation: 3 };
  firstWrite.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(state.writes, [
    [
      "/fixture/status.json.7301.tmp",
      '{\n  "version": "two",\n  "generation": 2\n}\n',
      { encoding: "utf8", mode: 0o600 },
    ],
    [
      "/fixture/status.json.7301.tmp",
      '{\n  "version": "three",\n  "generation": 3\n}\n',
      { encoding: "utf8", mode: 0o600 },
    ],
  ]);
  assert.deepEqual(
    state.journal.map(([kind]) => kind),
    ["write", "rename", "write", "rename"],
  );
});

test("persistence failure reports original error unbound and a returning callback recovers later writes", async () => {
  const state = ports();
  const { createStatusPersister } = await loadOwner("statusSnapshot", state);
  const original = new Error("fixture rename failed");
  state.renameFailures.push(original);
  const failures = [];
  const persist = createStatusPersister(
    "/fixture/status.json",
    () => undefined,
    function (error) {
      assert.equal(this, undefined);
      failures.push(error);
    },
  );
  await Promise.all([persist(), persist()]);
  assert.deepEqual(failures, [original]);
  assert.equal(state.writes.length, 2);
  assert.equal(state.writes[0][1], "undefined\n");
});

test("throwing failure callback skips queued publication until the next report recovers the chain", async () => {
  const state = ports();
  const { createStatusPersister } = await loadOwner("statusSnapshot", state);
  const original = new Error("fixture write failed");
  const reporterFailure = new Error("fixture reporter failed");
  let writing = 0;
  const failures = [];
  state.writeGate = () => {
    if (++writing === 1) throw original;
  };
  const persist = createStatusPersister(
    "/fixture/status.json",
    () => ({ retained: true }),
    (error) => {
      failures.push(error);
      if (failures.length === 1) throw reporterFailure;
    },
  );
  const first = persist().catch((error) => error);
  const skipped = persist();
  assert.equal(await first, reporterFailure);
  await skipped;
  assert.deepEqual(failures, [original, reporterFailure]);
  assert.equal(state.writes.length, 1);
  await persist();
  assert.equal(state.writes.length, 2);
  assert.equal(state.journal.filter(([kind]) => kind === "rename").length, 1);
});

test("shutdown fails closed before lock access on corrupt status and preserves lock-description errors", async () => {
  const corrupt = ports();
  corrupt.reads.push("not JSON");
  const first = await loadOwner("shutdownWait", corrupt);
  await assert.rejects(
    first.waitForServerStopped(corrupt.layout),
    /Cannot verify Server shutdown status/,
  );
  assert.deepEqual(
    corrupt.journal.map(([kind]) => kind),
    ["read"],
  );

  const denied = ports();
  const fault = new Error("fixture unreadable lock");
  const inspection = { state: "unreadable", error: fault };
  denied.locks.push(inspection);
  const second = await loadOwner("shutdownWait", denied);
  await assert.rejects(
    second.waitForServerStopped(denied.layout),
    /Cannot verify Server shutdown \(fixture unreadable lock\)/,
  );
  assert.equal(denied.journal.find(([kind]) => kind === "describe")[1], inspection);
  assert.deepEqual(
    denied.journal.map(([kind]) => kind),
    ["read", "new-lock", "inspect", "describe"],
  );
});

test("shutdown requires released lock and strict freshness, while only offline missing status bypasses freshness", async () => {
  const stale = ports();
  stale.reads.push('{"state":"stopped","updatedAt":10}', '{"state":"stopped","updatedAt":11}');
  stale.locks.push({ state: "stale", pid: 17 }, { state: "missing" });
  const staleOwner = await loadOwner("shutdownWait", stale);
  const fresh = staleOwner.waitForServerStopped(stale.layout, 10, true);
  await flush();
  assert.equal(stale.timers.length, 1);
  assert.equal(stale.timers[0].ms, 100);
  stale.clock = 100;
  stale.timers.shift().callback();
  await fresh;
  assert.equal(stale.journal.filter(([kind]) => kind === "new-lock").length, 2);

  const active = ports();
  active.locks.push({ state: "active", pid: 18 }, { state: "missing" });
  const activeOwner = await loadOwner("shutdownWait", active);
  const released = activeOwner.waitForServerStopped(active.layout);
  await flush();
  assert.equal(active.timers.length, 1);
  active.clock = 100;
  active.timers.shift().callback();
  await released;

  const missing = Object.assign(new Error("fixture missing"), { code: "ENOENT" });
  const offline = ports();
  offline.reads.push(missing);
  const offlineOwner = await loadOwner("shutdownWait", offline);
  await offlineOwner.waitForServerStopped(offline.layout);
  assert.equal(offline.timers.length, 0);

  const migration = ports();
  migration.reads.push(missing);
  const migrationOwner = await loadOwner("shutdownWait", migration);
  const expired = migrationOwner
    .waitForServerStopped(migration.layout, 0, true)
    .catch((error) => error);
  await flush();
  assert.equal(migration.timers.length, 1);
  migration.clock = 6000;
  migration.timers.shift().callback();
  assert.equal(
    (await expired).message,
    "Timed out waiting for Server shutdown (/fixture/status.json)",
  );
  assert.equal(migration.journal.filter(([kind]) => kind === "read").length, 1);
});
