import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { SqliteSessionMigrationError } from "../src/storage/session-store/errors.js";
import {
  runSqliteSessionMigrations,
  runSqliteSessionMigrationsAsync,
} from "../src/storage/session-store/migration-runner.js";
import { SQLITE_MIGRATIONS } from "../src/storage/session-store/migrations.js";

function fixture(t: TestContext): { root: string; path: string; db: DatabaseSync } {
  const root = mkdtempSync(join(tmpdir(), "knorvia-session-upgrade-"));
  const path = join(root, "sessions.sqlite");
  const db = new DatabaseSync(path);
  t.after(() => {
    if (db.isOpen) db.close();
    rmSync(root, { recursive: true, force: true });
  });
  db.exec(`CREATE TABLE schema_migration (
    id TEXT PRIMARY KEY, checksum TEXT NOT NULL, app_version TEXT, time_applied INTEGER NOT NULL
  )`);
  const initial = SQLITE_MIGRATIONS[0]!;
  db.exec(initial.sql);
  db.prepare("INSERT INTO schema_migration VALUES (?,?,?,?)").run(
    initial.id,
    createHash("sha256").update(initial.sql.trim()).digest("hex"),
    initial.appVersion,
    1,
  );
  db.exec(`INSERT INTO session(id,project_id,slug,directory,title,version,time_created,time_updated)
    VALUES ('retained-session','fixture-project','history','/fixture','My previous session','1',1,1)`);
  return { root, path, db };
}

function backups(root: string): string[] {
  return readdirSync(root).filter((name) => name.includes(".pre-"));
}

function readRows(db: DatabaseSync): unknown[] {
  return db.prepare("SELECT id,title,time_created FROM session ORDER BY id").all();
}

