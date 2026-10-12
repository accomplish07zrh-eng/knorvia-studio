// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { GoalStatus, SessionGoal, SessionId } from "@knorvia/contracts";

/** session_target 表的一行（列名即数据库列名，不可改）。 */
interface TargetRow {
  session_id: SessionId;
  target_id: string;
  time_created: number;
  time_updated: number;
  objective: string;
  summary_title: string | null;
  status: GoalStatus;
  token_budget: number | null;
  tokens_used: number;
  time_used_seconds: number;
  active_input_id: string | null;
  active_run_started_at: number | null;
  active_run_last_seen_at: number | null;
}

const TARGET_ID_PREFIX = "target_";
const SELECT_TARGET = "SELECT * FROM session_target WHERE session_id = ?";
const TOUCH_SESSION = "UPDATE session SET time_updated = max(time_updated, ?) WHERE id = ?";

/** 行 → 契约形状：列名转 camelCase，时间搓成 `time` 子对象。 */
function toSessionGoal(record: TargetRow): SessionGoal {
  const goal = {} as SessionGoal;
  goal.sessionID = record.session_id;
  goal.targetID = record.target_id;
  goal.objective = record.objective;
  goal.summaryTitle = record.summary_title;
  goal.status = record.status;
  goal.tokenBudget = record.token_budget;
  goal.tokensUsed = record.tokens_used;
  goal.timeUsedSeconds = record.time_used_seconds;
  goal.activeInputId = record.active_input_id;
  goal.activeRunStartedAtMs = record.active_run_started_at;
  goal.activeRunLastSeenAtMs = record.active_run_last_seen_at;
  goal.time = { created: record.time_created, updated: record.time_updated };
  return goal;
}

export function readSessionTarget(
  database: DatabaseSync,
  input: { sessionID: SessionId },
): SessionGoal | null {
  const statement = database.prepare(SELECT_TARGET);
  const record = statement.get(input.sessionID) as unknown as TargetRow | undefined;
  if (!record) return null;
  return toSessionGoal(record);
}

export function requireSessionTarget(database: DatabaseSync, sessionID: SessionId): SessionGoal {
  const goal = readSessionTarget(database, { sessionID });
  if (!goal) throw new Error(`Session target not found after write: ${sessionID}`);
  return goal;
}

export function touchTargetSession(database: DatabaseSync, sessionID: SessionId, at: number): void {
  database.prepare(TOUCH_SESSION).run(at, sessionID);
}

/** 新目标：id 形如 `target_<36 进制时间>_<uuid>`，计数与活动字段全部归零。 */
export function freshTarget(
  input: { sessionID: SessionId; objective: string; tokenBudget?: number | null },
  status: GoalStatus,
  now: number,
): SessionGoal {
  const stamp = Date.now().toString(36);
  const goal = {} as SessionGoal;
  goal.sessionID = input.sessionID;
  goal.targetID = `${TARGET_ID_PREFIX}${stamp}_${randomUUID()}`;
  goal.objective = input.objective;
  goal.summaryTitle = null;
  goal.status = status;
  goal.tokenBudget = input.tokenBudget ?? null;
  goal.tokensUsed = 0;
  goal.timeUsedSeconds = 0;
  goal.activeInputId = null;
  goal.activeRunStartedAtMs = null;
  goal.activeRunLastSeenAtMs = null;
  goal.time = { created: now, updated: now };
  return goal;
}

/** upsert 冲突分支：覆盖除活动运行外的一切列，活动字段显式清空。 */
const CONFLICT_UPDATE =
  "\n    ON CONFLICT(session_id) DO UPDATE SET\n      target_id = excluded.target_id,\n      objective = excluded.objective,\n      summary_title = excluded.summary_title,\n      status = excluded.status,\n      token_budget = excluded.token_budget,\n      tokens_used = excluded.tokens_used,\n      time_used_seconds = excluded.time_used_seconds,\n      active_input_id = NULL,\n      active_run_started_at = NULL,\n      active_run_last_seen_at = NULL,\n      time_created = excluded.time_created,\n      time_updated = excluded.time_updated";

const INSERT_COLUMNS =
  "session_target (\n    session_id, target_id, objective, summary_title, status, token_budget,\n    tokens_used, time_used_seconds, active_input_id, active_run_started_at,\n    active_run_last_seen_at, time_created, time_updated\n  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)";

export function insertTarget(
  database: DatabaseSync,
  target: SessionGoal,
  conflict: "update" | "ignore",
): void {
  const verb = conflict === "ignore" ? "INSERT OR IGNORE" : "INSERT";
  const clause = conflict === "ignore" ? "" : CONFLICT_UPDATE;
  const sql = `${verb} INTO ${INSERT_COLUMNS} ${clause}`;
  database
    .prepare(sql)
    .run(
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
