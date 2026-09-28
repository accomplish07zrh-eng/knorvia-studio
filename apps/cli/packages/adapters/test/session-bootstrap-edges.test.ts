// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import fs, { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import {
  createSessionMigrationSnapshot,
  ensureParentDir,
  getDefaultSessionDbPath,
  runSqliteSessionMigrationsAsync,
  SqliteSessionMigrationError,
} from "./session-bootstrap.target.js";
import {
  WORKSPACE,
  createLedger,
  errorOf,
  files,
  memory,
  rejection,
} from "./session-bootstrap.fixture.js";

const FROZEN_DATE = new Date("2026-01-02T03:04:05.678Z");
const STAMP = "20260102T030405678Z";

test("memory snapshot exits before ledger, clock formatting, or destination access", (t) => {
  const db = memory(t);
  const f = files(t);
  t.mock.method(db, "prepare", (() => {
    assert.fail("memory snapshot must not inspect ledger");
  }) as typeof db.prepare);
  t.mock.method(Date.prototype, "toISOString", () => {
    assert.fail("memory snapshot must not format clock");
  });
  createSessionMigrationSnapshot(db, join(f.root, "missing", "not-a-file.sqlite"));
  assert.deepEqual(f.backups(), []);
  assert.equal(existsSync(join(f.root, "missing")), false);
});

test("exclusive snapshot reservation reaches suffix 100 then rejects exhaustion without touching collisions", (t) => {
  const f = files(t);
  const db = f.open();
  db.exec("CREATE TABLE fixture_keep(value TEXT); INSERT INTO fixture_keep VALUES('preserved')");
  t.mock.timers.enable({ apis: ["Date"], now: FROZEN_DATE });
  const base = `${f.path}.pre-unversioned.${STAMP}.bak`;
  for (let suffix = 0; suffix < 100; suffix++)
    writeFileSync(suffix ? `${base}-${suffix}` : base, `collision ${suffix}`);
  createSessionMigrationSnapshot(db, f.path);
  const last = f.open(`${base}-100`, true);
  assert.equal(last.prepare("SELECT value FROM fixture_keep").get()?.value, "preserved");
  last.close();
  const originalLast = readFileSync(`${base}-100`);
  assert.throws(
    () => createSessionMigrationSnapshot(db, f.path),
    (value) => {
      const error = errorOf(value, "backup_failed");
      assert.equal(error.snapshotPath, `${base}-100`);
      assert.ok(error.cause instanceof Error);
      assert.equal(error.cause.message, "Snapshot name limit reached");
      return true;
    },
  );
  assert.equal(f.backups().length, 101);
  assert.equal(existsSync(`${base}-101`), false);
  assert.deepEqual(readFileSync(`${base}-100`), originalLast);
  for (let suffix = 0; suffix < 100; suffix++)
    assert.equal(readFileSync(suffix ? `${base}-${suffix}` : base, "utf8"), `collision ${suffix}`);
});

