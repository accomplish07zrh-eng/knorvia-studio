// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 迁移失败的归一：把原生 SQLite 错误分类成 SqliteSessionMigrationError，并保留原始 cause。
// 错误文案、kind 取值与 SQLite 结果码掩码都属于对外可观察契约，逐字保留。

import { classifyDatabaseStartupError } from "@knorvia/shared";
import { SqliteSessionMigrationError } from "./errors.js";

const SQLITE_BUSY_CODE = 5;
const SQLITE_PRIMARY_RESULT_MASK = 0xff;

/** 归一所需的上下文：原始错误 + 库路径 + 可选的迁移 id。 */
interface FailureContext {
  cause: unknown;
  dbPath: string;
  migrationId: string | undefined;
}

/** 判定是否 SQLITE_BUSY：只看主结果码，扩展码与掩码位不参与比较。 */
export function isSqliteBusy(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const errcode = (error as { errcode?: unknown }).errcode;
  if (typeof errcode !== "number") return false;
  return (errcode & SQLITE_PRIMARY_RESULT_MASK) === SQLITE_BUSY_CODE;
}

/** 等待迁移锁超时：kind 固定 lock_timeout，调用方据此决定是否重试。 */
function lockTimeoutFailure(context: FailureContext): SqliteSessionMigrationError {
  const { cause, dbPath, migrationId } = context;
  const text = `Timed out waiting for SQLite migration lock at ${dbPath}`;
  return new SqliteSessionMigrationError(text, {
    cause,
    dbPath,
    kind: "lock_timeout",
    migrationId,
  });
}

/** 其它失败：已带 migrationId 时把它写进文案，kind 交给共享分类器。 */
function classifiedFailure(context: FailureContext): SqliteSessionMigrationError {
  const { cause, dbPath, migrationId } = context;
  const text =
    migrationId === undefined
      ? `SQLite migration initialization failed for ${dbPath}`
      : `SQLite migration ${migrationId} failed for ${dbPath}`;
  return new SqliteSessionMigrationError(text, {
    cause,
    dbPath,
    kind: classifyDatabaseStartupError(cause),
    migrationId,
  });
}

export function normalizeMigrationFailure(
  cause: unknown,
  dbPath: string,
  migrationId?: string,
): SqliteSessionMigrationError {
  if (cause instanceof SqliteSessionMigrationError) return cause;
  const context: FailureContext = { cause, dbPath, migrationId };
  if (isSqliteBusy(cause)) return lockTimeoutFailure(context);
  return classifiedFailure(context);
}
