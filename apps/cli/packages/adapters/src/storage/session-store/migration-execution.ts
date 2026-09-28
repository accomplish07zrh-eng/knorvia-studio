// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  databaseMigrationIdSchema,
  databaseStartupErrorDetails,
  type DatabaseMigrationFacts,
} from "@knorvia/shared";
import { SqliteSessionMigrationError } from "./errors.js";
import { isSqliteBusy, normalizeMigrationFailure } from "./migration-native-error.js";
import { createSessionMigrationSnapshot } from "./migration-snapshot.js";
import { SQLITE_MIGRATIONS } from "./migrations.js";
import type { SqliteMigrationPhase, SqliteMigrationProgress } from "./migration-runner.js";

export type MigrationEffect =
  | { type: "progress"; progress: SqliteMigrationProgress }
  | { type: "delay"; milliseconds: number };

const INITIAL_LOCK_RETRY_MS = 10;
const MAX_LOCK_RETRY_MS = 200;
const LOCK_RETRY_MULTIPLIER = 2;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.trim()).digest("hex");
}

function isApplied(
  db: DatabaseSync,
  dbPath: string,
  migration: { id: string; sql: string },
): boolean {
  const row = db.prepare("SELECT checksum FROM schema_migration WHERE id = ?").get(migration.id);
  if (row === undefined) return false;
  if (row.checksum !== checksum(migration.sql)) {
    throw new SqliteSessionMigrationError(
      `SQLite migration checksum mismatch for ${migration.id}. Historical migrations are immutable; add a new migration instead.`,
      { dbPath, kind: "checksum_mismatch", migrationId: migration.id },
    );
  }
  return true;
}

function inspectCatalog(db: DatabaseSync, dbPath: string): DatabaseMigrationFacts["kind"] {
  const hasLedger =
    db
      .prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `)
      .get("schema_migration") !== undefined;
  // 新版账本可能已无旧 checksum 列，先只校验身份，再读取旧格式字段。
  const rows = hasLedger ? db.prepare("SELECT id FROM schema_migration").all() : [];
  for (const row of rows) {
    const id = String(row.id);
    if (!SQLITE_MIGRATIONS.some((migration) => migration.id === id)) {
      throw new SqliteSessionMigrationError(
        "Session database has migrations unknown to this build; open it with a newer compatible version.",
        { dbPath, kind: "newer_database" },
      );
    }
  }
  let missing = false;
  for (const migration of SQLITE_MIGRATIONS) {
    if (!hasLedger || !isApplied(db, dbPath, migration)) missing = true;
  }
  if (!missing) return "none";
  const applicationTable = db
    .prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT IN ('schema_migration', 'sqlite_sequence') LIMIT 1
  `)
    .get();
  return applicationTable === undefined ? "initialize" : "upgrade";
}

function ensureWal(db: DatabaseSync, dbPath: string): void {
  const modeOf = (row: Record<string, unknown> | undefined): string =>
    typeof row?.journal_mode === "string" ? row.journal_mode.toLowerCase() : "unknown";
  const accepted = (mode: string): boolean =>
    mode === "wal" || (dbPath === ":memory:" && mode === "memory");
  const current = modeOf(db.prepare("PRAGMA journal_mode").get());
  if (accepted(current)) return;
  const selected = modeOf(db.prepare("PRAGMA journal_mode = WAL").get());
  if (!accepted(selected)) {
    throw new SqliteSessionMigrationError(
      `SQLite refused WAL journal mode for ${dbPath}; received ${selected}`,
      { dbPath, kind: "sql_failed" },
    );
  }
}

