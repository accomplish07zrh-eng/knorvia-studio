import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { StudioDatabase } from "../src/studio-runtime/adapters/studioDatabase.js";
import { inspectTasksMigrationKind } from "../src/session/tasksDatabase/migrations.js";
import {
  restoreSqliteSnapshot,
  sqliteSnapshotPath,
} from "../src/session/tasksDatabase/sqliteSnapshot.js";
import { prepareTasksIndexStorage } from "../src/session/tasksDatabase/startup.js";
import {
  generatePreviousReleaseFixtures,
  readPreviousReleaseFixture,
} from "./fixtures/generate-previous-release-fixtures.js";

/** 升级保护验收（见 specs/knorvia-upgrade-protection.md）：迁移前备份、失败停机与恢复。 */

interface StudioFileState {
  version: number;
  journalMode: string;
  entities: unknown[];
  meta: unknown[];
}

function workDirectory(t: TestContext, prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

/** 夹具只读源：所有用例都复制到临时目录后再动手，绝不改动夹具本身。 */
function copyStudioFixture(t: TestContext, directory: string): string {
  const fixture = generatePreviousReleaseFixtures(join(directory, "fixture"));
  const path = join(directory, "data", "studio", "studio.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  copyFileSync(fixture.studio, path);
  return path;
}

function readStudioFile(path: string): StudioFileState {
  const db = new DatabaseSync(path);
  try {
    return {
      version: Number(db.prepare("PRAGMA user_version").get()?.user_version),
      journalMode: String(db.prepare("PRAGMA journal_mode").get()?.journal_mode),
      entities: db
        .prepare("SELECT kind,id,scope,value,sequence FROM studio_entities ORDER BY kind,id")
        .all(),
      meta: db.prepare("SELECT key,value FROM studio_meta ORDER BY key").all(),
    };
  } finally {
    db.close();
  }
}

function backupFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => /\.pre-.*\.bak(?:-\d+)?$/u.test(name))
    .sort();
}

test("上一版本 Studio 主库迁移后记录、运行历史、已完成节点与审批状态逐条保留", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-");
  const path = copyStudioFixture(t, directory);
  // 数据根里的其它文件（设置与工作区文件）不属于迁移对象，必须原样保留。
  const settingsPath = join(directory, "data", ".knorvia-studio", "v2", "setting.json");
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, '{"theme":"light"}');
  const workspaceFile = join(directory, "data", "workspace", "demo", "note.txt");
  mkdirSync(dirname(workspaceFile), { recursive: true });
  writeFileSync(workspaceFile, "示例工作区文件");
  const expected = readPreviousReleaseFixture();

  const db = new StudioDatabase(path);
  try {
    assert.equal(db.revision(), 42);
    for (const entity of expected.studio.entities)
      assert.deepEqual(
        db.read(entity.kind, entity.id),
        entity.value,
        `${entity.kind}/${entity.id}`,
      );
    // v1 的并列 sequence 按插入顺序重排；消息内容与条数不变。
    assert.deepEqual(
      db.list<{ id: string; sequence: number }>("message", { scope: "demo-chat", limit: 100 }),
      [
        {
          id: "message-4",
          role: "assistant",
          text: "示例回答二",
          createdAt: 1700000004000,
          sequence: 7,
        },
        {
          id: "message-3",
          role: "user",
          text: "示例提问二",
          createdAt: 1700000003000,
          sequence: 6,
        },
        {
          id: "message-2",
          role: "assistant",
          text: "示例回答一",
          createdAt: 1700000002000,
          usage: { inputTokens: 12, outputTokens: 34 },
          sequence: 5,
        },
        {
          id: "message-1",
          role: "user",
          text: "示例提问一",
          createdAt: 1700000001000,
          sequence: 4,
        },
      ],
    );
    assert.deepEqual(
      db.list<{ id: string }>("interaction", { pendingInteractionsOnly: true, scope: "demo-chat" }),
      [expected.studio.entities.find((entity) => entity.id === "interaction-approval")!.value],
    );
    assert.deepEqual(
      db
        .list<{ id: string }>("run", { unresolvedRunsOnly: true, scope: "demo-chat" })
        .map((r) => r.id),
      ["run-interrupted"],
    );
    // 已完成节点与其投影：历史步骤结果按分条记录保留。
    assert.deepEqual(db.read("step-result", "run-completed:collect"), {
      id: "collect",
      status: "succeeded",
      text: "示例步骤输出",
      changesSummary: "1 file changed",
    });
  } finally {
    db.close();
  }

  const migrated = readStudioFile(path);
  assert.equal(migrated.version, 2);
  assert.equal(readFileSync(settingsPath, "utf8"), '{"theme":"light"}');
  assert.equal(readFileSync(workspaceFile, "utf8"), "示例工作区文件");
  assert.equal(backupFiles(dirname(path)).length, 1);

  // 重开两次：内容不变、版本不变、不重复备份（幂等）。
  for (const _ of [1, 2]) {
    const reopened = new StudioDatabase(path);
    try {
      for (const entity of expected.studio.entities)
        assert.deepEqual(reopened.read(entity.kind, entity.id), entity.value);
    } finally {
      reopened.close();
    }
  }
  assert.deepEqual(readStudioFile(path), migrated);
  assert.equal(backupFiles(dirname(path)).length, 1);
});

