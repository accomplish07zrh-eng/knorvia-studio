// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 迁移执行器的两种驱动方式：同步用 Atomics.wait 阻塞，异步用定时器让出事件循环。
// 超时常量、PRAGMA 插值、失败阶段回调吞错等语义都是可观察契约，逐字保留。
// 进度与选项的形状声明见 migration-progress-types.ts，本文件原样再导出。

import type { DatabaseSync } from "node:sqlite";
import { setTimeout as wait } from "node:timers/promises";
import { createMigrationExecution } from "./migration-execution.js";
import type { AsyncSqliteMigrationOptions } from "./migration-progress-types.js";

export type {
  AsyncSqliteMigrationOptions,
  SqliteMigrationPhase,
  SqliteMigrationProgress,
} from "./migration-progress-types.js";

export const DEFAULT_SQLITE_STARTUP_LOCK_TIMEOUT_MS = 5000;
const ASYNC_LOCK_WAIT_TIMEOUT_MS = 3_600_000;
const ASYNC_NATIVE_BUSY_TIMEOUT_MS = 25;
const NORMAL_NATIVE_BUSY_TIMEOUT_MS = 5000;
const MIN_SYNC_WAIT_MS = 1;

type MigrationExecution = ReturnType<typeof createMigrationExecution>;

/** 同步等待：最小时长 1ms，用共享缓冲上的 Atomics.wait 阻塞当前线程。 */
function pauseSynchronously(milliseconds: number): void {
  const duration = Math.max(MIN_SYNC_WAIT_MS, Math.ceil(milliseconds));
  const cell = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(cell, 0, 0, duration);
}

/** 同步驱动：只处理 delay 信号，进度回调在同步路径不存在。 */
function drainSync(plan: MigrationExecution): void {
  let frame = plan.next();
  while (!frame.done) {
    if (frame.value.type === "delay") pauseSynchronously(frame.value.milliseconds);
    frame = plan.next();
  }
}

/** 异步驱动：delay 交给定时器；失败阶段的回调拒绝被吞掉，避免二次报错。 */
async function drainAsync(
  plan: MigrationExecution,
  options: AsyncSqliteMigrationOptions,
): Promise<void> {
  let frame = plan.next();
  while (!frame.done) {
    const effect = frame.value;
    if (effect.type === "delay") {
      await wait(effect.milliseconds);
    } else {
      const failingPhase = effect.progress.phase === "failed";
      try {
        await options.onProgress?.(effect.progress);
      } catch (cause) {
        if (!failingPhase) throw cause;
      }
    }
    frame = plan.next();
  }
}

/** 一次执行 + 收尾：清理抛出的原因只在这里决定是否上抛，绝不覆盖主执行的失败。 */
function runWithCleanup(work: () => void, cleanup: () => void): void {
  let cleanupFailed = false;
  let cleanupFailure: unknown;
  try {
    work();
  } finally {
    try {
      cleanup();
    } catch (cause) {
      cleanupFailed = true;
      cleanupFailure = cause;
    }
  }
  if (cleanupFailed) throw cleanupFailure;
}

/** 一次执行 + 异步收尾：与同步版同构，只是 work 需要 await。 */
async function runWithCleanupAsync(work: () => Promise<void>, cleanup: () => void): Promise<void> {
  let cleanupFailed = false;
  let cleanupFailure: unknown;
  try {
    await work();
  } finally {
    try {
      cleanup();
    } catch (cause) {
      cleanupFailed = true;
      cleanupFailure = cause;
    }
  }
  if (cleanupFailed) throw cleanupFailure;
}

export function runSqliteSessionMigrations(
  database: DatabaseSync,
  databasePath: string,
  lockTimeoutMs = DEFAULT_SQLITE_STARTUP_LOCK_TIMEOUT_MS,
): void {
  const plan = createMigrationExecution(database, databasePath, lockTimeoutMs);
  // 主执行的抛出原样穿过 finally；仅正常完成后才处理已记录的清理失败。
  runWithCleanup(
    () => drainSync(plan),
    () => plan.return(undefined),
  );
}

export async function runSqliteSessionMigrationsAsync(
  database: DatabaseSync,
  databasePath: string,
  options: AsyncSqliteMigrationOptions = {},
): Promise<void> {
  const plan = createMigrationExecution(
    database,
    databasePath,
    options.lockWaitTimeoutMs ?? ASYNC_LOCK_WAIT_TIMEOUT_MS,
  );
  database.exec(`PRAGMA busy_timeout = ${ASYNC_NATIVE_BUSY_TIMEOUT_MS}`);
  // 关闭失败仍跳过恢复；清理失败留到最后处理，避免覆盖原始拒绝值。
  await runWithCleanupAsync(
    () => drainAsync(plan, options),
    () => {
      plan.return(undefined);
      database.exec(`PRAGMA busy_timeout = ${NORMAL_NATIVE_BUSY_TIMEOUT_MS}`);
    },
  );
}
