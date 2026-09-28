// SPDX-FileCopyrightText: 2026 Knorvia contributors
// SPDX-License-Identifier: MIT

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setImmediate as yieldTurn } from "node:timers/promises";
import test from "node:test";
import {
  SqliteSessionStore,
  openStartupSqliteSessionStore,
  SQLITE_MIGRATIONS,
  runSqliteSessionMigrationsAsync,
  type AsyncSqliteMigrationOptions,
  type SqliteMigrationProgress,
} from "./session-bootstrap.target.js";
import {
  CATALOG,
  LAST_ID,
  connection,
  files,
  initialized,
  ledger,
  errorOf,
  rejection,
} from "./session-bootstrap.fixture.js";

test("public synchronous startup writes the frozen catalog in order with exact hashes and versions", (t) => {
  const db = initialized(t);
  assert.deepEqual(
    SQLITE_MIGRATIONS.map((item, index) => ({
      index,
      id: item.id,
      appVersion: item.appVersion,
      sqlTrimSha256: createHash("sha256").update(item.sql.trim()).digest("hex"),
    })),
    CATALOG,
  );
  const rows = ledger(db);
  assert.deepEqual(
    rows.map((row) => [row.id, row.checksum, row.app_version]),
    CATALOG.map((item) => [item.id, item.sqlTrimSha256, item.appVersion]),
  );
  assert.equal(rows.length, 22);
  assert.ok(
    rows.every((row) => Number.isSafeInteger(row.time_applied) && Number(row.time_applied) > 0),
  );
  assert.equal(db.isTransaction, false);
  assert.equal(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys, 1);
});