test("snapshot atomic reservation can reuse a regular candidate removed after its stat observation", (t) => {
  const f = files(t);
  const db = f.open();
  db.exec("CREATE TABLE fixture_keep(value TEXT); INSERT INTO fixture_keep VALUES('snapshot')");
  t.mock.timers.enable({ apis: ["Date"], now: FROZEN_DATE });
  const base = `${f.path}.pre-unversioned.${STAMP}.bak`;
  writeFileSync(base, "temporary collision owned by this fixture");
  const nativeStat = fs.statSync;
  let removedAfterObservation = false;
  const probe = t.mock.method(fs, "statSync", ((...args: Parameters<typeof fs.statSync>) => {
    const observation = nativeStat(...args);
    if (args[0] === base && observation?.isFile()) {
      // 有界模拟另一写者在 stat 与独占创建之间移除自己的占位；仅删除此夹具文件。
      unlinkSync(base);
      removedAfterObservation = true;
    }
    return observation;
  }) as typeof fs.statSync);
  syncBuiltinESMExports();
  try {
    createSessionMigrationSnapshot(db, f.path);
  } finally {
    probe.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(removedAfterObservation, true);
  assert.deepEqual(f.backups(), [basename(base)]);
  assert.equal(existsSync(`${base}-1`), false);
  const saved = f.open(base, true);
  assert.equal(saved.prepare("SELECT value FROM fixture_keep").get()?.value, "snapshot");
});

test("injected extended BUSY during native snapshot copy removes only this reserved partial target and escapes unchanged", (t) => {
  const f = files(t);
  const db = f.open();
  db.exec("CREATE TABLE fixture_keep(value TEXT); INSERT INTO fixture_keep VALUES('source')");
  t.mock.timers.enable({ apis: ["Date"], now: FROZEN_DATE });
  const base = `${f.path}.pre-unversioned.${STAMP}.bak`;
  writeFileSync(base, "existing collision");
  const before = readFileSync(f.path);
  const cause = Object.assign(new Error("injected BUSY during copy"), { errcode: 517 });
  const nativePrepare = db.prepare.bind(db);
  let attempted = "";
  t.mock.method(db, "prepare", ((sql: string) => {
    if (/^VACUUM INTO /i.test(sql))
      return {
        run(path: string) {
          attempted = path;
          assert.equal(readFileSync(path).length, 0, "target was exclusively reserved and closed");
          writeFileSync(path, "owned partial bytes");
          throw cause;
        },
      };
    return nativePrepare(sql);
  }) as typeof db.prepare);
  assert.throws(
    () => createSessionMigrationSnapshot(db, f.path),
    (error) => error === cause,
  );
  assert.equal(attempted, `${base}-1`);
  assert.equal(existsSync(attempted), false);
  assert.equal(readFileSync(base, "utf8"), "existing collision");
  assert.deepEqual(readFileSync(f.path), before);
  assert.equal(f.backups().length, 1);
});

test("native VACUUM rejection inside caller transaction cleans the owned reservation but preserves caller writes", (t) => {
  const f = files(t);
  const db = f.open();
  db.exec(
    "CREATE TABLE fixture_keep(value TEXT); BEGIN; INSERT INTO fixture_keep VALUES('uncommitted caller')",
  );
  t.mock.timers.enable({ apis: ["Date"], now: FROZEN_DATE });
  assert.throws(
    () => createSessionMigrationSnapshot(db, f.path),
    (value) => {
      const error = errorOf(value, "backup_failed");
      assert.equal(error.snapshotPath, `${f.path}.pre-unversioned.${STAMP}.bak`);
      assert.ok(error.cause instanceof Error);
      assert.equal((error.cause as { code?: string }).code, "ERR_SQLITE_ERROR");
      assert.equal((error.cause as { errcode?: number }).errcode, 1);
      assert.equal(
        error.message,
        `Session migration backup failed; upgrade stopped: ${error.snapshotPath}`,
      );
      return true;
    },
  );
  assert.deepEqual(f.backups(), []);
  assert.equal(db.isTransaction, true);
  assert.equal(db.prepare("SELECT value FROM fixture_keep").get()?.value, "uncommitted caller");
  db.exec("COMMIT");
});

test("injected snapshot inspection error before reservation stays at the direct helper's native boundary", (t) => {
  const f = files(t);
  const db = f.open();
  const cause = Object.assign(new Error("fixture ledger read failed"), { errcode: 10 });
  t.mock.method(db, "prepare", (() => {
    throw cause;
  }) as typeof db.prepare);
  assert.throws(
    () => createSessionMigrationSnapshot(db, f.path),
    (error) => error === cause,
  );
  assert.deepEqual(f.backups(), []);
});

test("migration errors retain Error identity, cause reference, and own undefined optional fields", () => {
  const cause = { fixture: "cause identity" };
  const defined = new SqliteSessionMigrationError("fixture message", {
    dbPath: ":memory:",
    kind: "backup_failed",
    cause,
    migrationId: "0001_fixture",
    snapshotPath: "fixture.bak",
  });
  assert.ok(defined instanceof Error);
  assert.equal(defined.name, "SqliteSessionMigrationError");
  assert.equal(defined.message, "fixture message");
  assert.equal(defined.cause, cause);
  assert.equal(defined.migrationId, "0001_fixture");
  assert.equal(defined.snapshotPath, "fixture.bak");
  const absent = new SqliteSessionMigrationError("absent", {
    dbPath: ":memory:",
    kind: "sql_failed",
  });
  assert.deepEqual(Object.keys(absent), ["dbPath", "kind", "migrationId", "snapshotPath", "name"]);
  assert.deepEqual(Object.getOwnPropertyNames(absent), [
    "stack",
    "message",
    "cause",
    "dbPath",
    "kind",
    "migrationId",
    "snapshotPath",
    "name",
  ]);
  assert.equal(Object.getPrototypeOf(absent), SqliteSessionMigrationError.prototype);
  for (const key of ["name", "dbPath", "kind", "migrationId", "snapshotPath", "cause"])
    assert.ok(Object.hasOwn(absent, key));
  assert.equal(absent.migrationId, undefined);
  assert.equal(absent.snapshotPath, undefined);
  assert.equal(absent.cause, undefined);
  assert.equal(Object.getOwnPropertyDescriptor(absent, "cause")?.enumerable, false);
});

test("injected rollback failure preserves the migration cause and never retries after failed notification", async (t) => {
  const db = memory(t);
  createLedger(db);
  db.exec(
    "CREATE TRIGGER fixture_primary BEFORE INSERT ON schema_migration BEGIN SELECT RAISE(ABORT,'fixture primary migration failure'); END",
  );
  const nativeExec = db.exec.bind(db);
  const cleanupError = new Error("fixture rollback failure");
  let rollbackAttempts = 0;
  t.mock.method(db, "exec", (sql: string) => {
    if (/^rollback$/i.test(sql.trim())) {
      rollbackAttempts++;
      throw cleanupError;
    }
    nativeExec(sql);
  });
  let failedState: { attempts: number; inTransaction: boolean } | undefined;
  const error = errorOf(
    await rejection(
      runSqliteSessionMigrationsAsync(db, ":memory:", {
        onProgress: async (progress) => {
          if (progress.phase === "failed") {
            failedState = { attempts: rollbackAttempts, inTransaction: db.isTransaction };
            throw new Error("fixture failed notification unavailable");
          }
        },
      }),
    ),
    "sql_failed",
  );
  assert.ok(error.cause instanceof Error);
  assert.match(error.cause.message, /fixture primary migration failure/);
  assert.notEqual(error.cause, cleanupError);
  assert.deepEqual(failedState, { attempts: 1, inTransaction: true });
  assert.equal(rollbackAttempts, 1);
  assert.equal(db.isTransaction, true);
  // 原生事务尚未回滚的失败边界留给连接所有者；夹具自行结束它，不能伪称已回滚。
  nativeExec("ROLLBACK");
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='session'").get(), undefined);
});

test("default session path rereads trimmed environment priorities without expanding tilde", () => {
  const keys = ["KNORVIA_DATA_BASE_DIR", "KNORVIA_HOME"] as const;
  const before = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.KNORVIA_DATA_BASE_DIR = `  ${join(WORKSPACE, "base-a")}  `;
    process.env.KNORVIA_HOME = join(WORKSPACE, "ignored-home");
    assert.equal(
      getDefaultSessionDbPath(),
      join(WORKSPACE, "base-a", ".knorvia-studio", "cli", "db", "db.sqlite"),
    );
    process.env.KNORVIA_DATA_BASE_DIR = "   ";
    process.env.KNORVIA_HOME = `  ${join(WORKSPACE, "home-b")}  `;
    assert.equal(getDefaultSessionDbPath(), join(WORKSPACE, "home-b", "cli", "db", "db.sqlite"));
    process.env.KNORVIA_HOME = "~/literal-home";
    assert.equal(
      getDefaultSessionDbPath(),
      join(resolve("~/literal-home"), "cli", "db", "db.sqlite"),
    );
    delete process.env.KNORVIA_HOME;
    assert.equal(
      getDefaultSessionDbPath(),
      join(homedir(), ".knorvia-studio", "cli", "db", "db.sqlite"),
    );
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("existing parents skip the fault port; missing parents preserve injected fault then create recursively", (t) => {
  const f = files(t);
  const parent = join(f.root, "fixture-fault-parent");
  mkdirSync(parent);
  const keys = ["KNORVIA_ENV", "KNORVIA_E2E_FS_FAULTS"] as const;
  const before = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.KNORVIA_ENV = "test";
    process.env.KNORVIA_E2E_FS_FAULTS = JSON.stringify([
      {
        id: "bootstrap-parent-fixture",
        code: "EACCES",
        operations: ["mkdir"],
        pathIncludes: "fixture-fault-parent",
        maxMatches: 1,
      },
    ]);
    ensureParentDir(join(parent, "no-file-created.sqlite"));
    assert.equal(existsSync(join(parent, "no-file-created.sqlite")), false);
    const missing = join(parent, "child", "nested", "db.sqlite");
    assert.throws(
      () => ensureParentDir(missing),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal((error as NodeJS.ErrnoException).code, "EACCES");
        assert.equal(error instanceof SqliteSessionMigrationError, false);
        return true;
      },
    );
    assert.equal(existsSync(join(parent, "child")), false);
    ensureParentDir(missing);
    assert.equal(existsSync(join(parent, "child", "nested")), true);
    assert.equal(existsSync(missing), false);
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
