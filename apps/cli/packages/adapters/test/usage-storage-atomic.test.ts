// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import {
  modelInput,
  session,
  toolInput,
  turnInput,
  usageFixture,
  type UsageTable,
} from "./usage-storage-fixture.js";

const writes: Array<{
  table: UsageTable;
  write: (store: SqliteSessionStore, value: number) => Promise<void>;
}> = [
  {
    table: "model_usage",
    write: (store, value) => store.recordModelUsage(modelInput({ inputTokens: value })),
  },
  {
    table: "turn_usage",
    write: (store, value) => store.upsertTurnUsage(turnInput({ modelRequestCount: value })),
  },
  {
    table: "tool_usage",
    write: (store, value) => store.upsertToolUsage(toolInput({ outputBytes: value })),
  },
];

for (const { table, write } of writes) {
  for (const existing of [false, true]) {
    test(`${table} ${existing ? "conflict update" : "new row"} rolls back when later retention fails`, async (t) => {
      const f = await usageFixture(t);
      if (existing) await write(f.store, 3);
      f.seedExpired();
      const before = f.snapshot();
      f.db.exec(
        "CREATE TRIGGER block_usage_prune BEFORE DELETE ON tool_usage BEGIN SELECT RAISE(ABORT,'fixture prune denied'); END",
      );
      await assert.rejects(write(f.store, 9), /fixture prune denied/);
      assert.deepEqual(f.snapshot(), before);
      assert.equal(f.db.isTransaction, false);
    });
  }

  test(`${table} rejects caller transaction before this write without ending earlier changes`, async (t) => {
    const f = await usageFixture(t);
    f.db.exec("BEGIN IMMEDIATE");
    f.db.prepare("UPDATE session SET title=? WHERE id=?").run("Caller pending", session);
    f.seedExpired();
    const before = f.snapshot();
    await assert.rejects(write(f.store, 9), /cannot start a transaction within a transaction/);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(
      f.db.prepare("SELECT title FROM session WHERE id=?").get(session)?.title,
      "Caller pending",
    );
    assert.equal(f.db.isTransaction, true);
    f.db.exec("ROLLBACK");
    assert.equal(f.rows(table).length, 0);
  });

  test(`${table} deferred failure reaches COMMIT and rolls back write, prune and trigger rows`, async (t) => {
    const f = await usageFixture(t);
    f.seedExpired();
    const before = f.snapshot();
    const phases: string[] = [];
    f.db.function("observe_usage", (phase) => {
      phases.push(String(phase));
      return 1;
    });
    f.db.exec(
      "CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY); CREATE TABLE fixture_child(parent_id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED)",
    );
    f.db.exec(
      `CREATE TRIGGER deferred_usage AFTER INSERT ON ${table} BEGIN SELECT observe_usage('insert'); INSERT INTO fixture_child VALUES(7); END`,
    );
    f.db.exec(
      "CREATE TRIGGER observed_prune AFTER DELETE ON tool_usage BEGIN SELECT observe_usage('prune'); END",
    );
    const exec = f.db.exec.bind(f.db);
    t.mock.method(f.db, "exec", (sql: string) => {
      if (sql.trim().toUpperCase() === "COMMIT") phases.push("commit");
      return exec(sql);
    });
    await assert.rejects(write(f.store, 9), /FOREIGN KEY constraint failed/);
    assert.deepEqual(phases, ["insert", "prune", "commit"]);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM fixture_child").get()?.n, 0);
    assert.equal(f.db.isTransaction, false);
  });

  test(`${table} clock failure after the upsert cannot leave a saved row`, async (t) => {
    const f = await usageFixture(t);
    const failure = new Error("fixture retention clock");
    const phases: string[] = [];
    f.db.function("observe_usage", () => {
      phases.push("insert");
      return 1;
    });
    f.db.exec(
      `CREATE TRIGGER observe_usage_insert AFTER INSERT ON ${table} BEGIN SELECT observe_usage(); END`,
    );
    t.mock.method(Date, "now", () => {
      phases.push("clock");
      throw failure;
    });
    await assert.rejects(write(f.store, 9), (error) => error === failure);
    assert.deepEqual(phases, ["insert", "clock"]);
    assert.equal(f.rows(table).length, 0);
    assert.equal(f.db.isTransaction, false);
  });
}

for (const action of ["ABORT", "ROLLBACK"]) {
  for (const table of ["model_usage", "turn_usage", "tool_usage"] as const) {
    test(`direct prune ${table} ${action} restores all tables and keeps the primary failure`, async (t) => {
      const f = await usageFixture(t);
      f.seedExpired();
      const before = f.snapshot();
      f.db.exec(
        `CREATE TRIGGER fail_prune BEFORE DELETE ON ${table} BEGIN SELECT RAISE(${action},'fixture original cleanup error'); END`,
      );
      await assert.rejects(f.store.pruneUsage({ beforeTime: 1 }), /fixture original cleanup error/);
      assert.deepEqual(f.snapshot(), before);
      assert.equal(f.db.isTransaction, false);
    });
  }
}

test("direct prune nested BEGIN never ends or mutates the caller transaction", async (t) => {
  const f = await usageFixture(t);
  f.db.exec("BEGIN IMMEDIATE");
  f.seedExpired();
  const before = f.snapshot();
  await assert.rejects(
    f.store.pruneUsage({ beforeTime: 1 }),
    /cannot start a transaction within a transaction/,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, true);
  f.db.exec("ROLLBACK");
});

test("direct prune cleanup double failure retains the original and rollback causes", async (t) => {
  const f = await usageFixture(t);
  f.seedExpired();
  const before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER fail_prune BEFORE DELETE ON turn_usage BEGIN SELECT RAISE(ABORT,'fixture original cleanup error'); END",
  );
  const exec = f.db.exec.bind(f.db);
  const cleanup = new Error("fixture rollback failure");
  t.mock.method(f.db, "exec", (sql: string) => {
    if (sql.trim().toUpperCase() === "ROLLBACK") throw cleanup;
    return exec(sql);
  });
  await assert.rejects(f.store.pruneUsage({ beforeTime: 1 }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /fixture original cleanup error/);
    assert.equal(error.errors[1], cleanup);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });
  assert.equal(f.db.isTransaction, true);
  exec("ROLLBACK");
  assert.deepEqual(f.snapshot(), before);
});