test("public async startup awaits progress, rereads its method receiver, and publishes distinct fact snapshots", async (t) => {
  const progress: SqliteMigrationProgress[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  let published = false;
  const options: AsyncSqliteMigrationOptions = {
    get onProgress() {
      reads++;
      return async function (this: AsyncSqliteMigrationOptions, step: SqliteMigrationProgress) {
        assert.equal(this, options);
        progress.push(step);
        if (progress.length === 1) await gate;
      };
    },
  };
  const pending = SqliteSessionStore.openStartup({ dbPath: ":memory:" }, options).then((store) => {
    published = true;
    return store;
  });
  assert.equal(published, false);
  assert.deepEqual(
    progress.map((p) => p.phase),
    ["checking"],
  );
  try {
    // 先让出完整事件循环，证明未完成的通知阻止后续迁移，而非只停在首个同步切片。
    await yieldTurn();
    assert.equal(published, false);
    assert.deepEqual(
      progress.map((p) => p.phase),
      ["checking"],
    );
  } finally {
    release();
  }
  const store = await pending;
  t.after(() => store.close());
  assert.equal(published, true);
  assert.equal(reads, progress.length);
  assert.deepEqual(
    progress.map((p) => p.phase),
    ["checking", "checking", ...CATALOG.map(() => "migrating"), "committing", "ready"],
  );
  assert.equal(progress[0]!.migration, undefined);
  assert.deepEqual(Object.keys(progress[0]!), ["phase", "elapsedMs"]);
  assert.equal(Object.hasOwn(progress[0]!, "migration"), false);
  assert.deepEqual(Object.keys(progress[1]!), ["phase", "elapsedMs", "migration"]);
  assert.deepEqual(Object.keys(progress[1]!.migration!), [
    "kind",
    "executedCount",
    "committedCount",
  ]);
  assert.equal(Object.hasOwn(progress[1]!.migration!, "lastAppliedMigrationId"), false);
  const migrating = progress.filter((p) => p.phase === "migrating");
  assert.deepEqual(
    migrating.map((p) => [p.migrationId, p.completed, p.total]),
    CATALOG.map((entry, index) => [entry.id, index, 22]),
  );
  assert.deepEqual(
    migrating.map((p) => p.migration?.executedCount),
    CATALOG.map((_, i) => i),
  );
  assert.ok(
    migrating.every(
      (p) => p.migration?.committedCount === 0 && p.migration.lastAppliedMigrationId === null,
    ),
  );
  assert.deepEqual(Object.keys(migrating[0]!), [
    "phase",
    "elapsedMs",
    "migration",
    "migrationId",
    "completed",
    "total",
  ]);
  assert.deepEqual(Object.keys(migrating[0]!.migration!), [
    "kind",
    "executedCount",
    "committedCount",
    "lastAppliedMigrationId",
  ]);
  assert.deepEqual(Object.keys(progress.at(-1)!), ["phase", "elapsedMs", "migration"]);
  assert.deepEqual(progress.at(-1)?.migration, {
    kind: "initialize",
    executedCount: 22,
    committedCount: 22,
    lastAppliedMigrationId: null,
  });
  assert.equal(new Set(progress).size, progress.length);
  assert.equal(new Set(progress.slice(1).map((p) => p.migration)).size, progress.length - 1);
  assert.equal(
    progress[1]?.migration?.executedCount,
    0,
    "earlier facts must not mutate after commit",
  );
  assert.equal(connection(store).prepare("PRAGMA busy_timeout").get()?.timeout, 5000);
});

test("repeated public file startup and synchronous wrapper leave ledger rows and snapshots unchanged", async (t) => {
  const f = files(t);
  const first = f.track(new SqliteSessionStore({ dbPath: f.path }));
  const original = ledger(connection(first));
  first.close();
  const wrapped = f.track(openStartupSqliteSessionStore({ dbPath: f.path }));
  assert.ok(wrapped instanceof SqliteSessionStore, "wrapper is synchronous despite its name");
  assert.deepEqual(ledger(connection(wrapped)), original);
  wrapped.close();
  const observed: SqliteMigrationProgress[] = [];
  const last = f.track(
    await SqliteSessionStore.openStartup(
      { dbPath: f.path },
      {
        onProgress: async (p) => {
          observed.push(p);
        },
      },
    ),
  );
  assert.deepEqual(
    observed.map((p) => p.phase),
    ["checking", "checking", "committing", "ready"],
  );
  assert.deepEqual(observed.at(-1)?.migration, {
    kind: "none",
    executedCount: 0,
    committedCount: 0,
    lastAppliedMigrationId: LAST_ID,
  });
  assert.deepEqual(ledger(connection(last)), original);
  assert.equal(connection(last).isTransaction, false);
  assert.deepEqual(f.backups(), []);
});

test("sparse known ledger executes the missing middle entry even when a later ID is present", async (t) => {
  const db = initialized(t);
  const missing = CATALOG[20]!;
  db.prepare("DELETE FROM schema_migration WHERE id=?").run(missing.id);
  const retained = ledger(db);
  const observed: SqliteMigrationProgress[] = [];
  await runSqliteSessionMigrationsAsync(db, ":memory:", {
    onProgress: async (p) => {
      observed.push(p);
    },
  });
  assert.deepEqual(
    observed
      .filter((p) => p.phase === "migrating")
      .map((p) => [p.migrationId, p.completed, p.total]),
    [[missing.id, 20, 22]],
  );
  assert.deepEqual(observed.at(-1)?.migration, {
    kind: "upgrade",
    executedCount: 1,
    committedCount: 1,
    lastAppliedMigrationId: LAST_ID,
  });
  assert.deepEqual(
    ledger(db).filter((row) => row.id !== missing.id),
    retained,
  );
  assert.equal(ledger(db).at(-1)?.checksum, missing.sqlTrimSha256);
});

test("public startup rejects a nonmaximum checksum mismatch before snapshot or WAL mutation", (t) => {
  const f = files(t);
  const store = f.track(new SqliteSessionStore({ dbPath: f.path }));
  store.close();
  const edit = f.open();
  edit.exec("PRAGMA journal_mode=DELETE");
  edit
    .prepare("UPDATE schema_migration SET checksum='fixture-mismatch' WHERE id=?")
    .run(CATALOG[1]!.id);
  edit.close();
  const before = readFileSync(f.path);
  assert.throws(
    () => new SqliteSessionStore({ dbPath: f.path }),
    (value) => {
      const error = errorOf(value, "checksum_mismatch");
      assert.equal(error.migrationId, CATALOG[1]!.id);
      assert.equal(
        error.message,
        `SQLite migration checksum mismatch for ${CATALOG[1]!.id}. Historical migrations are immutable; add a new migration instead.`,
      );
      return true;
    },
  );
  assert.deepEqual(readFileSync(f.path), before);
  assert.deepEqual(f.backups(), []);
  const check = f.open();
  assert.equal(check.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
  assert.equal(ledger(check)[1]?.checksum, "fixture-mismatch");
});

test("public async startup refuses an unsafe unknown lower ID without echoing it or losing the primary error", async (t) => {
  const f = files(t);
  const store = f.track(new SqliteSessionStore({ dbPath: f.path }));
  store.close();
  const edit = f.open();
  edit.exec("PRAGMA journal_mode=DELETE");
  const unknown = "0000_../../untrusted";
  edit
    .prepare("INSERT INTO schema_migration VALUES(?,?,?,?)")
    .run(unknown, "unknown", "fixture", 1);
  edit.close();
  const before = readFileSync(f.path);
  const phases: string[] = [];
  let failedProgress: SqliteMigrationProgress | undefined;
  const error = errorOf(
    await rejection(
      SqliteSessionStore.openStartup(
        { dbPath: f.path },
        {
          onProgress: async (p) => {
            phases.push(p.phase);
            if (p.phase === "failed") {
              failedProgress = p;
              throw "transport unavailable";
            }
          },
        },
      ),
    ),
    "newer_database",
  );
  assert.equal(
    error.message,
    "Session database has migrations unknown to this build; open it with a newer compatible version.",
  );
  assert.equal(error.snapshotPath, undefined);
  assert.ok(failedProgress);
  assert.deepEqual(Object.keys(failedProgress), ["phase", "elapsedMs", "errorCode", "migrationId"]);
  assert.equal(Object.hasOwn(failedProgress, "migrationId"), true);
  assert.equal(failedProgress.migrationId, undefined);
  assert.deepEqual(phases, ["checking", "failed"]);
  assert.deepEqual(readFileSync(f.path), before);
  assert.deepEqual(f.backups(), []);
});

test("public upgrade of an unversioned native WAL database snapshots committed content and preserves it", async (t) => {
  const f = files(t);
  const writer = f.open();
  writer.exec(
    "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE fixture_keep(value TEXT); INSERT INTO fixture_keep VALUES('initial')",
  );
  writer.exec("UPDATE fixture_keep SET value='committed in WAL'");
  assert.ok(readFileSync(`${f.path}-wal`).length > 0);
  const phases: SqliteMigrationProgress[] = [];
  const store = f.track(
    await SqliteSessionStore.openStartup(
      { dbPath: f.path },
      {
        onProgress: async (p) => {
          phases.push(p);
        },
      },
    ),
  );
  assert.equal(phases.at(-1)?.migration?.kind, "upgrade");
  const names = f.backups();
  assert.equal(names.length, 1);
  assert.match(names[0]!, /\.pre-unversioned\.[0-9TZ]+\.bak$/);
  const snapshot = f.open(join(f.root, names[0]!), true);
  assert.equal(snapshot.prepare("SELECT value FROM fixture_keep").get()?.value, "committed in WAL");
  assert.equal(snapshot.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  assert.equal(
    snapshot.prepare("SELECT name FROM sqlite_master WHERE name='schema_migration'").get(),
    undefined,
  );
  assert.equal(
    connection(store).prepare("SELECT value FROM fixture_keep").get()?.value,
    "committed in WAL",
  );
  assert.equal(ledger(connection(store)).length, 22);
});

test("unknown migration identity is rejected before assuming a newer ledger still has the checksum column", async (t) => {
  const f = files(t);
  const db = f.open();
  db.exec(
    "CREATE TABLE schema_migration(id TEXT PRIMARY KEY); INSERT INTO schema_migration VALUES('0000_future_shape')",
  );
  const before = readFileSync(f.path);
  const error = errorOf(
    await rejection(runSqliteSessionMigrationsAsync(db, f.path)),
    "newer_database",
  );
  assert.equal(error.migrationId, undefined);
  assert.equal(error.cause, undefined);
  assert.equal(db.prepare("PRAGMA journal_mode").get()?.journal_mode, "delete");
  assert.equal(db.isTransaction, false);
  assert.deepEqual(readFileSync(f.path), before);
  assert.deepEqual(f.backups(), []);
});

test("each later migration observes checksum changes made during an earlier awaited progress callback", async (t) => {
  const db = initialized(t);
  const pending = CATALOG[20]!;
  const later = CATALOG[21]!;
  db.prepare("DELETE FROM schema_migration WHERE id=?").run(pending.id);
  const before = ledger(db);
  let changedDuringProgress = false;
  const error = errorOf(
    await rejection(
      runSqliteSessionMigrationsAsync(db, ":memory:", {
        onProgress: async (progress) => {
          if (progress.phase === "migrating" && progress.migrationId === pending.id) {
            db.prepare(
              "UPDATE schema_migration SET checksum='fixture changed during progress' WHERE id=?",
            ).run(later.id);
            changedDuringProgress = true;
          }
        },
      }),
    ),
    "checksum_mismatch",
  );
  assert.equal(changedDuringProgress, true);
  assert.equal(error.migrationId, later.id);
  assert.equal(db.isTransaction, false);
  assert.deepEqual(ledger(db), before, "callback and migration changes roll back together");
});
