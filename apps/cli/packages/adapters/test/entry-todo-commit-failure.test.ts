// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { entry, owner, storageFixture } from "./entry-todo-fixture.js";

for (const target of ["session_entry", "todo"] as const)
  test(`${target} real deferred constraint failure at COMMIT rolls back all writes`, async (t) => {
    const f = await storageFixture(t);
    await f.store.updateTodos({
      sessionID: owner,
      todos: [{ content: "original", status: "pending", priority: "high" }],
    });
    const before = f.snapshot(),
      phases: string[] = [];
    assert.equal(f.db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
    f.db.exec(
      "CREATE TABLE fixture_parent(id INTEGER PRIMARY KEY); CREATE TABLE fixture_child(parent_id INTEGER REFERENCES fixture_parent(id) DEFERRABLE INITIALLY DEFERRED)",
    );
    f.db.function("observe_deferred_write", () => {
      phases.push("write");
      return null;
    });
    f.db.exec(
      `CREATE TRIGGER fail_deferred AFTER INSERT ON ${target} BEGIN INSERT INTO fixture_child VALUES(7); SELECT observe_deferred_write(); END`,
    );
    const nativeExec = f.db.exec.bind(f.db);
    t.mock.method(f.db, "exec", (sql: string) => {
      if (sql.trim().toUpperCase() === "COMMIT") phases.push("commit");
      nativeExec(sql);
    });
    await assert.rejects(
      target === "session_entry"
        ? f.store.saveSessionEntry(entry())
        : f.store.updateTodos({
            sessionID: owner,
            todos: [{ content: "new", status: "pending", priority: "high" }],
          }),
      /FOREIGN KEY constraint failed/,
    );
    assert.deepEqual(phases, ["write", "commit"]);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM fixture_child").get()?.count, 0);
    assert.equal(f.db.isTransaction, false);
  });
