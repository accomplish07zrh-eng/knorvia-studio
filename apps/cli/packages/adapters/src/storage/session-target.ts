// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话目标写入口：所有变更都在 "borrow" 事务边界内完成，避免留下半次写入。
// SQL 文本是数据格式的一部分，逐字冻结；本文件只调整 JS 编排与命名。

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

const UPDATE_STATUS = "UPDATE session_target SET status = ?, time_updated = ? WHERE session_id = ?";
const UPDATE_SUMMARY_TITLE =
  "UPDATE session_target SET summary_title = ?, time_updated = ?\n      WHERE session_id = ? AND target_id = ?";
const DELETE_TARGET = "DELETE FROM session_target WHERE session_id = ?";

/** 借用边界：无外层事务时也要保证这一段要么全成、要么不留痕。 */
function borrow(database: DatabaseSync, work: () => void): void {
  return withWriteTransaction(database, "borrow", work);
}

/** 触碰会话时间后读回目标：写入口里最常见的两步。 */
function touchAndReload(database: DatabaseSync, sessionID: SessionId, at: number): SessionGoal {
  touchTargetSession(database, sessionID, at);
  return requireSessionTarget(database, sessionID);
}

export function setSessionTarget(
  database: DatabaseSync,
  input: {
    objective: string;
    sessionID: SessionId;
    status: GoalStatus;
    tokenBudget?: number | null;
  },
): SessionGoal {
  const at = Date.now();
  const goal = freshTarget(input, input.status, at);
  let stored!: SessionGoal;
  // 目标写、会话触碰和读回同属一个借用边界；无外层事务时避免留下半次写入。
  borrow(database, () => {
    insertTarget(database, goal, "update");
    stored = touchAndReload(database, input.sessionID, at);
  });
  return stored;
}

export function cloneSessionTargetForFork(
  database: DatabaseSync,
  input: { source: SessionGoal; sessionID: SessionId; status: GoalStatus },
): SessionGoal {
  const at = Date.now();
  // 仅读取保留的事实，兼容继承属性，并避免求值即将清空的活动字段。
  const goal = {} as SessionGoal;
  goal.sessionID = input.sessionID;
  goal.targetID = input.source.targetID;
  goal.objective = input.source.objective;
  goal.summaryTitle = input.source.summaryTitle;
  goal.status = input.status;
  goal.tokenBudget = input.source.tokenBudget;
  goal.tokensUsed = input.source.tokensUsed;
  goal.timeUsedSeconds = input.source.timeUsedSeconds;
  goal.time = input.source.time;
  let stored!: SessionGoal;
  borrow(database, () => {
    insertTarget(database, goal, "update");
    stored = touchAndReload(database, input.sessionID, at);
  });
  return stored;
}

export function createSessionTarget(
  database: DatabaseSync,
  input: { objective: string; sessionID: SessionId; tokenBudget?: number | null },
): SessionGoal | null {
  const at = Date.now();
  const goal = freshTarget(input, "active", at);
  let stored: SessionGoal | null = null;
  borrow(database, () => {
    insertTarget(database, goal, "ignore");
    const existing = readSessionTarget(database, { sessionID: input.sessionID });
    if (existing?.targetID !== goal.targetID) return;
    // 相同生成 ID 也按身份决定成功，并保留触碰前的读取对象。
    touchTargetSession(database, input.sessionID, at);
    stored = existing;
  });
  return stored;
}

export function updateSessionTargetStatus(
  database: DatabaseSync,
  input: { sessionID: SessionId; status: GoalStatus },
): SessionGoal | null {
  const at = Date.now();
  let stored: SessionGoal | null = null;
  borrow(database, () => {
    const mutation = database.prepare(UPDATE_STATUS).run(input.status, at, input.sessionID);
    if (mutation.changes === 0) return;
    stored = touchAndReload(database, input.sessionID, at);
  });
  return stored;
}

export function updateSessionTargetSummaryTitle(
  database: DatabaseSync,
  input: { sessionID: SessionId; targetID: string; summaryTitle: string },
): SessionGoal | null {
  const at = Date.now();
  let stored: SessionGoal | null = null;
  borrow(database, () => {
    const mutation = database
      .prepare(UPDATE_SUMMARY_TITLE)
      .run(input.summaryTitle, at, input.sessionID, input.targetID);
    if (mutation.changes === 0) {
      stored = readSessionTarget(database, input);
      return;
    }
    stored = touchAndReload(database, input.sessionID, at);
  });
  return stored;
}

export function clearSessionTarget(
  database: DatabaseSync,
  input: { sessionID: SessionId },
): boolean {
  const at = Date.now();
  let removed = false;
  borrow(database, () => {
    const mutation = database.prepare(DELETE_TARGET).run(input.sessionID);
    if (mutation.changes === 0) return;
    touchTargetSession(database, input.sessionID, at);
    removed = true;
  });
  return removed;
}
