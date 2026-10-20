// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话库连接的建立与启动。这一层只做三件事：把库打开、把迁移跑完、把写入前的故障
// 注入点留住（端到端测试靠它统一拦截会话库写入）。
//
// 三条不可变的行为边界（存储读路径，改了旧库可能就打不开）：
// 1. 打开失败一律包成 SqliteSessionMigrationError，kind 固定为 open_failed，附 dbPath 与 cause；
// 2. 迁移失败必须先关掉刚开的连接，再把原始错误原样抛出 —— 不关连接会占住库文件，重试打不开；
// 3. 关闭是清理动作：它自己抛什么（包括抛 undefined）都不许遮蔽迁移的原始失败原因。

import { DatabaseSync } from "node:sqlite";
import { maybeThrowStorageFsFault } from "../fs-fault-injection.js";
import { SqliteSessionMigrationError } from "./errors.js";
import { runSqliteSessionMigrations } from "./migration-runner.js";
import { ensureParentDir } from "./paths.js";

/** 两个故障注入点：打开阶段与写入阶段。 */
const FAULT_POINT_OPEN = "sqliteOpen";
const FAULT_POINT_WRITE = "sqliteRun";

/** 打开失败的错误分类标识（对外可见，不要改）。 */
const OPEN_FAILED = "open_failed";

/** 打开阶段：建父目录 → 触发故障注入 → 交给 DatabaseSync。 */
function connect(databasePath: string, budgetMs: number): DatabaseSync {
  ensureParentDir(databasePath);
  maybeThrowStorageFsFault({ operation: FAULT_POINT_OPEN, path: databasePath });
  return new DatabaseSync(databasePath, { timeout: budgetMs });
}

/** 打开失败的统一包装：保留原始原因、库路径与固定分类。 */
function wrapOpenFailure(databasePath: string, cause: unknown): SqliteSessionMigrationError {
  const message = `Failed to open SQLite session database at ${databasePath}`;
  return new SqliteSessionMigrationError(message, {
    cause,
    dbPath: databasePath,
    kind: OPEN_FAILED,
  });
}

/**
 * 失败启动后的清理：关掉半开的连接。
 * 这里刻意吞掉一切抛出（包括抛 undefined）——上层已经握着更重要的原始错误。
 */
function discardFailedStartup(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    // 清理动作不得覆盖迁移或通知阶段的原始失败原因。
  }
}

/** 先释放连接，再把原始错误原样抛出；顺序不可颠倒。 */
function releaseThenRethrow(db: DatabaseSync, cause: unknown): never {
  discardFailedStartup(db);
  throw cause;
}

/** 打开连接。任何失败（含故障注入触发）都转成迁移错误。 */
export function openSessionDatabase(databasePath: string, budgetMs: number): DatabaseSync {
  try {
    return connect(databasePath, budgetMs);
  } catch (cause) {
    throw wrapOpenFailure(databasePath, cause);
  }
}

/** 跑迁移，失败时先释放连接再抛出原始错误。 */
export function initializeSessionDatabase(
  db: DatabaseSync,
  databasePath: string,
  budgetMs: number,
): void {
  try {
    runSqliteSessionMigrations(db, databasePath, budgetMs);
  } catch (cause) {
    releaseThenRethrow(db, cause);
  }
}

/** 写入前的故障注入检查：让测试能在真正写库之前拦截。 */
export function checkSessionWriteFault(databasePath: string): void {
  maybeThrowStorageFsFault({ operation: FAULT_POINT_WRITE, path: databasePath });
}
