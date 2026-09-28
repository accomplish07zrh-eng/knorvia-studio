// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { TodoItem } from "@knorvia/contracts";
import { other, owner, storageFixture } from "./entry-todo-fixture.js";

const todo = (content: string): TodoItem => ({ content, status: "pending", priority: "high" });

test("Todo replacement preserves scope, duplicates, position and one shared timestamp", async (t) => {
  const f = await storageFixture(t);
  t.mock.timers.enable({ apis: ["Date"], now: 100 });
  await f.store.updateTodos({ sessionID: other, todos: [todo("other")] });
  const untouched = f.rows("todo");
  t.mock.timers.setTime(200);
  const todos = [todo("repeated"), todo("repeated"), todo("last")];
  await f.store.updateTodos({ sessionID: owner, todos });
  assert.deepEqual(await f.store.readTodos({ sessionID: owner }), todos);
  const rows = f.rows("todo").filter((value) => value.session_id === owner);
  assert.deepEqual(
    rows.map((value) => [value.position, value.time_created, value.time_updated]),
    [
      [0, 200, 200],
      [1, 200, 200],
      [2, 200, 200],
    ],
  );
  assert.deepEqual(
    f.rows("todo").filter((value) => value.session_id === other),
    untouched,
  );
  assert.equal((await f.store.getSession(owner))?.time.updated, 200);
});

test("empty Todo replacement still touches session and writes happen before Promise resolution", async (t) => {
  const f = await storageFixture(t);
  t.mock.timers.enable({ apis: ["Date"], now: 100 });
  const pending = f.store.updateTodos({ sessionID: owner, todos: [todo("written")] });
  assert.equal(f.rows("todo").length, 1);
  await pending;
  t.mock.timers.setTime(200);
  await f.store.updateTodos({ sessionID: owner, todos: [] });
  assert.deepEqual(await f.store.readTodos({ sessionID: owner }), []);
  assert.equal((await f.store.getSession(owner))?.time.updated, 200);
  t.mock.timers.setTime(0);
  await f.store.updateTodos({ sessionID: owner, todos: [todo("past")] });
  assert.equal((await f.store.getSession(owner))?.time.updated, 200);
});

test("Todo reads sort by stored position without newly validating field enums", async (t) => {
  const f = await storageFixture(t);
  await f.store.updateTodos({ sessionID: owner, todos: [todo("first"), todo("second")] });
  f.db
    .prepare("UPDATE todo SET position=7,status='future',priority='future' WHERE content='first'")
    .run();
  assert.deepEqual(await f.store.readTodos({ sessionID: owner }), [
    todo("second"),
    { content: "first", status: "future", priority: "future" },
  ]);
});

for (const failure of ["ABORT", "ROLLBACK"] as const)
  test(`Todo second insert ${failure} retains old rows, session time and original error`, async (t) => {
    const f = await storageFixture(t);
    await f.store.updateTodos({ sessionID: owner, todos: [todo("original")] });
    const before = f.snapshot();
    f.db.exec(
      `CREATE TRIGGER fail_todo_insert BEFORE INSERT ON todo WHEN NEW.position=1 BEGIN SELECT RAISE(${failure},'todo-original-failure'); END`,
    );
    await assert.rejects(
      f.store.updateTodos({ sessionID: owner, todos: [todo("new-first"), todo("new-second")] }),
      /todo-original-failure/,
    );
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
  });

test("Todo touch failure rolls the replacement back", async (t) => {
  const f = await storageFixture(t);
  await f.store.updateTodos({ sessionID: owner, todos: [todo("original")] });
  const before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER fail_todo_touch BEFORE UPDATE OF time_updated ON session BEGIN SELECT RAISE(ABORT,'todo-touch-failure'); END",
  );
  await assert.rejects(
    f.store.updateTodos({ sessionID: owner, todos: [todo("new")] }),
    /todo-touch-failure/,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("Todo cannot acquire a foreign transaction or roll back its pending work", async (t) => {
  const f = await storageFixture(t);
  f.db.exec("BEGIN IMMEDIATE");
  f.db.prepare("UPDATE session SET title='Pending title' WHERE id=?").run(owner);
  const pending = f.snapshot();
  await assert.rejects(
    f.store.updateTodos({ sessionID: owner, todos: [todo("new")] }),
    /transaction/i,
  );
  assert.equal(f.db.isTransaction, true);
  assert.deepEqual(f.snapshot(), pending);
  f.db.exec("ROLLBACK");
});

for (const stage of ["BEGIN IMMEDIATE", "COMMIT"])
  test(`Todo ${stage} failure preserves all prior state and cleanup ownership`, async (t) => {
    const f = await storageFixture(t);
    await f.store.updateTodos({ sessionID: owner, todos: [todo("original")] });
    const before = f.snapshot(),
      failure = new Error(`fixture ${stage}`),
      calls: string[] = [];
    const nativeExec = f.db.exec.bind(f.db);
    t.mock.method(f.db, "exec", (sql: string) => {
      calls.push(sql.trim().toUpperCase());
      if (sql.trim().toUpperCase() === stage) throw failure;
      nativeExec(sql);
    });
    await assert.rejects(
      f.store.updateTodos({ sessionID: owner, todos: [todo("new")] }),
      (error) => error === failure,
    );
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
    assert.deepEqual(
      calls,
      stage === "COMMIT" ? ["BEGIN IMMEDIATE", "COMMIT", "ROLLBACK"] : ["BEGIN IMMEDIATE"],
    );
  });

test("Todo rollback failure preserves both the write failure and cleanup cause", async (t) => {
  const f = await storageFixture(t),
    cleanup = new Error("rollback fixture failure");
  f.db.exec(
    "CREATE TRIGGER fail_todo_before_cleanup BEFORE INSERT ON todo BEGIN SELECT RAISE(ABORT,'write-before-cleanup-failure'); END",
  );
  const nativeExec = f.db.exec.bind(f.db);
  const patched = t.mock.method(f.db, "exec", (sql: string) => {
    if (sql.trim().toUpperCase() === "ROLLBACK") throw cleanup;
    nativeExec(sql);
  });
  try {
    await assert.rejects(
      f.store.updateTodos({ sessionID: owner, todos: [todo("new")] }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.match(String(error.errors[0]), /write-before-cleanup-failure/);
        assert.equal(error.errors[1], cleanup);
        return true;
      },
    );
    assert.equal(f.db.isTransaction, true);
  } finally {
    patched.mock.restore();
    if (f.db.isTransaction) f.db.exec("ROLLBACK");
  }
});
