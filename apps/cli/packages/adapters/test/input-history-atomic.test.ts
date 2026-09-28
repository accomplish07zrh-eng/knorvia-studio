// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { constants, DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { InputHistoryAttachment } from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import { fixtureUuid, historyFixture, historyInput, project } from "./input-history-fixture.js";

test("two public calls in one event turn admit only one copy", async (t) => {
  const f = historyFixture(t);
  const values = await Promise.all([
    f.store.recordInputHistory(historyInput()),
    f.store.recordInputHistory(historyInput()),
  ]);
  assert.equal(values.filter(Boolean).length, 1);
  assert.equal(values.filter((value) => value === null).length, 1);
  assert.equal(f.rows().length, 1);
});

test("record finishes its synchronous database work before returning its Promise", async (t) => {
  const f = historyFixture(t);
  const promise = f.record();
  assert.ok(promise instanceof Promise);
  const rowsBeforeAwait = f.rows();
  await promise;
  assert.equal(rowsBeforeAwait.length, 1);
  assert.equal(f.db.isTransaction, false);
});

test("new writes re-read text and attachments after owning the SQLite writer lock", async (t) => {
  const f = historyFixture(t);
  const observations: boolean[] = [];
  f.db.setAuthorizer((action, table, column) => {
    if (action === constants.SQLITE_READ && table === "input_history" && column === "attachments")
      observations.push(f.db.isTransaction);
    return constants.SQLITE_OK;
  });
  await f.record();
  f.db.setAuthorizer(null);
  assert.ok(observations.includes(false), "normal duplicate precheck remains read-only");
  assert.ok(observations.includes(true), "final write admission reads while holding lock");
});

for (const corrupt of [false, true]) {
  test(`a second connection committing ${corrupt ? "bad JSON" : "a duplicate"} before BEGIN prevents insertion`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), "knorvia-history-race-"));
    const resolved = await realpath(directory);
    assert.ok(path.basename(resolved).startsWith("knorvia-history-race-"));
    assert.equal(await realpath(path.dirname(resolved)), await realpath(tmpdir()));
    const file = path.join(resolved, "fixture.sqlite");
    const store = new SqliteSessionStore({ dbPath: file });
    const contender = new DatabaseSync(file);
    t.after(async () => {
      contender.close();
      store.close();
      await rm(resolved, { recursive: true });
    });
    let allocations = 0;
    t.mock.method(crypto, "randomUUID", () => {
      allocations++;
      contender
        .prepare(
          "INSERT INTO input_history(id,project_id,text,kind,time_created,attachments) VALUES(?,?,?,?,?,?)",
        )
        .run("competitor", project, "Fixture", "slash_command", 1, corrupt ? "invalid" : null);
      return fixtureUuid;
    });
    if (corrupt) await assert.rejects(store.recordInputHistory(historyInput()), SyntaxError);
    else assert.equal(await store.recordInputHistory(historyInput()), null);
    assert.equal(allocations, 1);
    assert.deepEqual(
      contender
        .prepare("SELECT id FROM input_history")
        .all()
        .map((row) => row.id),
      ["competitor"],
    );
    assert.equal(contender.isTransaction, false);
    assert.equal((Reflect.get(store, "db") as DatabaseSync).isTransaction, false);
  });
}

test("caller-owned duplicates are no-ops while new writes fail without ending the caller transaction", async (t) => {
  const f = historyFixture(t);
  f.db.exec("BEGIN IMMEDIATE");
  f.seed("caller", { text: "same" });
  const before = f.rows();
  const commands: string[] = [];
  const exec = f.db.exec.bind(f.db);
  t.mock.method(f.db, "exec", (sql: string) => {
    commands.push(sql);
    return exec(sql);
  });
  assert.equal(await f.record({ text: " same ", kind: "slash_command" }), null);
  assert.deepEqual(commands, []);
  await assert.rejects(
    f.record({ text: "different" }),
    /cannot start a transaction within a transaction/,
  );
  assert.equal(commands.length, 1);
  assert.match(commands[0], /^begin\s+immediate$/i);
  assert.equal(f.db.isTransaction, true);
  assert.deepEqual(f.rows(), before);
  exec("ROLLBACK");
  assert.equal(f.rows().length, 0);
});

