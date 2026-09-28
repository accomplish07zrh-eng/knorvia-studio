// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { GoalStatus, SessionGoal, SessionId } from "@knorvia/contracts";
import { withWriteTransaction } from "./session-store/repositories/write-transaction.js";
import {
  freshTarget,
  insertTarget,
  readSessionTarget,
  requireSessionTarget,
  touchTargetSession,
} from "./session-target-record.js";

export { readSessionTarget } from "./session-target-record.js";
export {
  accountSessionTargetUsage,
  finishSessionTargetRun,
  heartbeatSessionTargetRun,
  recoverInterruptedSessionTargetRun,
  startSessionTargetRun,
} from "./session-target-run.js";

export function setSessionTarget(
  db: DatabaseSync,
  input: {
    objective: string;
    sessionID: SessionId;
    status: GoalStatus;
    tokenBudget?: number | null;
  },
): SessionGoal {
  const now = Date.now();
  const target = freshTarget(input, input.status, now);
  let result!: SessionGoal;
  // 目标写、会话触碰和读回同属一个借用边界；无外层事务时避免留下半次写入。
  withWriteTransaction(db, "borrow", () => {
    insertTarget(db, target, "update");
    touchTargetSession(db, input.sessionID, now);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}

export function cloneSessionTargetForFork(
  db: DatabaseSync,
  input: { source: SessionGoal; sessionID: SessionId; status: GoalStatus },
): SessionGoal {
  const now = Date.now();
  // 仅读取保留的事实，兼容继承属性，并避免求值即将清空的活动字段。
  const target: SessionGoal = {
    sessionID: input.sessionID,
    targetID: input.source.targetID,
    objective: input.source.objective,
    summaryTitle: input.source.summaryTitle,
    status: input.status,
    tokenBudget: input.source.tokenBudget,
    tokensUsed: input.source.tokensUsed,
    timeUsedSeconds: input.source.timeUsedSeconds,
    time: input.source.time,
  };
  let result!: SessionGoal;
  withWriteTransaction(db, "borrow", () => {
    insertTarget(db, target, "update");
    touchTargetSession(db, input.sessionID, now);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}

export function createSessionTarget(
  db: DatabaseSync,
  input: { objective: string; sessionID: SessionId; tokenBudget?: number | null },
): SessionGoal | null {
  const now = Date.now();
  const target = freshTarget(input, "active", now);
  let result: SessionGoal | null = null;
  withWriteTransaction(db, "borrow", () => {
    insertTarget(db, target, "ignore");
    const stored = readSessionTarget(db, { sessionID: input.sessionID });
    if (stored?.targetID !== target.targetID) return;
    // 相同生成 ID 也按身份决定成功，并保留触碰前的读取对象。
    touchTargetSession(db, input.sessionID, now);
    result = stored;
  });
  return result;
}

export function updateSessionTargetStatus(
  db: DatabaseSync,
  input: { sessionID: SessionId; status: GoalStatus },
): SessionGoal | null {
  const now = Date.now();
  let result: SessionGoal | null = null;
  withWriteTransaction(db, "borrow", () => {
    const change = db
      .prepare("UPDATE session_target SET status = ?, time_updated = ? WHERE session_id = ?")
      .run(input.status, now, input.sessionID);
    if (change.changes === 0) return;
    touchTargetSession(db, input.sessionID, now);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}

export function updateSessionTargetSummaryTitle(
  db: DatabaseSync,
  input: { sessionID: SessionId; targetID: string; summaryTitle: string },
): SessionGoal | null {
  const now = Date.now();
  let result: SessionGoal | null = null;
  withWriteTransaction(db, "borrow", () => {
    const change = db
      .prepare(`UPDATE session_target SET summary_title = ?, time_updated = ?
      WHERE session_id = ? AND target_id = ?`)
      .run(input.summaryTitle, now, input.sessionID, input.targetID);
    if (change.changes === 0) {
      result = readSessionTarget(db, input);
      return;
    }
    touchTargetSession(db, input.sessionID, now);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}

export function clearSessionTarget(db: DatabaseSync, input: { sessionID: SessionId }): boolean {
  const now = Date.now();
  let cleared = false;
  withWriteTransaction(db, "borrow", () => {
    const change = db
      .prepare("DELETE FROM session_target WHERE session_id = ?")
      .run(input.sessionID);
    if (change.changes === 0) return;
    touchTargetSession(db, input.sessionID, now);
    cleared = true;
  });
  return cleared;
}
