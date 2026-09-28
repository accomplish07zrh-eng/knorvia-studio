// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { DatabaseSync } from "node:sqlite";
import {
  applyFullAccessProgram,
  type FullAccessCommitInput,
} from "./permission-full-access-program.js";

/** The storage owner commits synchronously before resolving the existing async port. */
export async function commitPermissionFullAccess(
  db: DatabaseSync,
  input: FullAccessCommitInput,
): Promise<void> {
  input.signal?.throwIfAborted();
  if (
    input.execution.sessionID !== input.sessionID ||
    input.receipt.sessionID !== input.sessionID
  ) {
    throw new Error("Permission commit session mismatch");
  }
  // 相邻 owner 可能持事务等待；此提交只能取得并终止自己的事务。
  if (db.isTransaction) throw new Error("Full access commit requires an idle transaction");
  db.exec("BEGIN IMMEDIATE");
  try {
    applyFullAccessProgram(db, input);
    db.exec("COMMIT");
  } catch (failure) {
    // SQLite 的 RAISE(ROLLBACK) 已终止事务；再次回滚会覆盖真正失败的 SQL 原因。
    if (db.isTransaction) {
      try {
        db.exec("ROLLBACK");
      } catch (rollbackFailure) {
        throw new AggregateError([failure, rollbackFailure], "Full access rollback failed");
      }
    }
    throw failure;
  }
}