test("迁移过程不触发任务执行：不占用执行租约、排队运行仍然排队", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-quiet-");
  const path = copyStudioFixture(t, directory);
  const db = new StudioDatabase(path);
  try {
    assert.deepEqual(
      db.queuedRuns().map((run) => run.id),
      ["run-queued"],
    );
    assert.equal(db.owns("migration", 1_700_000_000_000), false);
    assert.deepEqual(
      db
        .list<{ id: string; state: string }>("run", { scope: "demo-chat", limit: 100 })
        .map((r) => [r.id, r.state]),
      [
        ["run-queued", "queued"],
        ["run-interrupted", "interrupted"],
        ["run-completed", "completed"],
      ],
    );
    // 迁移只写版本与游标，不创建任何执行者租约行。
    assert.deepEqual(
      db.list("active").map((row) => row),
      [{ id: "run-queued", targetId: "demo-chat", enqueuedAt: 1700000008001 }],
    );
  } finally {
    db.close();
  }
  assert.deepEqual(
    readStudioFile(path).meta.map((row) => (row as { key: string }).key),
    ["revision", "sequence"],
  );
});

test("迁移前备份是一份合法且与迁移前逐条一致的快照", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-backup-");
  const path = copyStudioFixture(t, directory);
  const before = readStudioFile(path);

  const db = new StudioDatabase(path);
  db.close();

  const backups = backupFiles(dirname(path));
  assert.equal(backups.length, 1);
  assert.match(backups[0]!, /^studio\.sqlite\.pre-v1\.\d{8}T\d{9}Z\.bak$/u);
  const snapshotPath = join(dirname(path), backups[0]!);
  const snapshot = readStudioFile(snapshotPath);
  assert.equal(snapshot.version, 1);
  assert.deepEqual(snapshot.entities, before.entities);
  assert.deepEqual(snapshot.meta, before.meta);

  const raw = new DatabaseSync(snapshotPath);
  try {
    assert.equal(raw.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.equal(
      raw.prepare("SELECT count(*) AS count FROM studio_entities").get()?.count,
      before.entities.length,
    );
  } finally {
    raw.close();
  }
});

test("版本过新的 Studio 主库在写入前被拒绝，且不产生备份", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-newer-");
  const path = copyStudioFixture(t, directory);
  const raw = new DatabaseSync(path);
  raw.exec("PRAGMA user_version=3");
  raw.close();
  const before = readStudioFile(path);

  assert.throws(() => new StudioDatabase(path), /版本较新/u);

  const after = readStudioFile(path);
  assert.equal(after.version, 3);
  assert.deepEqual(after.entities, before.entities);
  // 连日志模式都不改：被拒绝的库保持未触碰。
  assert.equal(after.journalMode, "delete");
  assert.deepEqual(backupFiles(dirname(path)), []);
});

