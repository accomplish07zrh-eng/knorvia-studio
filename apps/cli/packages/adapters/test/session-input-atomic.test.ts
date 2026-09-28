// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { inputFixture, message, otherSession, session } from "./session-input-fixture.js";

for (const operation of ["edit", "promotion"] as const) {
  test(`${operation} preserves the primary native error after SQLite automatically rolls back`, async (t) => {
    const f = await inputFixture(t);
    await f.add();
    const before = f.snapshot();
    f.db.exec(
      "CREATE TRIGGER reject_input BEFORE UPDATE ON session_input BEGIN SELECT RAISE(ROLLBACK,'original ledger fault'); END",
    );
    const run = () =>
      operation === "edit"
        ? f.store.updateSessionInputs({
            sessionID: session,
            updates: [{ id: "input", text: "changed" }],
          })
        : f.promote();
    await assert.rejects(run(), /original ledger fault/);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });

  test(`${operation} preserves both a write failure and a separate cleanup failure`, async (t) => {
    const f = await inputFixture(t);
    await f.add();
    const before = f.snapshot();
    f.db.exec(
      "CREATE TRIGGER reject_input BEFORE UPDATE ON session_input BEGIN SELECT RAISE(ABORT,'primary write fault'); END",
    );
    const nativeExec = f.db.exec.bind(f.db);
    const cleanup = new Error("fixture cleanup fault");
    const mock = t.mock.method(f.db, "exec", (sql: string) => {
      if (sql.trim().toUpperCase() === "ROLLBACK") throw cleanup;
      return nativeExec(sql);
    });
    const run =
      operation === "edit"
        ? f.store.updateSessionInputs({
            sessionID: session,
            updates: [{ id: "input", text: "changed" }],
          })
        : f.promote();
    const failure = await run.then(
      () => undefined,
      (error: unknown) => error,
    );
    mock.mock.restore();
    assert.equal(f.db.isTransaction, true);
    nativeExec("ROLLBACK");
    assert.deepEqual(f.snapshot(), before);
    assert.ok(failure instanceof AggregateError);
    assert.match((failure.errors[0] as Error).message, /primary write fault/);
    assert.equal(failure.errors[1], cleanup);
    assert.equal(failure.cause, failure.errors[0]);
  });

  test(`${operation} rolls back a real deferred foreign-key failure at COMMIT`, async (t) => {
    const f = await inputFixture(t);
    await f.add();
    const before = f.snapshot();
    f.db.exec(
      "CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY); CREATE TABLE fixture_child(parent_id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER defer_input AFTER UPDATE ON session_input BEGIN INSERT INTO fixture_child VALUES(9); END",
    );
    const nativeExec = f.db.exec.bind(f.db);
    let reachedCommit = false;
    t.mock.method(f.db, "exec", (sql: string) => {
      if (sql.trim().toUpperCase() === "COMMIT") {
        reachedCommit = true;
        assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM fixture_child").get()?.n, 1);
      }
      return nativeExec(sql);
    });
    const run =
      operation === "edit"
        ? f.store.updateSessionInputs({
            sessionID: session,
            updates: [{ id: "input", text: "changed" }],
          })
        : f.promote();
    await assert.rejects(run, /FOREIGN KEY/);
    assert.equal(reachedCommit, true);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM fixture_child").get()?.n, 0);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });
}

test("failed promotion never rolls back an unrelated same-turn admission that reported success", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  f.db.exec(
    "CREATE TRIGGER fail_part BEFORE INSERT ON part BEGIN SELECT RAISE(ABORT,'part fault'); END",
  );
  const promotion = f.promote();
  const admission = f.add({
    id: "independent",
    sessionID: otherSession,
    payload: { text: "must survive" },
  });
  const result = await Promise.allSettled([promotion, admission]);
  assert.equal(result[0].status, "rejected");
  if (result[0].status === "rejected") assert.match(String(result[0].reason), /part fault/);
  assert.equal(result[1].status, "fulfilled");
  assert.equal((await f.store.getSessionInputById("independent"))?.payload.text, "must survive");
  assert.equal((await f.store.getSessionInputById("input"))?.status, "admitted");
  assert.deepEqual(f.rows("message"), []);
  assert.deepEqual(f.rows("part"), []);
  assert.equal(f.db.isTransaction, false);
});

test("two promotions invoked in the same event turn complete their own transactions without collision", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.add({ id: "second" });
  const first = f.promote("input", message("first-message"), []);
  const second = f.promote("second", message("second-message"), []);
  const result = await Promise.allSettled([first, second]);
  assert.deepEqual(
    result.map((x) => x.status),
    ["fulfilled", "fulfilled"],
  );
  assert.deepEqual(
    (await f.store.listSessionInputs({ sessionID: session })).map((x) => x.promotedSequence),
    [0, 1],
  );
  assert.deepEqual(
    (await f.store.messages({ sessionID: session })).map((x) => x.info.id),
    ["first-message", "second-message"],
  );
  assert.equal(f.db.isTransaction, false);
});

test("promotion completes all synchronous database work before returning its Promise", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  const promise = f.promote();
  const observed = {
    active: f.db.isTransaction,
    parts: f.rows("part").length,
    status: f.rows("session_input")[0].status,
  };
  await promise;
  assert.deepEqual(observed, { active: false, parts: 1, status: "promoted" });
});

test("promotion captures time before BEGIN rejection and leaves the caller-owned transaction intact", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  f.db.exec("BEGIN IMMEDIATE; UPDATE session_input SET kind='caller'");
  const before = f.snapshot();
  let clocks = 0;
  t.mock.method(Date, "now", () => {
    clocks++;
    return 190;
  });
  await assert.rejects(f.promote(), /cannot start a transaction/);
  assert.equal(clocks, 1);
  assert.equal(f.db.isTransaction, true);
  assert.deepEqual(f.snapshot(), before);
  f.db.exec("ROLLBACK");
});

test("edit clock failure rolls back its owned transaction while promotion clock failure starts none", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  const before = f.snapshot(),
    phases: string[] = [];
  const nativeExec = f.db.exec.bind(f.db);
  t.mock.method(f.db, "exec", (sql: string) => {
    phases.push(sql.trim().toUpperCase());
    return nativeExec(sql);
  });
  t.mock.method(Date, "now", () => {
    throw new Error("clock fault");
  });
  await assert.rejects(
    f.store.updateSessionInputs({ sessionID: session, updates: [{ id: "input" }] }),
    /clock fault/,
  );
  assert.deepEqual(phases, ["BEGIN IMMEDIATE", "ROLLBACK"]);
  phases.length = 0;
  await assert.rejects(f.promote(), /clock fault/);
  assert.deepEqual(phases, []);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});
