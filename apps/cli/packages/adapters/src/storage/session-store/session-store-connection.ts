// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话库的连接与启动：打开数据库、跑迁移、并提供写入前的故障注入点。
//
// 打开阶段：
// 一、先确保父目录存在（会经过故障注入的 mkdir 钩子），再触发 sqliteOpen 钩子。
// 二、打开失败统一包成 open_failed 迁移错误，附带库路径与原始原因，便于上层提示。
//
// 迁移阶段：
// 三、迁移失败必须先把刚打开的连接关掉，避免占用库文件后无法重试。
// 四、关闭只是清理动作，失败（包括抛 undefined）不得遮蔽迁移的原始错误。
//
// 写入阶段：
// 五、写入前的 sqliteRun 钩子留在这一层，让端到端测试能统一拦截会话库写入。

import { DatabaseSync } from "node:sqlite";
import { maybeThrowStorageFsFault } from "../fs-fault-injection.js";
import { SqliteSessionMigrationError } from "./errors.js";
import { runSqliteSessionMigrations } from "./migration-runner.js";
import { ensureParentDir } from "./paths.js";

const OPEN_FAULT_OPERATION = "sqliteOpen";
const RUN_FAULT_OPERATION = "sqliteRun";

/** 打开连接：先建目录与注入点，再交给 DatabaseSync；失败即包成迁移错误。 */
export function openSessionDatabase(databasePath: string, budgetMs: number): DatabaseSync {
  try {
    ensureParentDir(databasePath);
    maybeThrowStorageFsFault({ operation: OPEN_FAULT_OPERATION, path: databasePath });
    return new DatabaseSync(databasePath, { timeout: budgetMs });
  } catch (cause) {
    throw new SqliteSessionMigrationError(
      `Failed to open SQLite session database at ${databasePath}`,
      {
        cause,
        dbPath: databasePath,
        kind: "open_failed",
      },
    );
  }
}

function closeFailedStartup(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    // 关闭只是失败启动的清理，不能遮蔽通知拒绝等原始值（包括 undefined）。
  }
}

export function initializeSessionDatabase(
  db: DatabaseSync,
  databasePath: string,
  budgetMs: number,
): void {
  try {
    runSqliteSessionMigrations(db, databasePath, budgetMs);
  } catch (cause) {
    closeFailedStartup(db);
    throw cause;
  }
}

export function checkSessionWriteFault(databasePath: string): void {
  maybeThrowStorageFsFault({ operation: RUN_FAULT_OPERATION, path: databasePath });
}