test("Agent snapshot contains committed WAL session data and reopening is idempotent", (t) => {
  const { db, root, path } = fixture(t);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
  db.exec("UPDATE session SET title='Committed in WAL' WHERE id='retained-session'");
  assert.ok(readFileSync(`${path}-wal`).length > 0);
  const rows = readRows(db);
  runSqliteSessionMigrations(db, path);
  const names = backups(root);
  assert.equal(names.length, 1);
  assert.match(names[0]!, /\.pre-0001_base_session_store\./);
  const snapshot = new DatabaseSync(join(root, names[0]!), { readOnly: true });
  try {
    assert.deepEqual(readRows(snapshot), rows);
    assert.equal(snapshot.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.equal(snapshot.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n, 1);
  } finally {
    snapshot.close();
  }
  assert.deepEqual(readRows(db), rows);
  db.close();
  for (let attempt = 0; attempt < 2; attempt++) {
    const reopened = new DatabaseSync(path);
    try {
      runSqliteSessionMigrations(reopened, path);
      assert.deepEqual(readRows(reopened), rows);
      assert.equal(
        reopened.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n,
        SQLITE_MIGRATIONS.length,
      );
    } finally {
      reopened.close();
    }
  }
  assert.deepEqual(backups(root), names);
});

for (const asynchronous of [false, true]) {
  test(`Agent ${asynchronous ? "async" : "sync"} rejects any unknown id before WAL with zero writes`, async (t) => {
    const { db, root, path } = fixture(t);
    db.prepare("INSERT INTO schema_migration VALUES(?,?,?,?)").run(
      "0000_unknown_future",
      "future",
      "2",
      2,
    );
    const before = readFileSync(path);
    const phases: string[] = [];
    const check = (error: unknown) =>
      error instanceof SqliteSessionMigrationError && error.kind === "newer_database";
    if (asynchronous)
      await assert.rejects(
        runSqliteSessionMigrationsAsync(db, path, {
          onProgress: async (progress) => {
            phases.push(progress.phase);
          },
        }),
        check,
      );
    else assert.throws(() => runSqliteSessionMigrations(db, path), check);
    assert.equal(db.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
    assert.equal(db.isTransaction, false);
    assert.equal(phases.includes("ready"), false);
    assert.deepEqual(readFileSync(path), before);
    assert.deepEqual(backups(root), []);
  });
}

test("Agent backup IO failure retains cause and stops before WAL, then retries safely", async (t) => {
  const { db, path, root } = fixture(t);
  const before = readFileSync(path);
  const prepare = db.prepare.bind(db);
  const cause = Object.assign(new Error("fixture write denied"), { code: "EACCES" });
  const mock = t.mock.method(db, "prepare", ((sql: string) => {
    if (sql === "VACUUM INTO ?") throw cause;
    return prepare(sql);
  }) as typeof db.prepare);
  await assert.rejects(runSqliteSessionMigrationsAsync(db, path), (error: unknown) => {
    assert.ok(error instanceof SqliteSessionMigrationError);
    assert.equal(error.kind, "backup_failed");
    assert.equal(error.cause, cause);
    assert.ok(error.snapshotPath?.startsWith(`${path}.pre-`));
    return true;
  });
  assert.deepEqual(readFileSync(path), before);
  assert.equal(db.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
  assert.equal(db.isTransaction, false);
  assert.equal(backups(root).length, 0);
  mock.mock.restore();
  await runSqliteSessionMigrationsAsync(db, path);
  assert.equal(backups(root).length, 1);
});

test("Agent migration SQL failure rolls back, retains snapshot and succeeds after repair", (t) => {
  const { db, path, root } = fixture(t);
  const rows = readRows(db);
  db.exec(
    "CREATE TRIGGER reject_upgrade BEFORE INSERT ON schema_migration BEGIN SELECT RAISE(ABORT,'fixture failure'); END",
  );
  assert.throws(() => runSqliteSessionMigrations(db, path), SqliteSessionMigrationError);
  assert.equal(db.isTransaction, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n, 1);
  assert.deepEqual(readRows(db), rows);
  assert.equal(backups(root).length, 1);
  db.exec("DROP TRIGGER reject_upgrade");
  runSqliteSessionMigrations(db, path);
  assert.deepEqual(readRows(db), rows);
});

test("Agent progress transport failure rolls back without a half-migrated connection", async (t) => {
  const { db, path } = fixture(t);
  const cause = new Error("fixture transport failure");
  await assert.rejects(
    runSqliteSessionMigrationsAsync(db, path, {
      onProgress: async (progress) => {
        if (progress.phase === "committing") throw cause;
      },
    }),
    (error) => error === cause,
  );
  assert.equal(db.isTransaction, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n, 1);
  runSqliteSessionMigrations(db, path);
});

test("Agent interrupted migration is rolled back; independent snapshot restores old sessions", (t) => {
  const { db, path, root } = fixture(t);
  const rows = readRows(db);
  db.close();
  const runnerUrl = new URL("../src/storage/session-store/migration-runner.ts", import.meta.url)
    .href;
  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import { DatabaseSync } from 'node:sqlite';
    import { runSqliteSessionMigrationsAsync } from ${JSON.stringify(runnerUrl)};
    const db = new DatabaseSync(process.argv[1]);
    await runSqliteSessionMigrationsAsync(db, process.argv[1], {
      onProgress: async (p) => { if (p.phase === 'committing') process.exit(42); }
    });
  `,
      path,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  assert.equal(child.status, 42, child.stderr);
  const interrupted = new DatabaseSync(path);
  try {
    assert.equal(interrupted.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n, 1);
    assert.deepEqual(readRows(interrupted), rows);
  } finally {
    interrupted.close();
  }
  const saved = backups(root);
  assert.equal(saved.length, 1);
  // 只操作本用例临时库；恢复前所有连接必须关闭，清掉残留 WAL/SHM。
  for (const suffix of ["-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
  copyFileSync(join(root, saved[0]!), path);
  const restored = new DatabaseSync(path);
  try {
    assert.deepEqual(readRows(restored), rows);
    assert.equal(restored.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n, 1);
    runSqliteSessionMigrations(restored, path);
    assert.deepEqual(readRows(restored), rows);
  } finally {
    restored.close();
  }
});

test("Agent empty and memory databases do not leave migration snapshots", (t) => {
  const { root, db } = fixture(t);
  db.close();
  for (const path of [join(root, "new.sqlite"), ":memory:"]) {
    const empty = new DatabaseSync(path);
    try {
      runSqliteSessionMigrations(empty, path);
    } finally {
      empty.close();
    }
  }
  assert.deepEqual(backups(root), []);
});

test("Agent cleanup failure cannot replace a falsy progress failure", async (t) => {
  const { db, path } = fixture(t);
  const exec = db.exec.bind(db);
  t.mock.method(db, "exec", (sql: string) => {
    if (sql === "pragma busy_timeout = 5000") throw new Error("fixture cleanup failure");
    return exec(sql);
  });
  let caught = false;
  try {
    await runSqliteSessionMigrationsAsync(db, path, {
      onProgress: async (progress) => {
        if (progress.phase === "committing") throw undefined;
      },
    });
  } catch (error) {
    caught = true;
    assert.equal(error, undefined);
  }
  assert.equal(caught, true);
  assert.equal(db.isTransaction, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n, 1);
});

test("Agent concurrent startup waits for the writer and never reapplies its committed migrations", async (t) => {
  const { db, path } = fixture(t);
  db.close();
  const runnerUrl = new URL("../src/storage/session-store/migration-runner.ts", import.meta.url)
    .href;
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import { DatabaseSync } from 'node:sqlite';
    import { runSqliteSessionMigrationsAsync } from ${JSON.stringify(runnerUrl)};
    const db = new DatabaseSync(process.argv[1]);
    await runSqliteSessionMigrationsAsync(db, process.argv[1], {
      onProgress: async (p) => {
        if (p.phase === 'committing') {
          const release = new Promise(resolve => process.once('message', resolve));
          process.send('locked');
          await release;
        }
      }
    });
    db.close(); process.disconnect();
  `,
      path,
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  t.after(() => {
    if (child.exitCode === null) child.kill();
  });
  await Promise.race([
    new Promise<void>((resolve) => child.once("message", () => resolve())),
    exited.then((code) => {
      throw new Error(`Writer exited before locking: ${code}`);
    }),
  ]);
  const waiter = new DatabaseSync(path);
  const phases: string[] = [];
  const executed: number[] = [];
  try {
    await runSqliteSessionMigrationsAsync(waiter, path, {
      lockWaitTimeoutMs: 5_000,
      onProgress: async (progress) => {
        phases.push(progress.phase);
        if (progress.phase === "waiting_for_lock") child.send("release");
        if (progress.phase === "ready") executed.push(progress.migration!.executedCount);
      },
    });
    assert.ok(phases.includes("waiting_for_lock"));
    assert.deepEqual(executed, [0]);
    assert.equal(
      waiter.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n,
      SQLITE_MIGRATIONS.length,
    );
    assert.equal(await exited, 0);
  } finally {
    waiter.close();
  }
});