test("Studio 迁移失败时原库与迁移前备份保持原样，修复后可重试", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-failure-");
  const path = copyStudioFixture(t, directory);
  const before = readStudioFile(path);
  const raw = new DatabaseSync(path);
  raw.exec(`CREATE TRIGGER reject_studio_sequence BEFORE UPDATE OF sequence ON studio_entities
    BEGIN SELECT RAISE(ABORT, 'fixture migration failure'); END;`);
  raw.close();

  assert.throws(() => new StudioDatabase(path), /fixture migration failure/u);

  const failed = readStudioFile(path);
  assert.equal(failed.version, 1);
  assert.deepEqual(failed.entities, before.entities);
  assert.deepEqual(failed.meta, before.meta);
  const backups = backupFiles(dirname(path));
  assert.equal(backups.length, 1);
  assert.deepEqual(readStudioFile(join(dirname(path), backups[0]!)).entities, before.entities);

  const repair = new DatabaseSync(path);
  repair.exec("DROP TRIGGER reject_studio_sequence");
  repair.close();
  const retried = new StudioDatabase(path);
  try {
    assert.equal(retried.revision(), 42);
    assert.equal(retried.read("message", "message-2") !== undefined, true);
  } finally {
    retried.close();
  }
  assert.equal(readStudioFile(path).version, 2);
});

test("迁移被强杀中断后原库仍可读，必要时可从迁移前备份恢复", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-interrupt-");
  const path = copyStudioFixture(t, directory);
  const before = readStudioFile(path);
  const first = new StudioDatabase(path);
  first.close();
  const migratedState = readStudioFile(path);
  const backups = backupFiles(dirname(path));
  assert.equal(backups.length, 1);
  const snapshotPath = join(dirname(path), backups[0]!);

  // 子进程在事务内被强杀：已提交的数据保留，未提交的迁移不生效。
  const childScript = join(directory, "interrupt.mjs");
  const sentinelPath = join(directory, "interrupt.json");
  writeFileSync(
    childScript,
    [
      'import { DatabaseSync } from "node:sqlite";',
      'import { writeFileSync } from "node:fs";',
      "const db = new DatabaseSync(process.argv[2]);",
      'db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");',
      "db.exec(\"INSERT OR REPLACE INTO studio_meta VALUES('interrupted-probe','1')\");",
      'db.exec("BEGIN IMMEDIATE");',
      'db.exec("UPDATE studio_entities SET sequence=sequence+1000");',
      'db.exec("PRAGMA user_version=2");',
      'const moved = db.prepare("SELECT count(*) AS count FROM studio_entities WHERE sequence>1000").get();',
      "writeFileSync(process.argv[3], JSON.stringify({ moved: Number(moved.count) }));",
      "// 不提交、不关闭：等价于进程被强杀。",
      "process.exit(0);",
      "",
    ].join("\n"),
  );
  const child = spawnSync(process.execPath, [childScript, path, sentinelPath], {
    encoding: "utf8",
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(readFileSync(sentinelPath, "utf8")).moved, before.entities.length);

  // 中断后回到打开前的状态：迁移后的数据不变、未提交的自增不生效。
  const interrupted = readStudioFile(path);
  assert.equal(interrupted.version, 2);
  assert.deepEqual(interrupted.entities, migratedState.entities);
  assert.equal(interrupted.journalMode, "wal");
  assert.ok(
    interrupted.meta.some((row) => (row as { key: string }).key === "interrupted-probe"),
    "已提交的数据必须保留",
  );

  // 即使主库被迁移结果写坏，也能用迁移前备份回到迁移前状态。
  const damaged = new DatabaseSync(path);
  damaged.exec("DELETE FROM studio_entities WHERE kind='interaction'");
  damaged.exec("PRAGMA user_version=2");
  damaged.close();
  restoreSqliteSnapshot(snapshotPath, path);
  const restored = readStudioFile(path);
  assert.equal(restored.version, 1);
  assert.deepEqual(restored.entities, before.entities);

  const reopened = new StudioDatabase(path);
  try {
    assert.equal(reopened.revision(), 42);
    assert.equal(reopened.read("message", "message-1") !== undefined, true);
  } finally {
    reopened.close();
  }
  assert.equal(readStudioFile(path).version, 2);
});

