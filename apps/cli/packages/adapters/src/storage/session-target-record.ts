// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { GoalStatus, SessionGoal, SessionId } from "@knorvia/contracts";

interface TargetRow {
  session_id: SessionId;
  target_id: string;
  objective: string;
  summary_title: string | null;
  status: GoalStatus;
  token_budget: number | null;
  tokens_used: number;
  time_used_seconds: number;
  active_input_id: string | null;
  active_run_started_at: number | null;
  active_run_last_seen_at: number | null;
  time_created: number;
  time_updated: number;
}

export function readSessionTarget(
  db: DatabaseSync,
  input: { sessionID: SessionId },
): SessionGoal | null {
  const row = db
    .prepare("SELECT * FROM session_target WHERE session_id = ?")
    .get(input.sessionID) as unknown as TargetRow | undefined;
  if (!row) return null;
  return {
    sessionID: row.session_id,
    targetID: row.target_id,
    objective: row.objective,
    summaryTitle: row.summary_title,
    status: row.status,
    tokenBudget: row.token_budget,
    tokensUsed: row.tokens_used,
    timeUsedSeconds: row.time_used_seconds,
    activeInputId: row.active_input_id,
    activeRunStartedAtMs: row.active_run_started_at,
    activeRunLastSeenAtMs: row.active_run_last_seen_at,
    time: { created: row.time_created, updated: row.time_updated },
  };
}

export function requireSessionTarget(db: DatabaseSync, sessionID: SessionId): SessionGoal {
  const target = readSessionTarget(db, { sessionID });
  if (!target) throw new Error(`Session target not found after write: ${sessionID}`);
  return target;
}

export function touchTargetSession(db: DatabaseSync, sessionID: SessionId, at: number): void {
  db.prepare("UPDATE session SET time_updated = max(time_updated, ?) WHERE id = ?").run(
    at,
    sessionID,
  );
}

export function freshTarget(
  input: { sessionID: SessionId; objective: string; tokenBudget?: number | null },
  status: GoalStatus,
  now: number,
): SessionGoal {
  const targetID = `target_${Date.now().toString(36)}_${randomUUID()}`;
  return {
    sessionID: input.sessionID,
    targetID,
    objective: input.objective,
    summaryTitle: null,
    status,
    tokenBudget: input.tokenBudget ?? null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    activeInputId: null,
    activeRunStartedAtMs: null,
    activeRunLastSeenAtMs: null,
    time: { created: now, updated: now },
  };
}

export function insertTarget(
  db: DatabaseSync,
  target: SessionGoal,
  conflict: "update" | "ignore",
): void {
  const insert = conflict === "ignore" ? "INSERT OR IGNORE" : "INSERT";
  const update =
    conflict === "ignore"
      ? ""
      : `
    ON CONFLICT(session_id) DO UPDATE SET
      target_id = excluded.target_id,
      objective = excluded.objective,
      summary_title = excluded.summary_title,
      status = excluded.status,
      token_budget = excluded.token_budget,
      tokens_used = excluded.tokens_used,
      time_used_seconds = excluded.time_used_seconds,
      active_input_id = NULL,
      active_run_started_at = NULL,
      active_run_last_seen_at = NULL,
      time_created = excluded.time_created,
      time_updated = excluded.time_updated`;
  db.prepare(`${insert} INTO session_target (
    session_id, target_id, objective, summary_title, status, token_budget,
    tokens_used, time_used_seconds, active_input_id, active_run_started_at,
    active_run_last_seen_at, time_created, time_updated
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?) ${update}`).run(
    target.sessionID,
    target.targetID,
    target.objective,
    target.summaryTitle,
    target.status,
    target.tokenBudget,
    target.tokensUsed,
    target.timeUsedSeconds,
    target.time.created,
    target.time.updated,
  );
}
