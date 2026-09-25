import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { knorviaProviderSchema, knorviaTaskMetaSchema } from "@knorvia/shared";
import { runTasksDatabaseMigrations } from "../src/session/tasksDatabase/migrations.js";

function previousDatabase() {
  const db = new DatabaseSync(":memory:");
  runTasksDatabaseMigrations(db);
  db.prepare("DELETE FROM tasks_schema_migration WHERE id=?").run("0004_agent_identity");
  const insert = db.prepare(`INSERT INTO tasks
    (workspace_key, workspace_path, task_id, title, provider, created_at, updated_at, meta_json)
    VALUES ('workspace', '/example', ?, 'preserve title', ?, 100, 200, ?)`);
  insert.run(
    "old",
    "glm",
    JSON.stringify({ provider: "glm", model: "GLM-5.3", extra: "preserve" }),
  );
  insert.run("retired", "claude", JSON.stringify({ provider: "claude", extra: "preserve" }));
  insert.run("damaged", "glm", "invalid-json");
  db.prepare(`INSERT INTO automations
    (automation_id, cron_expr, prompt, provider, model, workspace_key, workspace_path, created_at, updated_at)
    VALUES ('automation', '* * * * *', 'preserve prompt', 'glm', 'GLM-5.3', 'workspace', '/example', 100, 200)`).run();
  return db;
}

test("identity migration preserves task data, model names, other providers and historical checksums", () => {
  const db = previousDatabase();
  try {
    const ledger = db.prepare("SELECT * FROM tasks_schema_migration ORDER BY id").all();
    const retired = db.prepare("SELECT * FROM tasks WHERE task_id='retired'").get();
    runTasksDatabaseMigrations(db);
    const task = db.prepare("SELECT * FROM tasks WHERE task_id='old'").get()!;
    assert.equal(task.provider, "knorvia");
    assert.equal(task.updated_at, 200);
    assert.equal(task.title, "preserve title");
    assert.deepEqual(JSON.parse(String(task.meta_json)), {
      provider: "knorvia",
      model: "GLM-5.3",
      extra: "preserve",
    });
    assert.deepEqual(db.prepare("SELECT * FROM tasks WHERE task_id='retired'").get(), retired);
    assert.equal(
      db.prepare("SELECT meta_json FROM tasks WHERE task_id='damaged'").get()?.meta_json,
      "invalid-json",
    );
    const automation = db.prepare("SELECT * FROM automations").get()!;
    assert.equal(automation.provider, "knorvia");
    assert.equal(automation.model, "GLM-5.3");
    assert.equal(automation.prompt, "preserve prompt");
    assert.deepEqual(
      db
        .prepare(
          "SELECT * FROM tasks_schema_migration WHERE id != '0004_agent_identity' ORDER BY id",
        )
        .all(),
      ledger,
    );
    const snapshot = db.prepare("SELECT * FROM tasks ORDER BY task_id").all();
    const completedLedger = db.prepare("SELECT * FROM tasks_schema_migration ORDER BY id").all();
    runTasksDatabaseMigrations(db);
    assert.deepEqual(db.prepare("SELECT * FROM tasks ORDER BY task_id").all(), snapshot);
    assert.deepEqual(
      db.prepare("SELECT * FROM tasks_schema_migration ORDER BY id").all(),
      completedLedger,
    );
  } finally {
    db.close();
  }
});

test("a failed identity migration rolls back index updates and remains retryable", () => {
  const db = previousDatabase();
  try {
    db.exec(`CREATE TRIGGER reject_identity BEFORE UPDATE OF meta_json ON tasks
      BEGIN SELECT RAISE(ABORT, 'fixture update failure'); END;`);
    assert.throws(() => runTasksDatabaseMigrations(db), /fixture update failure/);
    assert.equal(
      db.prepare("SELECT provider FROM tasks WHERE task_id='old'").get()?.provider,
      "glm",
    );
    assert.equal(
      db.prepare("SELECT 1 FROM tasks_schema_migration WHERE id='0004_agent_identity'").get(),
      undefined,
    );
    db.exec("DROP TRIGGER reject_identity");
    runTasksDatabaseMigrations(db);
    assert.equal(
      db.prepare("SELECT provider FROM tasks WHERE task_id='old'").get()?.provider,
      "knorvia",
    );
  } finally {
    db.close();
  }
});

test("saved task metadata is normalized while new provider requests use the current identity", () => {
  const meta = {
    taskId: "task",
    traceId: "trace",
    title: "Title",
    workspacePath: "/example",
    createdAt: 1,
    updatedAt: 2,
    mode: "build",
    provider: "glm",
  };
  assert.equal(knorviaTaskMetaSchema.parse(meta).provider, "knorvia");
  assert.equal(knorviaProviderSchema.safeParse("glm").success, false);
  assert.equal(knorviaProviderSchema.parse("knorvia"), "knorvia");
  assert.equal(knorviaTaskMetaSchema.safeParse({ ...meta, provider: "unrelated" }).success, false);
});
