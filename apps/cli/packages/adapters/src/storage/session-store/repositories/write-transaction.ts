// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话存储的写事务入口。
//
// 两种所有权语义：
//   - `own`：自己开事务（BEGIN IMMEDIATE 取写锁 → write → COMMIT）；
//   - `borrow`：调用方已有事务且允许借用时，直接执行，不再嵌套一层。
//     若调用方持的是别的事务而这里又需要自己的边界，则按 `own` 处理。
//
// 三条错误处理约定：
//   ① **BEGIN 失败时没有取得事务** → 不能回滚调用方已持有的事务，所以 BEGIN 放在 try 之外；
//   ② **SQLite 可能已自动回滚** → 回滚前先查 `isTransaction`，避免用「回滚失败」覆盖真正的写入失败；
//   ③ **回滚也失败** → 聚合两个失败并保留 cause，让上层能同时看到「写失败」与「回滚失败」。

import type { DatabaseSync } from "node:sqlite";

const ROLLBACK_FAILURE = "Session storage write failed and rollback failed";

/** 事务的所有权：自己开，还是借用调用方已开的那个。 */
type Ownership = "own" | "borrow";

/** 能否直接借用调用方的事务：声明借用且当前确实在事务里。 */
function canBorrow(db: DatabaseSync, ownership: Ownership): boolean {
  if (ownership !== "borrow") return false;
  return db.isTransaction;
}

/**
 * 尽力回滚未提交的写入。
 *
 * 回滚本身失败时把两个失败聚合起来 —— 单独的「回滚失败」会掩盖真正的写入原因。
 */
function rollbackOrAggregate(db: DatabaseSync, failure: unknown): never {
  // SQLite 可能已自动回滚；此时重复 ROLLBACK 会覆盖真正的写入失败。
  if (!db.isTransaction) throw failure;

  try {
    db.exec("ROLLBACK");
  } catch (rollbackFailure) {
    throw new AggregateError([failure, rollbackFailure], ROLLBACK_FAILURE, { cause: failure });
  }
  throw failure;
}

/** 自有事务路径：取写锁 → 执行 → 提交；任一步失败都走回滚收尾。 */
function runOwnTransaction(db: DatabaseSync, write: () => void): void {
  // BEGIN 失败时没有取得事务，不能回滚调用者已经持有的事务 —— 所以它不在 try 内。
  db.exec("BEGIN IMMEDIATE");
  try {
    write();
    db.exec("COMMIT");
  } catch (failure) {
    rollbackOrAggregate(db, failure);
  }
}

export function withWriteTransaction(
  db: DatabaseSync,
  ownership: Ownership,
  write: () => void,
): void {
  if (canBorrow(db, ownership)) {
    // 借用已有事务：直接执行，不再包一层（嵌套 BEGIN 会改变提交语义）。
    write();
    return;
  }
  runOwnTransaction(db, write);
}
