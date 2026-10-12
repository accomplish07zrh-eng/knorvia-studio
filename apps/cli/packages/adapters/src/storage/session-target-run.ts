// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话目标的运行态写入口：开始/心跳/结算/恢复/计量五种变更，全部在 "borrow"
// 事务内先重读事实再落 SQL；SQL 文本属数据格式，逐字冻结。

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

const START_RUN_SQL =
  "UPDATE session_target SET active_input_id = ?,\n      active_run_started_at = ?, active_run_last_seen_at = ?, time_updated = max(time_updated, ?)\n      WHERE session_id = ? AND target_id = ? AND status = 'active'";

const HEARTBEAT_SQL =
  "UPDATE session_target SET\n      active_run_last_seen_at = max(coalesce(active_run_last_seen_at, 0), ?),\n      time_updated = max(time_updated, ?)\n      WHERE session_id = ? AND target_id = ? AND active_input_id = ?\n        AND active_run_started_at IS NOT NULL";

const FINISH_RUN_SQL =
  "UPDATE session_target SET\n      tokens_used = tokens_used + ?, time_used_seconds = time_used_seconds + ?,\n      status = coalesce(?, CASE WHEN status = 'active' AND token_budget IS NOT NULL\n        AND tokens_used + ? >= token_budget THEN 'budget_limited' ELSE status END),\n      active_input_id = NULL, active_run_started_at = NULL, active_run_last_seen_at = NULL,\n      time_updated = max(time_updated, ?)\n      WHERE session_id = ? AND target_id = ? AND active_input_id = ? AND active_run_started_at = ?";

const RECOVER_SQL =
  "UPDATE session_target SET time_used_seconds = time_used_seconds + ?,\n      status = CASE WHEN status = 'active' THEN 'paused' ELSE status END,\n      active_input_id = NULL, active_run_started_at = NULL, active_run_last_seen_at = NULL,\n      time_updated = max(time_updated, ?)\n      WHERE session_id = ? AND target_id = ? AND active_input_id = ? AND active_run_started_at = ?";

const ACCOUNT_SQL =
  "UPDATE session_target SET\n      tokens_used = tokens_used + ?, time_used_seconds = time_used_seconds + ?,\n      status = CASE WHEN status = 'active' AND token_budget IS NOT NULL\n        AND tokens_used + ? >= token_budget THEN 'budget_limited' ELSE status END,\n      time_updated = ? WHERE session_id = ? AND target_id = ?";

/** 借用边界：与写入口一致，无外层事务时也不留半次写入。 */
function borrow<T>(database: DatabaseSync, work: () => T): T {
  return withWriteTransaction(database, "borrow", work);
}

/** 本次运行是否就是「已开始」的那一次：target/input 都对且起点存在。 */
function matchesRun(
  target: SessionGoal | null,
  targetID: string,
  inputID: string,
): target is StartedTarget {
  if (target === null) return false;
  if (target.targetID !== targetID) return false;
  if (target.activeInputId !== inputID) return false;
  return target.activeRunStartedAtMs != null;
}

/** 是否存在需要恢复的中断运行。 */
function interruptedRun(
  target: SessionGoal | null,
): target is StartedTarget & { activeInputId: string } {
  if (target === null) return false;
  return Boolean(target.activeInputId) && target.activeRunStartedAtMs != null;
}

function runSeconds(start: number, end: number): number {
  return Math.max(0, Math.ceil((end - start) / MILLISECONDS_PER_SECOND));
}

/** 结算出口：SQL 未命中就读回现状，命中则触碰时间并读回。 */
function settle(
  database: DatabaseSync,
  input: { sessionID: SessionId },
  at: number,
  mutation: { changes: number },
): SessionGoal | null {
  if (mutation.changes === 0) return readSessionTarget(database, input);
  touchTargetSession(database, input.sessionID, at);
  return requireSessionTarget(database, input.sessionID);
}

