// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话存储的写事务入口。
//
// 两种所有权语义：
//   - `own`：自己开事务（取写锁 → 执行 → 提交）；
//   - `borrow`：调用方已有事务且允许借用时，直接执行，不再嵌套一层。
//     若调用方持的是别的事务而这里又需要自己的边界，则按 `own` 处理。
//
// 三条错误处理约定：
//   ① **BEGIN 失败时没有取得事务** → 不能回滚调用方已持有的事务，所以 BEGIN 放在 try 之外；
//   ② **SQLite 可能已自动回滚** → 回滚前先查 `isTransaction`，避免用「回滚失败」覆盖真正的写入失败；
//   ③ **回滚也失败** → 聚合两个失败并保留 cause，让上层能同时看到「写失败」与「回滚失败」。

import type { DatabaseSync } from "node:sqlite";

/** 回滚失败时的聚合文案。 */
const ROLLBACK_FAILURE = "Session storage write failed and rollback failed";

/**
 * 事务的三条语句。
 *
 * 收成一张表而不是散在函数里：这三句是「事务边界」的全部表达，
 * 放在一起才能看出「取写锁 → 提交 → 回滚」的对应关系。
 * `BEGIN IMMEDIATE` 而非普通 `BEGIN`：立刻取写锁，避免升级锁时死等。
 */
const TRANSACTION_SQL = {
  begin: "BEGIN IMMEDIATE",
  commit: "COMMIT",
  rollback: "ROLLBACK",
} as const;

/** 事务的所有权：自己开，还是借用调用方已开的那个。 */
type Ownership = "own" | "borrow";

/** 数据库句柄的短别名（签名里出现多次）。 */
type Db = DatabaseSync;

/** 写入动作：同步执行，不接受返回值。 */
type WriteAction = () => void;

/** 能否直接借用调用方的事务：声明借用且当前确实在事务里。 */
function canBorrow(db: Db, ownership: Ownership): boolean {
  if (ownership !== "borrow") return false;
  return db.isTransaction;
}

/**
 * 尽力回滚未提交的写入。
 *
 * 回滚本身失败时把两个失败聚合起来 —— 单独的「回滚失败」会掩盖真正的写入原因。
 */
function rollbackOrAggregate(db: Db, failure: unknown): never {
  // SQLite 可能已自动回滚；此时重复 ROLLBACK 会覆盖真正的写入失败。
  if (!db.isTransaction) throw failure;

  try {
    db.exec(TRANSACTION_SQL.rollback);
  } catch (rollbackFailure) {
    throw new AggregateError([failure, rollbackFailure], ROLLBACK_FAILURE, { cause: failure });
  }
  throw failure;
}

/** 自有事务路径：取写锁 → 执行 → 提交；任一步失败都走回滚收尾。 */
function runOwnTransaction(db: Db, write: WriteAction): void {
  // BEGIN 失败时没有取得事务，不能回滚调用者已经持有的事务 —— 所以它不在 try 内。
  db.exec(TRANSACTION_SQL.begin);
  try {
    write();
    db.exec(TRANSACTION_SQL.commit);
  } catch (failure) {
    rollbackOrAggregate(db, failure);
  }
}

export function withWriteTransaction(db: Db, ownership: Ownership, write: WriteAction): void {
  if (canBorrow(db, ownership)) {
    // 借用已有事务：直接执行，不再包一层（嵌套 BEGIN 会改变提交语义）。
    write();
    return;
  }
  runOwnTransaction(db, write);
}
