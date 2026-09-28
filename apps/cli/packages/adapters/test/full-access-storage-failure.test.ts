// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { fullAccessFixture } from "./full-access-fixture.js";

for (const fault of ["missing", "foreign-session", "not-admitted", "malformed"])
  test(`second queue ${fault} rolls back the earlier queue and leaves no entries`, async (t) => {
    const f = await fullAccessFixture(t);
    if (fault === "missing") f.db.exec("DELETE FROM session_input WHERE id='second'");
    if (fault === "foreign-session")
      f.db.exec("UPDATE session_input SET session_id='other-access-session' WHERE id='second'");
    if (fault === "not-admitted")
      f.db.exec("UPDATE session_input SET status='cancelled' WHERE id='second'");
    if (fault === "malformed") f.db.exec("UPDATE session_input SET payload='{' WHERE id='second'");
    const before = f.snapshot();
    await assert.rejects(
      f.commit(),
      fault === "malformed" ? SyntaxError : /Pending input unavailable/,
    );
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });

for (const id of ["execution", "receipt"])
  test(`${id} write failure rolls back queue, entry and session touch together`, async (t) => {
    const f = await fullAccessFixture(t),
      before = f.snapshot();
    f.db.exec(
      `CREATE TRIGGER reject_entry BEFORE INSERT ON session_entry WHEN NEW.id='${id}' BEGIN SELECT RAISE(ABORT,'fixture entry failure'); END`,
    );
    await assert.rejects(f.commit(), /fixture entry failure/);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });

test("SQLite automatic rollback preserves the original SQL error instead of a second rollback error", async (t) => {
  const f = await fullAccessFixture(t),
    before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER reject_queue BEFORE UPDATE ON session_input WHEN NEW.id='second' BEGIN SELECT RAISE(ROLLBACK,'original queue failure'); END",
  );
  await assert.rejects(f.commit(), /original queue failure/);
  assert.equal(f.db.isTransaction, false);
  assert.deepEqual(f.snapshot(), before);
});

test("a rollback failure retains both original failure and cleanup failure", async (t) => {
  const f = await fullAccessFixture(t);
  f.db.exec("UPDATE session_input SET payload='{' WHERE id='second'");
  const rollbackFailure = new Error("fixture rollback failure");
  const exec = f.db.exec.bind(f.db);
  const hook = t.mock.method(f.db, "exec", (sql: string) => {
    if (sql.toUpperCase() === "ROLLBACK") throw rollbackFailure;
    exec(sql);
  });
  await assert.rejects(f.commit(), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.ok(error.errors[0] instanceof SyntaxError);
    assert.equal(error.errors[1], rollbackFailure);
    return true;
  });
  assert.equal(f.db.isTransaction, true);
  hook.mock.restore();
  f.db.exec("ROLLBACK");
});

for (const stage of ["BEGIN IMMEDIATE", "COMMIT"])
  test(`${stage} preserves its failure and leaves the original rows`, async (t) => {
    const f = await fullAccessFixture(t),
      failure = new Error("fixture " + stage);
    const before = f.snapshot(),
      exec = f.db.exec.bind(f.db),
      statements: string[] = [];
    t.mock.method(f.db, "exec", (sql: string) => {
      statements.push(sql.toUpperCase());
      if (sql.toUpperCase() === stage) throw failure;
      exec(sql);
    });
    await assert.rejects(f.commit(), (error) => error === failure);
    assert.equal(f.db.isTransaction, false);
    assert.deepEqual(f.snapshot(), before);
    if (stage === "BEGIN IMMEDIATE") assert.deepEqual(statements, [stage]);
  });

test("malformed JSON fails before a controlled statement exposes its write method", async (t) => {
  const f = await fullAccessFixture(t);
  f.db.exec("UPDATE session_input SET payload='{' WHERE id='first'");
  const before = f.snapshot(),
    prepare = f.db.prepare.bind(f.db);
  t.mock.method(f.db, "prepare", (sql: string) => {
    const statement = prepare(sql);
    if (/^update session_input set payload/i.test(sql.trim()))
      Object.defineProperty(statement, "run", {
        get() {
          throw new Error("run getter failed");
        },
      });
    return statement;
  });
  await assert.rejects(f.commit(), SyntaxError);
  assert.equal(f.db.isTransaction, false);
  assert.deepEqual(f.snapshot(), before);
});