export function startSessionTargetRun(
  database: DatabaseSync,
  input: { sessionID: SessionId; targetID: string; inputID: string; startedAtMs: number },
): SessionGoal | null {
  const startedAt = Math.max(0, input.startedAtMs);
  let outcome: SessionGoal | null = null;
  borrow(database, () => {
    const mutation = database
      .prepare(START_RUN_SQL)
      .run(input.inputID, startedAt, startedAt, startedAt, input.sessionID, input.targetID);
    outcome = settle(database, input, startedAt, mutation);
  });
  return outcome;
}

export function heartbeatSessionTargetRun(
  database: DatabaseSync,
  input: { sessionID: SessionId; targetID: string; inputID: string; seenAtMs: number },
): SessionGoal | null {
  const seenAt = Math.max(0, input.seenAtMs);
  let outcome: SessionGoal | null = null;
  borrow(database, () => {
    const mutation = database
      .prepare(HEARTBEAT_SQL)
      .run(seenAt, seenAt, input.sessionID, input.targetID, input.inputID);
    outcome = settle(database, input, seenAt, mutation);
  });
  return outcome;
}

export function finishSessionTargetRun(
  database: DatabaseSync,
  input: {
    sessionID: SessionId;
    targetID: string;
    inputID: string;
    endedAtMs: number;
    status?: GoalStatus;
    tokensUsedDelta?: number;
  },
): SessionGoal | null {
  const before = readSessionTarget(database, input);
  if (!matchesRun(before, input.targetID, input.inputID)) return before;
  let outcome: SessionGoal | null = null;
  borrow(database, () => {
    // 加锁后再次观察事实再结算，避免使用取得写权限前已失效的运行起点。
    const current = readSessionTarget(database, input);
    if (!matchesRun(current, input.targetID, input.inputID)) {
      outcome = current;
      return;
    }
    const endedAt = Math.max(0, input.endedAtMs);
    const tokens = Math.max(0, input.tokensUsedDelta ?? 0);
    const seconds = runSeconds(current.activeRunStartedAtMs, endedAt);
    // 状态回退由绑定后的 SQLite 空值决定，不能在 JS 中提前判断是否提供状态。
    const mutation = database
      .prepare(FINISH_RUN_SQL)
      .run(
        tokens,
        seconds,
        input.status ?? null,
        tokens,
        endedAt,
        input.sessionID,
        input.targetID,
        input.inputID,
        current.activeRunStartedAtMs,
      );
    outcome = settle(database, input, endedAt, mutation);
  });
  return outcome;
}

export function recoverInterruptedSessionTargetRun(
  database: DatabaseSync,
  input: { sessionID: SessionId },
): SessionGoal | null {
  const before = readSessionTarget(database, input);
  if (!interruptedRun(before)) return before;
  let outcome: SessionGoal | null = null;
  borrow(database, () => {
    const current = readSessionTarget(database, input);
    if (!interruptedRun(current)) {
      outcome = current;
      return;
    }
    const endedAt = current.activeRunLastSeenAtMs ?? current.activeRunStartedAtMs;
    const seconds = runSeconds(current.activeRunStartedAtMs, endedAt);
    const mutation = database
      .prepare(RECOVER_SQL)
      .run(
        seconds,
        endedAt,
        input.sessionID,
        current.targetID,
        current.activeInputId,
        current.activeRunStartedAtMs,
      );
    outcome = settle(database, input, endedAt, mutation);
  });
  return outcome;
}

export function accountSessionTargetUsage(
  database: DatabaseSync,
  input: {
    sessionID: SessionId;
    targetID: string;
    tokensUsedDelta?: number;
    timeUsedSecondsDelta?: number;
  },
): SessionGoal | null {
  const at = Date.now();
  const tokens = Math.max(0, input.tokensUsedDelta ?? 0);
  const seconds = Math.max(0, input.timeUsedSecondsDelta ?? 0);
  if (tokens === 0 && seconds === 0) return readSessionTarget(database, input);
  let outcome: SessionGoal | null = null;
  borrow(database, () => {
    // 计数和预算判断留在 SQLite，保留列亲和性与异常数值的原生行为。
    const mutation = database
      .prepare(ACCOUNT_SQL)
      .run(tokens, seconds, tokens, at, input.sessionID, input.targetID);
    outcome = settle(database, input, at, mutation);
  });
  return outcome;
}