test("备份目标不可写时停止迁移，且排除故障后可重试", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-unwritable-");
  const path = copyStudioFixture(t, directory);
  const before = readStudioFile(path);
  const pinned = Date.UTC(2026, 0, 2, 3, 4, 5, 678);
  t.mock.method(Date, "now", () => pinned);
  // 用目录占用备份路径：VACUUM INTO 无法写出一致快照，等于备份目标不可写。
  const blocked = sqliteSnapshotPath(path, "v1", pinned);
  mkdirSync(blocked);

  assert.throws(
    () => new StudioDatabase(path),
    (error: unknown) => {
      assert.equal((error as { kind?: string }).kind, "backup_failed");
      assert.match((error as Error).message, /迁移前备份失败/u);
      assert.match((error as Error).message, /\.pre-v1\./u);
      return true;
    },
  );

  const after = readStudioFile(path);
  assert.equal(after.version, 1);
  assert.deepEqual(after.entities, before.entities);
  assert.equal(after.journalMode, "delete");

  rmSync(blocked, { recursive: true, force: true });
  const retried = new StudioDatabase(path);
  retried.close();
  assert.equal(readStudioFile(path).version, 2);
  assert.deepEqual(backupFiles(dirname(path)), [`studio.sqlite.pre-v1.20260102T030405678Z.bak`]);
});

test("备份写入抛出底层错误时同样停止迁移并保留首因", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-io-");
  const path = copyStudioFixture(t, directory);
  const before = readStudioFile(path);
  const prepare = DatabaseSync.prototype.prepare;
  const failure = new Error("fixture io failure");
  const mocked = t.mock.method(
    DatabaseSync.prototype,
    "prepare",
    function (this: DatabaseSync, sql: string, ...rest: never[]) {
      if (String(sql).includes("VACUUM INTO")) throw failure;
      return prepare.call(this, sql, ...rest);
    },
  );

  assert.throws(
    () => new StudioDatabase(path),
    (error: unknown) => {
      assert.equal((error as { kind?: string }).kind, "backup_failed");
      assert.equal((error as { cause?: unknown }).cause, failure);
      return true;
    },
  );
  assert.equal(readStudioFile(path).version, 1);
  assert.deepEqual(readStudioFile(path).entities, before.entities);

  mocked.mock.restore();
  const retried = new StudioDatabase(path);
  retried.close();
  assert.equal(readStudioFile(path).version, 2);
});

