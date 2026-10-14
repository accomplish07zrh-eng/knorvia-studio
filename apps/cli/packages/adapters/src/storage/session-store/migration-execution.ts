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
  /* 账本比对用的 SHA-256 摘要（对空白不敏感） */
  return createHash("sha256").update(sql.trim()).digest("hex");
}

function isApplied(
  database: DatabaseSync,
  /* 目标库路径（错误上下文用） */ dbPath: string,
  migration: { id: string; sql: string },
): boolean {
  const entry = database
    .prepare("SELECT checksum FROM schema_migration WHERE id = ?")
    .get(migration.id);
  if (entry === undefined) return false;
  if (entry.checksum !== checksum(migration.sql)) {
    throw new /* 校验值不一致即拒绝继续 */ SqliteSessionMigrationError(
      `SQLite migration checksum mismatch for ${migration.id}. Historical migrations are immutable; add a new migration instead.`,
      { dbPath, kind: "checksum_mismatch", migrationId: migration.id },
    );
  }
  return true;
}

function inspectCatalog(database: DatabaseSync, dbPath: string): DatabaseMigrationFacts["kind"] {
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
    if (!SQLITE_MIGRATIONS.some((migration) => migration.id === id)) {
      throw new /* 库里有本构建不认识的迁移 */ SqliteSessionMigrationError(
        "Session database has migrations unknown to this build; open it with a newer compatible version.",
        { dbPath, kind: "newer_database" },
      );
    }
  }
  let missing = false;
  for (const migration of /* 全量清单逐项核对 */ SQLITE_MIGRATIONS) {
    if (!hasLedger || !isApplied(database, dbPath, migration)) missing = true;
  }
  if (!missing) return "none";
  const applicationTable = database
    .prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT IN ('schema_migration', 'sqlite_sequence') LIMIT 1
  `)
    /* 取第一张业务表 */ .get();
  return applicationTable === undefined ? "initialize" : "upgrade";
}

function ensureWal(database: DatabaseSync, dbPath: string): void {
  const modeOf = (entry: Record<string, unknown> | undefined): string =>
    typeof entry?.journal_mode === "string" ? entry.journal_mode.toLowerCase() : "unknown";
  const accepted = (mode: string): boolean =>
    mode === "wal" || (dbPath === ":memory:" && mode === "memory");
  const current = modeOf(database.prepare("PRAGMA journal_mode").get());
  if (accepted(current)) return;
  const selected = modeOf(database.prepare("PRAGMA journal_mode = WAL").get());
  if (!accepted(selected)) {
    throw new /* 拒绝切 WAL 即视为迁移失败 */ SqliteSessionMigrationError(
      `SQLite refused WAL journal mode for ${dbPath}; received ${selected}`,
      { dbPath, kind: "sql_failed" },
    );
  }
}

export function* createMigrationExecution(
  database: DatabaseSync,
  /* 目标库路径 */ dbPath: string,
  /* 锁等待上限（毫秒） */ lockTimeoutMs: number,
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
    const kind = inspectCatalog(database, dbPath);
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
        /* 执行临界区操作 */
        operation();
        return;
      } catch (failure) {
        if (!isSqliteBusy(failure)) throw failure;
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw failure;
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
    database.exec("PRAGMA foreign_keys = ON");
    yield* /* 升级前先落快照 */ acquire(() => {
      if (observe() === "upgrade") createSessionMigrationSnapshot(database, dbPath);
    });
    yield* /* 确保 WAL 模式 */ acquire(() => ensureWal(database, dbPath));
    yield* /* 落闸后再观察一次目录 */ acquire(() => {
      observe();
    });
    yield { type: "progress", progress: progress("checking") };
    yield* acquire(() => {
      database.exec("BEGIN IMMEDIATE");
    });
    ownsTransaction = true;
    inspectCatalog(database, dbPath);
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
      /* 最新账本行 */ .get();
    const currentFacts = facts!;
    currentFacts.lastAppliedMigrationId =
      baseline === undefined ? null : databaseMigrationIdSchema.safeParse(baseline.id).data;

    let appliedCount = 0;
    for (const migration of /* 逐项执行未应用的迁移 */ SQLITE_MIGRATIONS) {
      try {
        // 前项 SQL 或通知可改变后项账本，每项都读取当时的身份与校验值。
        if (isApplied(database, dbPath, migration)) {
          appliedCount++;
          continue;
        }
        if (currentFacts.kind === "none") currentFacts.kind = "upgrade";
        yield {
          type: "progress",
          progress: {
            ...progress(/* 逐项执行阶段 */ "migrating"),
            /* 当前迁移标识 */ migrationId: migration.id,
            completed: /* 已应用（含此前已存在的）项数 */ appliedCount,
            total: SQLITE_MIGRATIONS.length,
          },
        };
        database.exec(migration.sql);
        currentFacts.executedCount++;
        database
          .prepare(`
          INSERT INTO schema_migration (id, checksum, app_version, time_applied) VALUES (?, ?, ?, ?)
        `)
          .run(migration.id, checksum(migration.sql), migration.appVersion, Date.now());
      } catch (error) {
        throw normalizeMigrationFailure(error, dbPath, migration.id);
      }
      appliedCount++;
    }
    yield { type: "progress", progress: progress("committing") };
    database.exec("COMMIT");
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
