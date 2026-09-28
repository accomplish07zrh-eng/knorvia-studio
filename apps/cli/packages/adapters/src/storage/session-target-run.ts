// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { GoalStatus, SessionGoal, SessionId } from "@knorvia/contracts";
import { withWriteTransaction } from "./session-store/repositories/write-transaction.js";
import {
  readSessionTarget,
  requireSessionTarget,
  touchTargetSession,
} from "./session-target-record.js";

const MILLISECONDS_PER_SECOND = 1000;
type StartedTarget = SessionGoal & { activeRunStartedAtMs: number };

function matchesRun(
  target: SessionGoal | null,
  targetID: string,
  inputID: string,
): target is StartedTarget {
  return (
    target !== null &&
    target.targetID === targetID &&
    target.activeInputId === inputID &&
    target.activeRunStartedAtMs != null
  );
}

function interruptedRun(
  target: SessionGoal | null,
): target is StartedTarget & { activeInputId: string } {
  return target !== null && Boolean(target.activeInputId) && target.activeRunStartedAtMs != null;
}

function runSeconds(start: number, end: number): number {
  return Math.max(0, Math.ceil((end - start) / MILLISECONDS_PER_SECOND));
}

export function startSessionTargetRun(
  db: DatabaseSync,
  input: { sessionID: SessionId; targetID: string; inputID: string; startedAtMs: number },
): SessionGoal | null {
  const startedAt = Math.max(0, input.startedAtMs);
  let result: SessionGoal | null = null;
  withWriteTransaction(db, "borrow", () => {
    const change = db
      .prepare(`UPDATE session_target SET active_input_id = ?,
      active_run_started_at = ?, active_run_last_seen_at = ?, time_updated = max(time_updated, ?)
      WHERE session_id = ? AND target_id = ? AND status = 'active'`)
      .run(input.inputID, startedAt, startedAt, startedAt, input.sessionID, input.targetID);
    if (change.changes === 0) {
      result = readSessionTarget(db, input);
      return;
    }
    touchTargetSession(db, input.sessionID, startedAt);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}

export function heartbeatSessionTargetRun(
  db: DatabaseSync,
  input: { sessionID: SessionId; targetID: string; inputID: string; seenAtMs: number },
): SessionGoal | null {
  const seenAt = Math.max(0, input.seenAtMs);
  let result: SessionGoal | null = null;
  withWriteTransaction(db, "borrow", () => {
    const change = db
      .prepare(`UPDATE session_target SET
      active_run_last_seen_at = max(coalesce(active_run_last_seen_at, 0), ?),
      time_updated = max(time_updated, ?)
      WHERE session_id = ? AND target_id = ? AND active_input_id = ?
        AND active_run_started_at IS NOT NULL`)
      .run(seenAt, seenAt, input.sessionID, input.targetID, input.inputID);
    if (change.changes === 0) {
      result = readSessionTarget(db, input);
      return;
    }
    touchTargetSession(db, input.sessionID, seenAt);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}

export function finishSessionTargetRun(
  db: DatabaseSync,
  input: {
    sessionID: SessionId;
    targetID: string;
    inputID: string;
    endedAtMs: number;
    status?: GoalStatus;
    tokensUsedDelta?: number;
  },
): SessionGoal | null {
  const before = readSessionTarget(db, input);
  if (!matchesRun(before, input.targetID, input.inputID)) return before;
  let result: SessionGoal | null = null;
  withWriteTransaction(db, "borrow", () => {
    // 加锁后再次观察事实再结算，避免使用取得写权限前已失效的运行起点。
    const current = readSessionTarget(db, input);
    if (!matchesRun(current, input.targetID, input.inputID)) {
      result = current;
      return;
    }
    const endedAt = Math.max(0, input.endedAtMs);
    const tokens = Math.max(0, input.tokensUsedDelta ?? 0);
    const seconds = runSeconds(current.activeRunStartedAtMs, endedAt);
    const requestedStatus = input.status;
    // 状态回退由绑定后的 SQLite 空值决定，不能在 JS 中提前判断是否提供状态。
    const change = db
      .prepare(`UPDATE session_target SET
      tokens_used = tokens_used + ?, time_used_seconds = time_used_seconds + ?,
      status = coalesce(?, CASE WHEN status = 'active' AND token_budget IS NOT NULL
        AND tokens_used + ? >= token_budget THEN 'budget_limited' ELSE status END),
      active_input_id = NULL, active_run_started_at = NULL, active_run_last_seen_at = NULL,
      time_updated = max(time_updated, ?)
      WHERE session_id = ? AND target_id = ? AND active_input_id = ? AND active_run_started_at = ?`)
      .run(
        tokens,
        seconds,
        requestedStatus ?? null,
        tokens,
        endedAt,
        input.sessionID,
        input.targetID,
        input.inputID,
        current.activeRunStartedAtMs,
      );
    if (change.changes === 0) {
      result = readSessionTarget(db, input);
      return;
    }
    touchTargetSession(db, input.sessionID, endedAt);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}

export function recoverInterruptedSessionTargetRun(
  db: DatabaseSync,
  input: { sessionID: SessionId },
): SessionGoal | null {
  const before = readSessionTarget(db, input);
  if (!interruptedRun(before)) return before;
  let result: SessionGoal | null = null;
  withWriteTransaction(db, "borrow", () => {
    const current = readSessionTarget(db, input);
    if (!interruptedRun(current)) {
      result = current;
      return;
    }
    const endedAt = current.activeRunLastSeenAtMs ?? current.activeRunStartedAtMs;
    const seconds = runSeconds(current.activeRunStartedAtMs, endedAt);
    const change = db
      .prepare(`UPDATE session_target SET time_used_seconds = time_used_seconds + ?,
      status = CASE WHEN status = 'active' THEN 'paused' ELSE status END,
      active_input_id = NULL, active_run_started_at = NULL, active_run_last_seen_at = NULL,
      time_updated = max(time_updated, ?)
      WHERE session_id = ? AND target_id = ? AND active_input_id = ? AND active_run_started_at = ?`)
      .run(
        seconds,
        endedAt,
        input.sessionID,
        current.targetID,
        current.activeInputId,
        current.activeRunStartedAtMs,
      );
    if (change.changes === 0) {
      result = readSessionTarget(db, input);
      return;
    }
    touchTargetSession(db, input.sessionID, endedAt);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}

export function accountSessionTargetUsage(
  db: DatabaseSync,
  input: {
    sessionID: SessionId;
    targetID: string;
    tokensUsedDelta?: number;
    timeUsedSecondsDelta?: number;
  },
): SessionGoal | null {
  const now = Date.now();
  const tokens = Math.max(0, input.tokensUsedDelta ?? 0);
  const seconds = Math.max(0, input.timeUsedSecondsDelta ?? 0);
  if (tokens === 0 && seconds === 0) return readSessionTarget(db, input);
  let result: SessionGoal | null = null;
  withWriteTransaction(db, "borrow", () => {
    // 计数和预算判断留在 SQLite，保留列亲和性与异常数值的原生行为。
    const change = db
      .prepare(`UPDATE session_target SET
      tokens_used = tokens_used + ?, time_used_seconds = time_used_seconds + ?,
      status = CASE WHEN status = 'active' AND token_budget IS NOT NULL
        AND tokens_used + ? >= token_budget THEN 'budget_limited' ELSE status END,
      time_updated = ? WHERE session_id = ? AND target_id = ?`)
      .run(tokens, seconds, tokens, now, input.sessionID, input.targetID);
    if (change.changes === 0) {
      result = readSessionTarget(db, input);
      return;
    }
    touchTargetSession(db, input.sessionID, now);
    result = requireSessionTarget(db, input.sessionID);
  });
  return result;
}
