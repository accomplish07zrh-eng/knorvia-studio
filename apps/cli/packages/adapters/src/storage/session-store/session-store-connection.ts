// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { DatabaseSync } from "node:sqlite";
import { maybeThrowStorageFsFault } from "../fs-fault-injection.js";
import { SqliteSessionMigrationError } from "./errors.js";
import { runSqliteSessionMigrations } from "./migration-runner.js";
import { ensureParentDir } from "./paths.js";

export function openSessionDatabase(dbPath: string, timeout: number): DatabaseSync {
  try {
    ensureParentDir(dbPath);
    maybeThrowStorageFsFault({ operation: "sqliteOpen", path: dbPath });
    return new DatabaseSync(dbPath, { timeout });
  } catch (cause) {
    throw new SqliteSessionMigrationError(`Failed to open SQLite session database at ${dbPath}`, {
      cause,
      dbPath,
      kind: "open_failed",
    });
  }
}

function closeFailedStartup(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    // 关闭只是失败启动的清理，不能遮蔽通知拒绝等原始值（包括 undefined）。
  }
}

export function initializeSessionDatabase(db: DatabaseSync, dbPath: string, timeout: number): void {
  try {
    runSqliteSessionMigrations(db, dbPath, timeout);
  } catch (error) {
    closeFailedStartup(db);
    throw error;
  }
}

export function checkSessionWriteFault(dbPath: string): void {
  maybeThrowStorageFsFault({ operation: "sqliteRun", path: dbPath });
}
