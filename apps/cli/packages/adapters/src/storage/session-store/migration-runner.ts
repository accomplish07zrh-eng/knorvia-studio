// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import { setTimeout as wait } from "node:timers/promises";
import type { DatabaseMigrationFacts } from "@knorvia/shared";
import { createMigrationExecution } from "./migration-execution.js";

export const DEFAULT_SQLITE_STARTUP_LOCK_TIMEOUT_MS = 5000;
const ASYNC_LOCK_WAIT_TIMEOUT_MS = 3_600_000;
const ASYNC_NATIVE_BUSY_TIMEOUT_MS = 25;
const NORMAL_NATIVE_BUSY_TIMEOUT_MS = 5000;
const MIN_SYNC_WAIT_MS = 1;

export type SqliteMigrationPhase =
  | "checking"
  | "waiting_for_lock"
  | "migrating"
  | "committing"
  | "ready"
  | "failed";
export interface SqliteMigrationProgress {
  phase: SqliteMigrationPhase;
  migration?: DatabaseMigrationFacts;
  elapsedMs: number;
  migrationId?: string;
  completed?: number;
  total?: number;
  errorCode?: string;
  sqliteCode?: number;
  systemCode?: string;
}
export interface AsyncSqliteMigrationOptions {
  lockWaitTimeoutMs?: number;
  onProgress?: (progress: SqliteMigrationProgress) => Promise<void>;
}

export function runSqliteSessionMigrations(
  db: DatabaseSync,
  dbPath: string,
  lockTimeoutMs = DEFAULT_SQLITE_STARTUP_LOCK_TIMEOUT_MS,
): void {
  const execution = createMigrationExecution(db, dbPath, lockTimeoutMs);
  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    let step = execution.next();
    while (!step.done) {
      if (step.value.type === "delay") {
        const duration = Math.max(MIN_SYNC_WAIT_MS, Math.ceil(step.value.milliseconds));
        Atomics.wait(
          new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
          0,
          0,
          duration,
        );
      }
      step = execution.next();
    }
  } finally {
    // 主执行的抛出原样穿过 finally；仅正常完成后才处理已记录的清理失败。
    try {
      execution.return(undefined);
    } catch (error) {
      cleanupFailed = true;
      cleanupError = error;
    }
  }
  if (cleanupFailed) throw cleanupError;
}

export async function runSqliteSessionMigrationsAsync(
  db: DatabaseSync,
  dbPath: string,
  options: AsyncSqliteMigrationOptions = {},
): Promise<void> {
  const execution = createMigrationExecution(
    db,
    dbPath,
    options.lockWaitTimeoutMs ?? ASYNC_LOCK_WAIT_TIMEOUT_MS,
  );
  db.exec(`PRAGMA busy_timeout = ${ASYNC_NATIVE_BUSY_TIMEOUT_MS}`);
  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    let step = execution.next();
    while (!step.done) {
      const effect = step.value;
      if (effect.type === "delay") {
        await wait(effect.milliseconds);
      } else {
        const reportingFailure = effect.progress.phase === "failed";
        try {
          await options.onProgress?.(effect.progress);
        } catch (error) {
          if (!reportingFailure) throw error;
        }
      }
      step = execution.next();
    }
  } finally {
    // 关闭失败仍跳过恢复；清理失败留到 finally 外处理，避免覆盖原始拒绝值。
    try {
      execution.return(undefined);
      db.exec(`PRAGMA busy_timeout = ${NORMAL_NATIVE_BUSY_TIMEOUT_MS}`);
    } catch (error) {
      cleanupFailed = true;
      cleanupError = error;
    }
  }
  if (cleanupFailed) throw cleanupError;
}