test("新建空库不产生备份文件", (t) => {
  const directory = workDirectory(t, "knorvia-studio-upgrade-fresh-");
  const path = join(directory, "studio", "studio.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const created = new StudioDatabase(path);
  created.close();
  assert.deepEqual(backupFiles(dirname(path)), []);
  const reopened = new StudioDatabase(path);
  reopened.close();
  assert.deepEqual(backupFiles(dirname(path)), []);
  assert.equal(readStudioFile(path).version, 2);
});

test("任务索引升级前先写迁移前备份，账本与业务行保持保留", async (t) => {
  const directory = workDirectory(t, "knorvia-tasks-upgrade-");
  const fixture = generatePreviousReleaseFixtures(join(directory, "fixture"));
  const path = join(directory, "v2", "tasks-index.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  copyFileSync(fixture.tasksIndex, path);
  const before = new DatabaseSync(path);
  const beforeTasks = before.prepare("SELECT * FROM tasks ORDER BY task_id").all();
  const beforeAutomations = before.prepare("SELECT * FROM automations").all();
  assert.equal(inspectTasksMigrationKind(before), "upgrade");
  before.close();

  const phases: string[] = [];
  await prepareTasksIndexStorage(path, (phase) => phases.push(phase));
  assert.equal(phases.at(-1), "ready");
  assert.equal(backupFiles(dirname(path)).length, 1);
  const snapshotPath = join(dirname(path), backupFiles(dirname(path))[0]!);
  assert.match(
    backupFiles(dirname(path))[0]!,
    /^tasks-index\.sqlite\.pre-0002_provider_selection\./u,
  );

  const after = new DatabaseSync(path);
  try {
    assert.equal(inspectTasksMigrationKind(after), "none");
    assert.deepEqual(
      after.prepare("SELECT id FROM tasks_schema_migration ORDER BY id").all().length,
      5,
    );
    const visible = after.prepare("SELECT * FROM tasks WHERE task_id='task-visible'").get()!;
    const damaged = after.prepare("SELECT * FROM tasks WHERE task_id='task-damaged'").get()!;
    const beforeVisible = beforeTasks.find(
      (row) => (row as { task_id: string }).task_id === "task-visible",
    )!;
    // 0004 只改身份字段，历史时间戳与正文保留；坏 JSON 行不触碰。
    assert.equal(visible.provider, "knorvia");
    assert.equal(visible.updated_at, beforeVisible.updated_at);
    assert.equal(JSON.parse(String(visible.meta_json)).provider, "knorvia");
    assert.equal(JSON.parse(String(visible.meta_json)).extra, "preserve");
    assert.equal(damaged.provider, "knorvia");
    assert.equal(damaged.meta_json, "invalid-json");
    const automation = after.prepare("SELECT * FROM automations").get()!;
    assert.equal(automation.provider, "knorvia");
    // 0003 归正官方 GLM 名称，模型选择之外的旧列与提示词原样保留。
    assert.equal(JSON.parse(String(automation.model_selection)).modelId, "GLM-5.3");
    assert.equal(automation.prompt, beforeAutomations[0]!.prompt);
    assert.equal(automation.model, beforeAutomations[0]!.model);
  } finally {
    after.close();
  }

  const snapshot = new DatabaseSync(snapshotPath);
  try {
    assert.equal(snapshot.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.deepEqual(snapshot.prepare("SELECT * FROM tasks ORDER BY task_id").all(), beforeTasks);
    assert.deepEqual(
      snapshot
        .prepare("SELECT id FROM tasks_schema_migration ORDER BY id")
        .all()
        .map((row) => String(row.id)),
      ["0001_adopt_task_schema", "0002_provider_selection"],
    );
  } finally {
    snapshot.close();
  }
});

test("任务索引备份失败时停止迁移，原库不变且可重试", async (t) => {
  const directory = workDirectory(t, "knorvia-tasks-upgrade-unwritable-");
  const fixture = generatePreviousReleaseFixtures(join(directory, "fixture"));
  const path = join(directory, "v2", "tasks-index.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  copyFileSync(fixture.tasksIndex, path);
  const pinned = Date.UTC(2026, 0, 2, 3, 4, 5, 678);
  t.mock.method(Date, "now", () => pinned);
  mkdirSync(sqliteSnapshotPath(path, "0002_provider_selection", pinned));

  await assert.rejects(
    prepareTasksIndexStorage(path, () => {}),
    (error: unknown) => {
      assert.equal((error as { kind?: string }).kind, "backup_failed");
      return true;
    },
  );
  const untouched = new DatabaseSync(path);
  try {
    assert.equal(inspectTasksMigrationKind(untouched), "upgrade");
    assert.equal(untouched.prepare("SELECT count(*) AS count FROM tasks").get()?.count, 2);
  } finally {
    untouched.close();
  }

  rmSync(sqliteSnapshotPath(path, "0002_provider_selection", pinned), {
    recursive: true,
    force: true,
  });
  await prepareTasksIndexStorage(path, () => {});
  const migrated = new DatabaseSync(path);
  try {
    assert.equal(inspectTasksMigrationKind(migrated), "none");
    assert.equal(backupFiles(dirname(path)).length, 1);
  } finally {
    migrated.close();
  }
});
