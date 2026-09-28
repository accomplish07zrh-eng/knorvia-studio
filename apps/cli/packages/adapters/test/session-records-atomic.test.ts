// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { constants, DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import { id, input, permission, recordsFixture, sessions } from "./session-records-fixture.js";

test("concurrent public updates preserve both manual title and permissions", async (t) => {
  const f = recordsFixture(t);
  f.create();
  const first = f.store.updateSession({ id, title: "Custom", titleSource: "custom" });
  const second = f.store.updateSession({ id, permission });
  await Promise.all([first, second]);
  assert.equal(f.row().title, "Custom");
  assert.equal(f.row().title_source, "custom");
  assert.equal(f.row().permission, JSON.stringify(permission));
});

test("generated title guard reads the latest manual edit and rejects all its fields", async (t) => {
  const f = recordsFixture(t);
  f.create({ permission });
  const first = sessions.updateSession(f.db, {
    id,
    title: "Custom",
    titleSource: "custom",
    timeUpdated: 100,
  });
  const guarded = sessions.updateSession(f.db, {
    id,
    title: "Generated",
    titleSource: "generated",
    expectedTitleSources: ["first_input"],
    permission: {},
    timeArchived: 0,
    timeUpdated: 200,
  });
  const [, result] = await Promise.all([first, guarded]);
  assert.equal(result.title, "Custom");
  assert.equal(f.row().title, "Custom");
  assert.equal(f.row().time_archived, null);
  assert.equal(f.row().permission, JSON.stringify(permission));
  assert.equal(f.row().time_updated, 100);
});

test("reverse update order respects completed generation before a manual edit", async (t) => {
  const f = recordsFixture(t);
  f.create();
  const generated = sessions.updateSession(f.db, {
    id,
    title: "Generated",
    titleSource: "generated",
    expectedTitleSources: ["first_input"],
    permission,
  });
  const manual = sessions.updateSession(f.db, { id, title: "Custom", titleSource: "custom" });
  await Promise.all([generated, manual]);
  assert.equal(f.row().title, "Custom");
  assert.equal(f.row().permission, JSON.stringify(permission));
});

test("repository update finishes synchronous persistence before returning its Promise", async (t) => {
  const f = recordsFixture(t);
  f.create();
  const promise = sessions.updateSession(f.db, { id, title: "Saved" });
  assert.ok(promise instanceof Promise);
  const immediately = f.row().title;
  await promise;
  assert.equal(immediately, "Saved");
  assert.equal(f.db.isTransaction, false);
});

test("all current-row reads occur inside the write transaction", async (t) => {
  const f = recordsFixture(t);
  f.create();
  const observations: boolean[] = [];
  f.db.setAuthorizer((action, table) => {
    if (action === constants.SQLITE_READ && table === "session")
      observations.push(f.db.isTransaction);
    return constants.SQLITE_OK;
  });
  await sessions.updateSession(f.db, { id, title: "Saved" });
  f.db.setAuthorizer(null);
  assert.ok(observations.length > 0);
  assert.ok(observations.every(Boolean));
});

test("updates borrow caller transaction and never finish it", async (t) => {
  const f = recordsFixture(t);
  f.create();
  const before = f.row();
  f.db.exec("BEGIN IMMEDIATE");
  await Promise.all([
    sessions.updateSession(f.db, { id, title: "Custom" }),
    sessions.updateSession(f.db, { id, permission }),
  ]);
  assert.equal(f.db.isTransaction, true);
  assert.equal(f.row().title, "Custom");
  f.db.exec("ROLLBACK");
  assert.deepEqual(f.row(), before);
});

