// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { constants } from "node:sqlite";
import test from "node:test";
import { messageFixture, messageID, owner, part, partID, user } from "./message-storage-fixture.js";

for (const table of ["message", "part"] as const) {
  for (const existing of [false, true]) {
    test(`${table} ${existing ? "update" : "insert"} and failed touch roll back together`, async (t) => {
      const f = await messageFixture(t);
      if (table === "part") await f.store.saveMessage(user());
      const write = () =>
        table === "message"
          ? f.store.saveMessage({ ...user(), metadata: { updated: true }, time: { created: 100 } })
          : f.store.savePart({ ...part(), text: "Updated" });
      if (existing) {
        if (table === "message") await f.store.saveMessage(user());
        else await f.store.savePart(part());
      }
      const before = f.snapshot();
      f.db.exec(
        "CREATE TRIGGER touch_failure BEFORE UPDATE OF time_updated ON session BEGIN SELECT RAISE(ABORT,'message fixture touch'); END",
      );
      await assert.rejects(write(), /message fixture touch/);
      assert.deepEqual(f.snapshot(), before);
      assert.equal(f.db.isTransaction, false);
    });
  }

  test(`${table} deferred foreign-key failure restores original rows and trigger writes`, async (t) => {
    const f = await messageFixture(t);
    if (table === "part") await f.store.saveMessage(user());
    f.db.exec(
      "CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY); CREATE TABLE fixture_child(parent_id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED)",
    );
    const phases: string[] = [];
    f.db.function("record_fixture_insert", () => {
      phases.push("insert");
      return 1;
    });
    f.db.exec(
      `CREATE TRIGGER deferred_failure AFTER INSERT ON ${table} BEGIN SELECT record_fixture_insert(); INSERT INTO fixture_child VALUES(7); END`,
    );
    const before = f.snapshot();
    const exec = f.db.exec.bind(f.db);
    t.mock.method(f.db, "exec", (sql: string) => {
      if (sql.trim().toUpperCase() === "COMMIT") phases.push("commit");
      return exec(sql);
    });
    await assert.rejects(
      table === "message" ? f.store.saveMessage(user()) : f.store.savePart(part()),
      /FOREIGN KEY constraint failed/,
    );
    assert.deepEqual(phases, ["insert", "commit"]);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM fixture_child").get()?.count, 0);
    assert.equal(f.db.isTransaction, false);
  });

  test(`${table} joins caller transaction and caller owns ordinary failure cleanup`, async (t) => {
    const f = await messageFixture(t);
    if (table === "part") await f.store.saveMessage(user());
    const before = f.snapshot();
    f.db.exec("BEGIN IMMEDIATE");
    f.db.exec(
      "CREATE TRIGGER touch_failure BEFORE UPDATE OF time_updated ON session BEGIN SELECT RAISE(ABORT,'borrowed touch'); END",
    );
    await assert.rejects(
      table === "message" ? f.store.saveMessage(user()) : f.store.savePart(part()),
      /borrowed touch/,
    );
    assert.equal(f.db.isTransaction, true);
    assert.equal(f.rows(table).length, 1);
    f.db.exec("ROLLBACK");
    assert.deepEqual(f.snapshot(), before);
  });

  test(`${table} automatic rollback propagates original failure without a second rollback`, async (t) => {
    const f = await messageFixture(t);
    if (table === "part") await f.store.saveMessage(user());
    f.db.exec(
      `CREATE TRIGGER abort_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ROLLBACK,'message primary failure'); END`,
    );
    const before = f.snapshot();
    await assert.rejects(
      table === "message" ? f.store.saveMessage(user()) : f.store.savePart(part()),
      /message primary failure/,
    );
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });
}

test("copy reads occur inside the same owned write transaction as target persistence", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  await f.store.savePart(part());
  const reads: Array<{ table: string; inTransaction: boolean }> = [];
  f.db.setAuthorizer((action, table, column) => {
    if (
      action === constants.SQLITE_READ &&
      (table === "message" || table === "part") &&
      column === "data"
    ) {
      reads.push({ table, inTransaction: f.db.isTransaction });
    }
    return constants.SQLITE_OK;
  });
  await f.store.saveMessage(user("copy-message" as typeof messageID), {
    id: messageID,
    sessionID: owner,
  });
  await f.store.savePart(part("copy-part" as typeof partID), { id: partID, sessionID: owner });
  f.db.setAuthorizer(null);
  assert.deepEqual([...new Set(reads.map((read) => read.table))], ["message", "part"]);
  assert.ok(reads.every((read) => read.inTransaction));
});
