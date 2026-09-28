// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { writers, writerFixture } from "./script-workflow-fixture.js";

for (const writer of writers) {
  test(`${writer} borrows a caller transaction and leaves rollback to that owner`, async (t) => {
    const f = await writerFixture(t, writer);
    const before = f.snapshot();
    f.db.exec("BEGIN IMMEDIATE");
    const calls: string[] = [];
    const native = f.db.exec.bind(f.db);
    const probe = t.mock.method(f.db, "exec", (sql: string) => {
      calls.push(sql);
      native(sql);
    });
    const value = await f.call();
    assert.ok(value);
    assert.equal(f.db.isTransaction, true);
    assert.deepEqual(calls, []);
    probe.mock.restore();
    f.db.exec("ROLLBACK");
    assert.deepEqual(f.snapshot(), before);
  });

  test(`${writer} propagates a borrowed statement error without cleaning up its caller`, async (t) => {
    const f = await writerFixture(t, writer);
    const before = f.snapshot();
    f.db.exec(
      `CREATE TRIGGER abort_write BEFORE ${f.operation} ON ${f.table} BEGIN SELECT RAISE(ABORT,'borrowed write failure'); END`,
    );
    f.db.exec("BEGIN IMMEDIATE");
    const calls: string[] = [];
    const native = f.db.exec.bind(f.db);
    const probe = t.mock.method(f.db, "exec", (sql: string) => {
      calls.push(sql);
      native(sql);
    });
    await assert.rejects(f.call(), /borrowed write failure/);
    assert.equal(f.db.isTransaction, true);
    assert.deepEqual(calls, []);
    probe.mock.restore();
    f.db.exec("ROLLBACK");
    assert.deepEqual(f.snapshot(), before);
  });

  test(`${writer} rolls back an owned write when return-row projection fails`, async (t) => {
    const f = await writerFixture(t, writer);
    const before = f.snapshot();
    const column =
      writer === "definition"
        ? "meta_json"
        : writer.endsWith("run")
          ? "args_json"
          : writer.endsWith("activity")
            ? "opts_json"
            : "payload_json";
    const corrupt =
      writer === "link"
        ? `DELETE FROM ${f.table} WHERE id=NEW.id`
        : `UPDATE ${f.table} SET ${column}='invalid-json' WHERE id=NEW.id`;
    f.db.exec(
      `CREATE TABLE fixture_readback_audit(id INTEGER); CREATE TRIGGER corrupt_readback AFTER ${f.operation} ON ${f.table} BEGIN INSERT INTO fixture_readback_audit VALUES(1); ${corrupt}; END`,
    );
    await assert.rejects(
      f.call(),
      writer === "link" ? /Session task link not found after write: workflow-child/ : SyntaxError,
    );
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM fixture_readback_audit").get()?.n, 0);
  });

  test(`${writer} retains the primary cause when SQLite automatically rolls back`, async (t) => {
    const f = await writerFixture(t, writer);
    const before = f.snapshot();
    f.db.exec(
      `CREATE TRIGGER auto_rollback BEFORE ${f.operation} ON ${f.table} BEGIN SELECT RAISE(ROLLBACK,'original native workflow failure'); END`,
    );
    await assert.rejects(f.call(), /original native workflow failure/);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });

  test(`${writer} rolls back a deferred foreign-key error from the owned COMMIT`, async (t) => {
    const f = await writerFixture(t, writer);
    const before = f.snapshot();
    f.db.exec(
      `CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY); CREATE TABLE fixture_child(parent_id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER defer_write AFTER ${f.operation} ON ${f.table} BEGIN INSERT INTO fixture_child VALUES(9); END`,
    );
    let reachedCommit = false;
    const native = f.db.exec.bind(f.db);
    t.mock.method(f.db, "exec", (sql: string) => {
      if (sql.trim().toUpperCase() === "COMMIT") {
        reachedCommit = true;
        assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM fixture_child").get()?.n, 1);
      }
      native(sql);
    });
    await assert.rejects(f.call(), /FOREIGN KEY/);
    assert.equal(reachedCommit, true);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM fixture_child").get()?.n, 0);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });
}

test("owned workflow failure retains both the primary write error and cleanup failure", async (t) => {
  const f = await writerFixture(t, "update-run");
  const before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER abort_write BEFORE UPDATE ON workflow_run BEGIN SELECT RAISE(ABORT,'primary workflow failure'); END",
  );
  const native = f.db.exec.bind(f.db);
  const cleanup = new Error("synthetic cleanup failure");
  const probe = t.mock.method(f.db, "exec", (sql: string) => {
    if (sql.trim().toUpperCase() === "ROLLBACK") throw cleanup;
    native(sql);
  });
  const failure: unknown = await f.call().catch((error: unknown) => error);
  probe.mock.restore();
  if (f.db.isTransaction) f.db.exec("ROLLBACK");
  assert.deepEqual(f.snapshot(), before);
  assert.ok(failure instanceof AggregateError);
  assert.match((failure.errors[0] as Error).message, /primary workflow failure/);
  assert.equal(failure.errors[1], cleanup);
  assert.equal(failure.cause, failure.errors[0]);
});

test("failed workflow transaction admission performs no write or owner cleanup", async (t) => {
  const f = await writerFixture(t, "create-run");
  const before = f.snapshot();
  const failure = new Error("fixture writer busy");
  const calls: string[] = [];
  t.mock.method(f.db, "exec", (sql: string) => {
    calls.push(sql);
    throw failure;
  });
  await assert.rejects(f.call(), (error) => error === failure);
  assert.deepEqual(calls, ["BEGIN IMMEDIATE"]);
  assert.deepEqual(f.snapshot(), before);
});

test("workflow clocks precede admission for creation and follow locked reads for updates", async (t) => {
  for (const writer of writers) {
    const f = await writerFixture(t, writer);
    const events: string[] = [];
    const native = f.db.exec.bind(f.db);
    const exec = t.mock.method(f.db, "exec", (sql: string) => {
      events.push(sql.trim().toUpperCase());
      native(sql);
    });
    const time = t.mock.method(Date, "now", () => {
      events.push("clock");
      return 200;
    });
    await f.call();
    assert.deepEqual(
      events,
      writer.startsWith("update")
        ? ["BEGIN IMMEDIATE", "clock", "COMMIT"]
        : ["clock", "BEGIN IMMEDIATE", "COMMIT"],
      writer,
    );
    exec.mock.restore();
    time.mock.restore();
  }
});

test("a borrowed readback failure leaves partial writes for the outer owner to decide", async (t) => {
  const f = await writerFixture(t, "create-run");
  const before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER corrupt_readback AFTER INSERT ON workflow_run BEGIN UPDATE workflow_run SET args_json='bad-json' WHERE id=NEW.id; END",
  );
  f.db.exec("BEGIN IMMEDIATE");
  await assert.rejects(f.call(), SyntaxError);
  assert.equal(f.db.isTransaction, true);
  assert.equal(f.rows("workflow_run").length, 1);
  f.db.exec("ROLLBACK");
  assert.deepEqual(f.snapshot(), before);
});
