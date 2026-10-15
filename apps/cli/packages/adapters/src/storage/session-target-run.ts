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

type StartedTarget = SessionGoal & { activeRunStartedAtMs: number };

interface SessionRef {
  sessionID: SessionId;
}

interface RunRef extends SessionRef {
  inputID: string;
  targetID: string;
}

interface StartRunInput extends RunRef {
  startedAtMs: number;
}

interface HeartbeatInput extends RunRef {
  seenAtMs: number;
}

interface FinishRunInput extends RunRef {
  endedAtMs: number;
  status?: GoalStatus;
  tokensUsedDelta?: number;
}

interface AccountUsageInput extends SessionRef {
  targetID: string;
  timeUsedSecondsDelta?: number;
  tokensUsedDelta?: number;
}

interface SettleInput {
  at: number;
  database: DatabaseSync;
  mutation: { changes: number | bigint };
  session: SessionRef;
}

/** 借用边界：与写入口一致，无外层事务时也不留半次写入。 */
function borrow(database: DatabaseSync, work: () => void): void {
  return withWriteTransaction(database, "borrow", work);
}

/** 本次运行是否就是「已开始」的那一次：target/request 都对且起点存在。 */
function matchesRun(
  target: SessionGoal | null,
  expectedTargetID: string,
  expectedInputID: string,
): target is StartedTarget {
  if (target === null) return false;
  if (target.targetID !== expectedTargetID) return false;
  if (target.activeInputId !== expectedInputID) return false;
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
function settle(request: SettleInput): SessionGoal | null {
  const { at, database, mutation, session } = request;
  if (mutation.changes === 0) return readSessionTarget(database, session);
  touchTargetSession(database, session.sessionID, at);
  return requireSessionTarget(database, session.sessionID);
}

export function startSessionTargetRun(
  database: DatabaseSync,
  request: StartRunInput,
): SessionGoal | null {
  const startedAt = Math.max(0, request.startedAtMs);
  let settled: SessionGoal | null = null;
  borrow(database, () => {
    const mutation = database
      .prepare(START_RUN_SQL)
      .run(request.inputID, startedAt, startedAt, startedAt, request.sessionID, request.targetID);
    settled = settle({ at: startedAt, database, mutation, session: request });
  });
  return settled;
}

export function heartbeatSessionTargetRun(
  database: DatabaseSync,
  request: HeartbeatInput,
): SessionGoal | null {
  const seenAt = Math.max(0, request.seenAtMs);
  let settled: SessionGoal | null = null;
  borrow(database, () => {
    const mutation = database
      .prepare(HEARTBEAT_SQL)
      .run(seenAt, seenAt, request.sessionID, request.targetID, request.inputID);
    settled = settle({ at: seenAt, database, mutation, session: request });
  });
  return settled;
}

export function finishSessionTargetRun(
  database: DatabaseSync,
  request: FinishRunInput,
): SessionGoal | null {
  const before = readSessionTarget(database, request);
  if (!matchesRun(before, request.targetID, request.inputID)) return before;
  let settled: SessionGoal | null = null;
  borrow(database, () => {
    // 加锁后再次观察事实再结算，避免使用取得写权限前已失效的运行起点。
    const current = readSessionTarget(database, request);
    if (!matchesRun(current, request.targetID, request.inputID)) {
      settled = current;
      return;
    }
    const endedAt = Math.max(0, request.endedAtMs);
    const tokens = Math.max(0, request.tokensUsedDelta ?? 0);
    const seconds = runSeconds(current.activeRunStartedAtMs, endedAt);
    // 状态回退由绑定后的 SQLite 空值决定，不能在 JS 中提前判断是否提供状态。
    const mutation = database
      .prepare(FINISH_RUN_SQL)
      .run(
        tokens,
        seconds,
        request.status ?? null,
        tokens,
        endedAt,
        request.sessionID,
        request.targetID,
        request.inputID,
        current.activeRunStartedAtMs,
      );
    settled = settle({ at: endedAt, database, mutation, session: request });
  });
  return settled;
}

export function recoverInterruptedSessionTargetRun(
  database: DatabaseSync,
  request: SessionRef,
): SessionGoal | null {
  const before = readSessionTarget(database, request);
  if (!interruptedRun(before)) return before;
  let settled: SessionGoal | null = null;
  borrow(database, () => {
    const current = readSessionTarget(database, request);
    if (!interruptedRun(current)) {
      settled = current;
      return;
    }
    const endedAt = current.activeRunLastSeenAtMs ?? current.activeRunStartedAtMs;
    const seconds = runSeconds(current.activeRunStartedAtMs, endedAt);
    const mutation = database
      .prepare(RECOVER_SQL)
      .run(
        seconds,
        endedAt,
        request.sessionID,
        current.targetID,
        current.activeInputId,
        current.activeRunStartedAtMs,
      );
    settled = settle({ at: endedAt, database, mutation, session: request });
  });
  return settled;
}

export function accountSessionTargetUsage(
  database: DatabaseSync,
  request: AccountUsageInput,
): SessionGoal | null {
  const at = Date.now();
  const tokens = Math.max(0, request.tokensUsedDelta ?? 0);
  const seconds = Math.max(0, request.timeUsedSecondsDelta ?? 0);
  if (tokens === 0 && seconds === 0) return readSessionTarget(database, request);
  let settled: SessionGoal | null = null;
  borrow(database, () => {
    // 计数和预算判断留在 SQLite，保留列亲和性与异常数值的原生行为。
    const mutation = database
      .prepare(ACCOUNT_SQL)
      .run(tokens, seconds, tokens, at, request.sessionID, request.targetID);
    settled = settle({ at, database, mutation, session: request });
  });
  return settled;
}