test("projection and decoding failures leave caller-owned changes and transaction intact", async (t) => {
  const f = historyFixture(t);
  f.db.exec("BEGIN IMMEDIATE");
  f.seed("caller", { attachments: "invalid" });
  const before = f.rows();
  t.mock.method(f.db, "exec", () => {
    throw new Error("No transaction cleanup belongs to this call");
  });
  await assert.rejects(
    f.record({ attachments: [null] as unknown as InputHistoryAttachment[] }),
    TypeError,
  );
  await assert.rejects(f.record(), SyntaxError);
  assert.equal(f.db.isTransaction, true);
  assert.deepEqual(f.rows(), before);
});

for (const operation of ["INSERT", "DELETE"]) {
  for (const action of ["ABORT", "ROLLBACK"]) {
    test(`${operation} RAISE(${action}) retains primary error and all existing history`, async (t) => {
      const f = historyFixture(t);
      for (let index = 1; index <= 100; index++) f.seed(`seed-${index}`, { created: index });
      f.db.exec(
        `CREATE TRIGGER fail_history BEFORE ${operation} ON input_history BEGIN SELECT RAISE(${action},'fixture ${operation} primary'); END`,
      );
      const before = f.rows();
      await assert.rejects(
        f.record({ text: "new", time: { created: 101 } }),
        new RegExp(`fixture ${operation} primary`),
      );
      assert.deepEqual(f.rows(), before);
      assert.equal(f.db.isTransaction, false);
    });
  }
}

test("deferred COMMIT failure rolls back insertion, retention and trigger effects", async (t) => {
  const f = historyFixture(t);
  for (let index = 1; index <= 100; index++) f.seed(`seed-${index}`, { created: index });
  f.db.exec(
    "CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY); CREATE TABLE fixture_child(parent_id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED)",
  );
  const phases: string[] = [];
  f.db.function("observe_prune", () => {
    phases.push("prune");
    return 1;
  });
  f.db.exec(
    "CREATE TRIGGER invalid_history AFTER INSERT ON input_history BEGIN INSERT INTO fixture_child VALUES(7); END; CREATE TRIGGER observe_history_delete AFTER DELETE ON input_history BEGIN SELECT observe_prune(); END",
  );
  const exec = f.db.exec.bind(f.db);
  t.mock.method(f.db, "exec", (sql: string) => {
    if (sql.trim().toUpperCase() === "COMMIT") phases.push("commit");
    return exec(sql);
  });
  const before = f.rows();
  await assert.rejects(
    f.record({ text: "new", time: { created: 101 } }),
    /FOREIGN KEY constraint failed/,
  );
  assert.deepEqual(phases, ["prune", "commit"]);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM fixture_child").get()?.n, 0);
  assert.equal(f.db.isTransaction, false);
});

test("rollback failure retains both causes without pretending to commit", async (t) => {
  const f = historyFixture(t);
  f.db.exec(
    "CREATE TRIGGER fail_history BEFORE INSERT ON input_history BEGIN SELECT RAISE(ABORT,'fixture original'); END",
  );
  const cleanup = new Error("fixture rollback unavailable");
  const exec = f.db.exec.bind(f.db);
  t.mock.method(f.db, "exec", (sql: string) => {
    if (sql.trim().toUpperCase() === "ROLLBACK") throw cleanup;
    return exec(sql);
  });
  await assert.rejects(f.record(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.match(error.errors[0].message, /fixture original/);
    assert.equal(error.errors[1], cleanup);
    assert.equal(error.cause, error.errors[0]);
    return true;
  });
  assert.equal(f.db.isTransaction, true);
  exec("ROLLBACK");
  assert.equal(f.rows().length, 0);
});
