// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { DatabaseSync } from "node:sqlite";
import type { PermissionRuleset, ProjectPermissionUpdateInput } from "@knorvia/contracts";
import { readProjectRules, writePermissionCell } from "./project-permission-cell.js";

function snapshot(value: PermissionRuleset): { encoded: string; value: PermissionRuleset } {
  if (value && typeof (value as { then?: unknown }).then === "function") {
    // 非法 async updater 已经产生的拒绝需要有接收者；不能等待它或把 Promise 写成 {}。
    void Promise.resolve(value).catch(() => {});
    throw new TypeError("Project permission update must be synchronous");
  }
  const encoded = JSON.stringify(value);
  const decoded: PermissionRuleset | null | undefined = encoded ? JSON.parse(encoded) : undefined;
  // toJSON 也可能把规则对象变成标量或数组；仅新原子接口限制持久化根，保留未知成员。
  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded))
    throw new TypeError("Project permission update must return a ruleset");
  return { encoded, value: decoded };
}

export function commitProjectPermissionUpdate(
  db: DatabaseSync,
  input: ProjectPermissionUpdateInput,
): PermissionRuleset {
  const projectID = input.projectID;
  // 相邻 owner 可能在事务中等待。此方法只能拥有自己取得的写事务，不能提交/回滚别人。
  if (db.isTransaction) throw new Error("Project permission update requires an idle transaction");
  db.exec("BEGIN IMMEDIATE");
  try {
    const next = snapshot(input.update(readProjectRules(db, projectID)));
    writePermissionCell(db, projectID, "ruleset", next.encoded, Date.now());
    db.exec("COMMIT");
    return next.value;
  } catch (failure) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackFailure) {
      throw new AggregateError([failure, rollbackFailure], "Project permission rollback failed");
    }
    throw failure;
  }
}