for (const borrowed of [false, true]) {
  test(`failed result decoding ${borrowed ? "leaves caller-owned writes" : "rolls back its owned update"}`, async (t) => {
    const f = recordsFixture(t);
    f.create();
    const before = f.row();
    f.db.exec(
      "CREATE TRIGGER corrupt_result AFTER UPDATE OF title ON session BEGIN UPDATE session SET permission='invalid' WHERE id=NEW.id; END",
    );
    if (borrowed) f.db.exec("BEGIN IMMEDIATE");
    await assert.rejects(sessions.updateSession(f.db, { id, title: "Changed" }), SyntaxError);
    assert.equal(f.db.isTransaction, borrowed);
    if (borrowed) {
      assert.equal(f.row().title, "Changed");
      f.db.exec("ROLLBACK");
    }
    assert.deepEqual(f.row(), before);
  });
}

test("deferred foreign-key failure reaches owned COMMIT and restores row and trigger write", async (t) => {
  const f = recordsFixture(t);
  f.create();
  f.db.exec(
    "CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY); CREATE TABLE fixture_child(parent_id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED)",
  );
  const phases: string[] = [];
  f.db.function("record_update", () => {
    phases.push("update");
    return 1;
  });
  f.db.exec(
    "CREATE TRIGGER deferred_update AFTER UPDATE ON session BEGIN SELECT record_update(); INSERT INTO fixture_child VALUES(7); END",
  );
  const before = f.row();
  const exec = f.db.exec.bind(f.db);
  t.mock.method(f.db, "exec", (sql: string) => {
    if (sql.trim().toUpperCase() === "COMMIT") phases.push("commit");
    return exec(sql);
  });
  await assert.rejects(
    sessions.updateSession(f.db, { id, title: "Failed" }),
    /FOREIGN KEY constraint failed/,
  );
  assert.deepEqual(phases, ["update", "commit"]);
  assert.deepEqual(f.row(), before);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM fixture_child").get()?.n, 0);
  assert.equal(f.db.isTransaction, false);
});

for (const action of ["ABORT", "ROLLBACK"]) {
  test(`native ${action} preserves primary error and no standalone residue`, async (t) => {
    const f = recordsFixture(t);
    f.create();
    const before = f.row();
    f.db.exec(
      `CREATE TRIGGER fail_update BEFORE UPDATE ON session BEGIN SELECT RAISE(${action},'fixture primary failure'); END`,
    );
    await assert.rejects(
      sessions.updateSession(f.db, { id, title: "Failed" }),
      /fixture primary failure/,
    );
    assert.deepEqual(f.row(), before);
    assert.equal(f.db.isTransaction, false);
  });
}

test("competing connection fails before reading mutable metadata and can retry after unlock", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "knorvia-records-lock-"));
  const resolved = await realpath(directory);
  assert.ok(path.basename(resolved).startsWith("knorvia-records-lock-"));
  assert.equal(await realpath(path.dirname(resolved)), await realpath(tmpdir()));
  const file = path.join(resolved, "fixture.sqlite");
  const store = new SqliteSessionStore({ dbPath: file });
  const owner = Reflect.get(store, "db") as DatabaseSync;
  const contender = new DatabaseSync(file);
  t.after(async () => {
    contender.close();
    store.close();
    await rm(resolved, { recursive: true });
  });
  contender.exec("PRAGMA busy_timeout=1");
  sessions.createSession(owner, input());
  owner.exec("BEGIN IMMEDIATE");
  owner.prepare("UPDATE session SET title='Locked title',title_source='custom' WHERE id=?").run(id);
  let reads = 0;
  contender.setAuthorizer((action, table) => {
    if (action === constants.SQLITE_READ && table === "session") reads++;
    return constants.SQLITE_OK;
  });
  await assert.rejects(sessions.updateSession(contender, { id, permission }), /database is locked/);
  contender.setAuthorizer(null);
  assert.equal(contender.isTransaction, false);
  owner.exec("COMMIT");
  assert.equal(reads, 0);
  await sessions.updateSession(contender, { id, permission });
  assert.equal(sessions.getSession(owner, id)?.title, "Locked title");
  assert.deepEqual(sessions.getSession(owner, id)?.permission, permission);
});
