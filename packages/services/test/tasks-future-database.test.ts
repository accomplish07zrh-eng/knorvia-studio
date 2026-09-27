import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { TaskIndexRepo } from "../src/session/taskIndexRepo.js";
import { AutomationRepo } from "../src/session/automationRepo.js";
import {
  areTasksDatabaseMigrationsApplied,
  inspectTasksMigrationKind,
  runTasksDatabaseMigrations,
} from "../src/session/tasksDatabase/migrations.js";
import { markTasksStoragePrepared } from "../src/session/tasksDatabase/prepared.js";
import { prepareTasksIndexStorage } from "../src/session/tasksDatabase/startup.js";

function fixture(
  t: TestContext,
  complete = true,
): { root: string; path: string; db: DatabaseSync } {
  const root = mkdtempSync(join(tmpdir(), "knorvia-future-index-"));
  const path = join(root, "tasks.sqlite");
  const db = new DatabaseSync(path);
  t.after(() => {
    if (db.isOpen) db.close();
    rmSync(root, { recursive: true, force: true });
  });
  runTasksDatabaseMigrations(db);
  if (!complete)
    db.exec("DELETE FROM tasks_schema_migration WHERE id='0005_studio_workflow_schedule'");
  // 排序比已知版本更低同样拒绝，不能只比较最大版本。
  db.prepare("INSERT INTO tasks_schema_migration VALUES(?,?,?)").run(
    "0000_unknown_future",
    "future",
    2,
  );
  return { root, path, db };
}

function newer(error: unknown): boolean {
  return error instanceof Error && (error as Error & { kind?: string }).kind === "newer_database";
}

for (const complete of [true, false]) {
  test(`tasks ledger rejects unknown id with ${complete ? "complete" : "pending"} known migrations`, (t) => {
    const { db, path, root } = fixture(t, complete);
    const before = readFileSync(path);
    assert.throws(() => inspectTasksMigrationKind(db), newer);
    assert.throws(() => areTasksDatabaseMigrationsApplied(db), newer);
    assert.throws(() => runTasksDatabaseMigrations(db), newer);
    assert.equal(db.isTransaction, false);
    assert.equal(db.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
    assert.deepEqual(readFileSync(path), before);
    assert.deepEqual(readdirSync(root), ["tasks.sqlite"]);
  });
}

for (const prepared of [false, true]) {
  for (const name of ["startup", "task-repo", "automation-repo"] as const) {
    test(`tasks ${name} rejects future database before WAL (prepared=${prepared})`, async (t) => {
      const { db, path, root } = fixture(t);
      db.close();
      if (prepared) markTasksStoragePrepared(path);
      const before = readFileSync(path);
      const phases: string[] = [];
      if (name === "startup") {
        await assert.rejects(
          prepareTasksIndexStorage(path, (phase) => phases.push(phase)),
          newer,
        );
      } else {
        const repo = name === "task-repo" ? new TaskIndexRepo(path) : new AutomationRepo(path);
        try {
          await assert.rejects(repo.ensureReady(), newer);
        } finally {
          repo.close();
        }
      }
      assert.equal(phases.includes("ready"), false);
      assert.deepEqual(readFileSync(path), before);
      assert.deepEqual(readdirSync(root), ["tasks.sqlite"]);
      const reopened = new DatabaseSync(path, { readOnly: true });
      try {
        assert.equal(reopened.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
      } finally {
        reopened.close();
      }
    });
  }
}

test("tasks transaction-open runner rechecks unknown ledger despite stale preflight facts", (t) => {
  const { db, path } = fixture(t);
  const before = readFileSync(path);
  db.exec("BEGIN IMMEDIATE");
  assert.throws(
    () =>
      runTasksDatabaseMigrations(db, {
        transactionOpen: true,
        migration: { kind: "none", executedCount: 0, committedCount: 0 },
      }),
    newer,
  );
  assert.equal(db.isTransaction, false);
  assert.deepEqual(readFileSync(path), before);
});

test("tasks snapshot failure in startup leaves journal mode and source bytes unchanged", async (t) => {
  const { db, path } = fixture(t, false);
  db.exec("DELETE FROM tasks_schema_migration WHERE id='0000_unknown_future'");
  // 回退最后一条迁移的 schema，形成真实待迁移夹具。
  db.exec("ALTER TABLE automations DROP COLUMN studio_workflow_id");
  db.close();
  const before = readFileSync(path);
  const cause = new Error("snapshot fixture failure");
  const prepare = DatabaseSync.prototype.prepare;
  const mocked = t.mock.method(
    DatabaseSync.prototype,
    "prepare",
    function (this: DatabaseSync, sql: string) {
      if (sql === "VACUUM INTO ?") throw cause;
      return prepare.call(this, sql);
    },
  );
  await assert.rejects(
    prepareTasksIndexStorage(path, () => {}),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error & { kind: string }).kind, "backup_failed");
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.deepEqual(readFileSync(path), before);
  mocked.mock.restore();
  await prepareTasksIndexStorage(path, () => {});
});
