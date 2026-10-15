// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 全量放行的提交：先做一致性校验，再以 BEGIN IMMEDIATE 独占事务提交。
// 事务控制语句与错误文案都是可观察契约，逐字保留。

import type { DatabaseSync } from "node:sqlite";
import {
  applyFullAccessProgram,
  type FullAccessCommitInput,
} from "./permission-full-access-program.js";

const SESSION_MISMATCH = "Permission commit session mismatch";
const NEEDS_IDLE_TRANSACTION = "Full access commit requires an idle transaction";
const ROLLBACK_FAILED = "Full access rollback failed";

/** 三方会话必须一致：执行记录、回执与入参都指向同一次会话。 */
function assertSameSession(request: FullAccessCommitInput): void {
  const mismatched =
    request.execution.sessionID !== request.sessionID ||
    request.receipt.sessionID !== request.sessionID;
  if (mismatched) throw new Error(SESSION_MISMATCH);
}

/**
 * SQLite 的 RAISE(ROLLBACK) 已终止事务；再次回滚会覆盖真正失败的 SQL 原因。
 * 因此只在事务仍开着时回滚，且回滚自身失败时才抛聚合错误。
 */
function rollbackOrAggregate(database: DatabaseSync, cause: unknown): never {
  if (!database.isTransaction) throw cause;
  try {
    database.exec("ROLLBACK");
  } catch (rollbackFailure) {
    throw new AggregateError([cause, rollbackFailure], ROLLBACK_FAILED);
  }
  throw cause;
}

/** The storage owner commits synchronously before resolving the existing async port. */
export async function commitPermissionFullAccess(
  database: DatabaseSync,
  request: FullAccessCommitInput,
): Promise<void> {
  request.signal?.throwIfAborted();
  assertSameSession(request);
  // 相邻 owner 可能持事务等待；此提交只能取得并终止自己的事务。
  if (database.isTransaction) throw new Error(NEEDS_IDLE_TRANSACTION);
  database.exec("BEGIN IMMEDIATE");
  try {
    applyFullAccessProgram(database, request);
    database.exec("COMMIT");
  } catch (cause) {
    rollbackOrAggregate(database, cause);
  }
}
