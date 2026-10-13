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
  | { type: "progress"; report: SqliteMigrationProgress }
  | { type: "delay"; milliseconds: number };

const INITIAL_LOCK_RETRY_MS = 10;
const MAX_LOCK_RETRY_MS = 200;
const LOCK_RETRY_MULTIPLIER = 2;

function checksum(sql: string): string {
  return createHash("sha256").update(sql.trim()).digest("hex");
}

function isApplied(
  database: DatabaseSync,
  databasePath: string,
  step: { id: string; sql: string },
): boolean {
  const entry = database.prepare("SELECT checksum FROM schema_migration WHERE id = ?").get(step.id);
  if (entry === undefined) return false;
  if (entry.checksum !== checksum(step.sql)) {
    throw new SqliteSessionMigrationError(
      `SQLite migration checksum mismatch for ${migration.id}. Historical migrations are immutable; add a new migration instead.`,
      { databasePath, kind: "checksum_mismatch", migrationId: step.id },
    );
  }
  return true;
}

function inspectCatalog(
  database: DatabaseSync,
  databasePath: string,
): DatabaseMigrationFacts["kind"] {
  const hasLedger =
    database
      .prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `)
      .get("schema_migration") !== undefined;
  // 新版账本可能已无旧 checksum 列，先只校验身份，再读取旧格式字段。
  const entries = hasLedger ? database.prepare("SELECT id FROM schema_migration").all() : [];
  for (const entry of entries) {
    const id = String(entry.id);
    if (!SQLITE_MIGRATIONS.some((step) => step.id === id)) {
      throw new SqliteSessionMigrationError(
        "Session database has migrations unknown to this build; open it with a newer compatible version.",
        { databasePath, kind: "newer_database" },
      );
    }
  }
  let missing = false;
  for (const step of SQLITE_MIGRATIONS) {
    if (!hasLedger || !isApplied(database, databasePath, step)) missing = true;
  }
  if (!missing) return "none";
  const applicationTable = database
    .prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT IN ('schema_migration', 'sqlite_sequence') LIMIT 1
  `)
    .get();
  return applicationTable === undefined ? "initialize" : "upgrade";
}

function ensureWal(database: DatabaseSync, databasePath: string): void {
  const modeOf = (entry: Record<string, unknown> | undefined): string =>
    typeof entry?.journal_mode === "string" ? entry.journal_mode.toLowerCase() : "unknown";
  const accepted = (mode: string): boolean =>
    mode === "wal" || (databasePath === ":memory:" && mode === "memory");
  const current = modeOf(database.prepare("PRAGMA journal_mode").get());
  if (accepted(current)) return;
  const selected = modeOf(database.prepare("PRAGMA journal_mode = WAL").get());
  if (!accepted(selected)) {
    throw new SqliteSessionMigrationError(
      `SQLite refused WAL journal mode for ${dbPath}; received ${selected}`,
      { databasePath, kind: "sql_failed" },
    );
  }
}

export function* createMigrationExecution(
  database: DatabaseSync,
  databasePath: string,
  lockBudgetMs: number,
): Generator<MigrationEffect, void, void> {
  const start = Date.now();
  const deadline = start + Math.max(0, lockBudgetMs);
  let facts: DatabaseMigrationFacts | undefined;
  let ownsTransaction = false;

  const report = (phase: SqliteMigrationPhase): SqliteMigrationProgress => {
    const payload: SqliteMigrationProgress = { phase, elapsedMs: Date.now() - start };
    if (facts !== undefined) payload.step = { ...facts };
    return payload;
  };
  const observe = (): DatabaseMigrationFacts["kind"] => {
    const kind = inspectCatalog(database, databasePath);
    facts = { kind, executedCount: 0, committedCount: 0 };
    return kind;
  };
  const rollbackOwned = (): void => {
    if (!ownsTransaction) return;
    try {
      if (database.isTransaction) database.exec("ROLLBACK");
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
      } catch (cause) {
        if (!isSqliteBusy(cause)) throw cause;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw cause;
        if (!notified) {
          notified = true;
          yield { type: "progress", report: report("waiting_for_lock") };
        }
        yield { type: "delay", milliseconds: Math.min(delay, remaining) };
        delay = Math.min(MAX_LOCK_RETRY_MS, delay * LOCK_RETRY_MULTIPLIER);
      }
    }
  }

  try {
    yield { type: "progress", report: report("checking") };
    database.exec("PRAGMA foreign_keys = ON");
    yield* acquire(() => {
      if (observe() === "upgrade") createSessionMigrationSnapshot(database, databasePath);
    });
    yield* acquire(() => ensureWal(database, databasePath));
    yield* acquire(() => {
      observe();
    });
    yield { type: "progress", report: report("checking") };
    yield* acquire(() => {
      database.exec("BEGIN IMMEDIATE");
    });
    ownsTransaction = true;
    inspectCatalog(database, databasePath);
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        id TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        app_version TEXT,
        time_applied INTEGER NOT NULL
      )
    `);
    const baseline = database
      .prepare("SELECT id FROM schema_migration ORDER BY id DESC LIMIT 1")
      .get();
    const currentFacts = facts!;
    currentFacts.lastAppliedMigrationId =
      baseline === undefined ? null : databaseMigrationIdSchema.safeParse(baseline.id).data;

    let applied = 0;
    for (const step of SQLITE_MIGRATIONS) {
      try {
        // 前项 SQL 或通知可改变后项账本，每项都读取当时的身份与校验值。
        if (isApplied(database, databasePath, step)) {
          applied++;
          continue;
        }
        if (currentFacts.kind === "none") currentFacts.kind = "upgrade";
        yield {
          type: "progress",
          report: {
            ...report("migrating"),
            migrationId: step.id,
            applied,
            total: SQLITE_MIGRATIONS.length,
          },
        };
        database.exec(step.sql);
        currentFacts.executedCount++;
        database
          .prepare(`
          INSERT INTO schema_migration (id, checksum, app_version, time_applied) VALUES (?, ?, ?, ?)
        `)
          .run(step.id, checksum(step.sql), step.appVersion, Date.now());
      } catch (cause) {
        throw normalizeMigrationFailure(cause, databasePath, step.id);
      }
      applied++;
    }
    yield { type: "progress", report: report("committing") };
    database.exec("COMMIT");
    ownsTransaction = false;
    currentFacts.committedCount = currentFacts.executedCount;
    yield { type: "progress", report: report("ready") };
  } catch (cause) {
    rollbackOwned();
    const failure = normalizeMigrationFailure(cause, databasePath);
    yield {
      type: "progress",
      report: {
        ...report("failed"),
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