export function* createMigrationExecution(
  db: DatabaseSync,
  dbPath: string,
  lockTimeoutMs: number,
): Generator<MigrationEffect, void, void> {
  const start = Date.now();
  const deadline = start + Math.max(0, lockTimeoutMs);
  let facts: DatabaseMigrationFacts | undefined;
  let ownsTransaction = false;

  const progress = (phase: SqliteMigrationPhase): SqliteMigrationProgress => {
    const payload: SqliteMigrationProgress = { phase, elapsedMs: Date.now() - start };
    if (facts !== undefined) payload.migration = { ...facts };
    return payload;
  };
  const observe = (): DatabaseMigrationFacts["kind"] => {
    const kind = inspectCatalog(db, dbPath);
    facts = { kind, executedCount: 0, committedCount: 0 };
    return kind;
  };
  const rollbackOwned = (): void => {
    if (!ownsTransaction) return;
    try {
      if (db.isTransaction) db.exec("ROLLBACK");
    } catch {
      /* 回滚错误不能覆盖数据库或通知的首因。 */
    }
    // 一次尽力清理后即放弃所有权，failed 通知及关闭不得再次回滚。
    ownsTransaction = false;
  };
  function* acquire(operation: () => void): Generator<MigrationEffect, void, void> {
    let notified = false;
    let delay = INITIAL_LOCK_RETRY_MS;
    for (;;) {
      try {
        operation();
        return;
      } catch (error) {
        if (!isSqliteBusy(error)) throw error;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw error;
        if (!notified) {
          notified = true;
          yield { type: "progress", progress: progress("waiting_for_lock") };
        }
        yield { type: "delay", milliseconds: Math.min(delay, remaining) };
        delay = Math.min(MAX_LOCK_RETRY_MS, delay * LOCK_RETRY_MULTIPLIER);
      }
    }
  }

  try {
    yield { type: "progress", progress: progress("checking") };
    db.exec("PRAGMA foreign_keys = ON");
    yield* acquire(() => {
      if (observe() === "upgrade") createSessionMigrationSnapshot(db, dbPath);
    });
    yield* acquire(() => ensureWal(db, dbPath));
    yield* acquire(() => {
      observe();
    });
    yield { type: "progress", progress: progress("checking") };
    yield* acquire(() => {
      db.exec("BEGIN IMMEDIATE");
    });
    ownsTransaction = true;
    inspectCatalog(db, dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        app_version TEXT,
        time_applied INTEGER NOT NULL
      )
    `);
    const baseline = db.prepare("SELECT id FROM schema_migration ORDER BY id DESC LIMIT 1").get();
    const currentFacts = facts!;
    currentFacts.lastAppliedMigrationId =
      baseline === undefined ? null : databaseMigrationIdSchema.safeParse(baseline.id).data;

    let completed = 0;
    for (const migration of SQLITE_MIGRATIONS) {
      try {
        // 前项 SQL 或通知可改变后项账本，每项都读取当时的身份与校验值。
        if (isApplied(db, dbPath, migration)) {
          completed++;
          continue;
        }
        if (currentFacts.kind === "none") currentFacts.kind = "upgrade";
        yield {
          type: "progress",
          progress: {
            ...progress("migrating"),
            migrationId: migration.id,
            completed,
            total: SQLITE_MIGRATIONS.length,
          },
        };
        db.exec(migration.sql);
        currentFacts.executedCount++;
        db.prepare(`
          INSERT INTO schema_migration (id, checksum, app_version, time_applied) VALUES (?, ?, ?, ?)
        `).run(migration.id, checksum(migration.sql), migration.appVersion, Date.now());
      } catch (error) {
        throw normalizeMigrationFailure(error, dbPath, migration.id);
      }
      completed++;
    }
    yield { type: "progress", progress: progress("committing") };
    db.exec("COMMIT");
    ownsTransaction = false;
    currentFacts.committedCount = currentFacts.executedCount;
    yield { type: "progress", progress: progress("ready") };
  } catch (error) {
    rollbackOwned();
    const failure = normalizeMigrationFailure(error, dbPath);
    yield {
      type: "progress",
      progress: {
        ...progress("failed"),
        errorCode: failure.kind,
        ...databaseStartupErrorDetails(failure),
        migrationId: failure.migrationId,
      },
    };
    throw failure;
  } finally {
    rollbackOwned();
  }
}
