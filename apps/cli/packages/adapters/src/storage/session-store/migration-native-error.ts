// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { classifyDatabaseStartupError } from "@knorvia/shared";
import { SqliteSessionMigrationError } from "./errors.js";

const SQLITE_BUSY_CODE = 5;
const SQLITE_PRIMARY_RESULT_MASK = 0xff;

export function isSqliteBusy(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { errcode?: unknown }).errcode;
  return typeof code === "number" && (code & SQLITE_PRIMARY_RESULT_MASK) === SQLITE_BUSY_CODE;
}

export function normalizeMigrationFailure(
  error: unknown,
  dbPath: string,
  migrationId?: string,
): SqliteSessionMigrationError {
  if (error instanceof SqliteSessionMigrationError) return error;
  if (isSqliteBusy(error)) {
    return new SqliteSessionMigrationError(
      `Timed out waiting for SQLite migration lock at ${dbPath}`,
      { cause: error, dbPath, kind: "lock_timeout", migrationId },
    );
  }
  const message =
    migrationId === undefined
      ? `SQLite migration initialization failed for ${dbPath}`
      : `SQLite migration ${migrationId} failed for ${dbPath}`;
  return new SqliteSessionMigrationError(message, {
    cause: error,
    dbPath,
    kind: classifyDatabaseStartupError(error),
    migrationId,
  });
}
