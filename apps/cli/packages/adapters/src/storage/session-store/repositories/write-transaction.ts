// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";

const ROLLBACK_FAILURE = "Session storage write failed and rollback failed";

export function withWriteTransaction(
  db: DatabaseSync,
  ownership: "own" | "borrow",
  write: () => void,
): void {
  if (ownership === "borrow" && db.isTransaction) {
    write();
    return;
  }

  // BEGIN 失败时没有取得事务，不能回滚调用者已经持有的事务。
  db.exec("BEGIN IMMEDIATE");
  try {
    write();
    db.exec("COMMIT");
  } catch (failure) {
    // SQLite 可能已自动回滚；重复 ROLLBACK 会覆盖真正的写入失败。
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackFailure) {
        throw new AggregateError([failure, rollbackFailure], ROLLBACK_FAILURE, { cause: failure });
      }
    }
    throw failure;
  }
}
