// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type {
  CreateScriptWorkflowActivityInput,
  CreateSessionTaskLinkInput,
  ScriptWorkflowActivityRecord,
  ScriptWorkflowEventRecord,
  ScriptWorkflowStorePort,
  SessionTaskLinkRecord,
  UpdateScriptWorkflowActivityInput,
} from "@knorvia/contracts";
import { encodeJson } from "../json.js";
import { decodeActivity, decodeEvent, decodeTaskLink } from "./script-workflow-codecs.js";
import type {
  SessionTaskLinkRow,
  WorkflowActivityRow,
  WorkflowEventRow,
} from "./script-workflow-codecs.js";
import { withWriteTransaction } from "./write-transaction.js";

type EventInput = Parameters<ScriptWorkflowStorePort["appendScriptWorkflowEvent"]>[0];
type CacheQuery = Parameters<ScriptWorkflowStorePort["findCachedScriptWorkflowActivity"]>[0];

function readActivity(db: DatabaseSync, id: string): ScriptWorkflowActivityRecord | null {
  const row = db.prepare("SELECT * FROM workflow_activity WHERE id = ?").get(id) as unknown as
    | WorkflowActivityRow
    | undefined;
  return row ? decodeActivity(row) : null;
}

function readWrittenActivity(db: DatabaseSync, id: string): ScriptWorkflowActivityRecord {
  const result = readActivity(db, id);
  if (!result) throw new Error(`Workflow activity not found after write: ${id}`);
  return result;
}

export async function createScriptWorkflowActivity(
  db: DatabaseSync,
  input: CreateScriptWorkflowActivityInput,
): Promise<ScriptWorkflowActivityRecord> {
  const time = Date.now();
  let result!: ScriptWorkflowActivityRecord;
  withWriteTransaction(db, "borrow", () => {
    // 原生数值运算保留 SQLite 对历史 TEXT 值的转换，避免 JS 加法拼接字符串。
    const { attempt } = db
      .prepare(`
      SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt FROM workflow_activity WHERE run_id = ? AND call_path = ?
    `)
      .get(input.runId, input.callPath) as { attempt: number };
    const statement = db.prepare(`
      INSERT INTO workflow_activity (
        id, run_id, parent_activity_id, call_index, call_path, attempt, type, phase, label,
        input_hash, prompt, opts_json, child_session_id, result_json, error_json, status,
        time_created, time_updated, time_started, time_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, NULL, NULL)
    `);
    statement.run(
      input.id,
      input.runId,
      input.parentActivityId ?? null,
      input.callIndex,
      input.callPath,
      attempt,
      input.type,
      input.phase ?? null,
      input.label ?? null,
      input.inputHash,
      input.prompt ?? null,
      encodeJson(input.opts),
      input.status ?? "queued",
      time,
      time,
    );
    result = readWrittenActivity(db, input.id);
  });
  return result;
}

export async function updateScriptWorkflowActivity(
  db: DatabaseSync,
  input: UpdateScriptWorkflowActivityInput,
): Promise<ScriptWorkflowActivityRecord> {
  let result!: ScriptWorkflowActivityRecord;
  // 读取、合并和完整回读不跨让出点，保留子会话关联与结果等不同字段的连续更新。
  withWriteTransaction(db, "borrow", () => {
    const current = readActivity(db, input.id);
    if (!current) throw new Error(`Workflow activity not found: ${input.id}`);
    const time = Date.now();
    const statement = db.prepare(`
      UPDATE workflow_activity SET status = ?, child_session_id = ?, result_json = ?, error_json = ?,
        time_started = ?, time_completed = ?, time_updated = ? WHERE id = ?
    `);
    statement.run(
      input.status ?? current.status,
      (input.childSessionId === undefined ? current.childSessionId : input.childSessionId) ?? null,
      encodeJson(input.result === undefined ? current.result : input.result),
      encodeJson(input.error === undefined ? current.error : input.error),
      (input.startedAt === undefined ? current.startedAt : input.startedAt) ?? null,
      (input.completedAt === undefined ? current.completedAt : input.completedAt) ?? null,
      time,
      input.id,
    );
    result = readWrittenActivity(db, input.id);
  });
  return result;
}

export async function findCachedScriptWorkflowActivity(
  db: DatabaseSync,
  input: CacheQuery,
): Promise<ScriptWorkflowActivityRecord | null> {
  const row = db
    .prepare(`
    SELECT * FROM workflow_activity WHERE run_id = ? AND call_path = ? AND input_hash = ?
      AND status IN ('completed', 'cached') ORDER BY attempt DESC LIMIT 1
  `)
    .get(input.runId, input.callPath, input.inputHash) as unknown as
    | WorkflowActivityRow
    | undefined;
  return row ? decodeActivity(row) : null;
}

export async function listScriptWorkflowActivities(
  db: DatabaseSync,
  input: { runId: string },
): Promise<ScriptWorkflowActivityRecord[]> {
  const rows = db
    .prepare("SELECT * FROM workflow_activity WHERE run_id = ? ORDER BY call_index ASC, id ASC")
    .all(input.runId);
  return rows.map((row) => decodeActivity(row as unknown as WorkflowActivityRow));
}

export async function appendScriptWorkflowEvent(
  db: DatabaseSync,
  input: EventInput,
): Promise<ScriptWorkflowEventRecord> {
  const time = Date.now();
  let result!: ScriptWorkflowEventRecord;
  withWriteTransaction(db, "borrow", () => {
    const { sequence } = db
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM workflow_event WHERE run_id = ?",
      )
      .get(input.runId) as { sequence: number };
    const statement = db.prepare(`
      INSERT INTO workflow_event (id, run_id, sequence, type, phase, activity_id, payload_json, time_created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    statement.run(
      input.id,
      input.runId,
      sequence,
      input.type,
      input.phase ?? null,
      input.activityId ?? null,
      encodeJson(input.payload),
      time,
    );
    const row = db
      .prepare("SELECT * FROM workflow_event WHERE run_id = ? AND sequence = ?")
      .get(input.runId, sequence) as unknown as WorkflowEventRow | undefined;
    if (!row) throw new Error(`Workflow event not found after write: ${input.runId}:${sequence}`);
    result = decodeEvent(row);
  });
  return result;
}

export async function listScriptWorkflowEvents(
  db: DatabaseSync,
  input: { runId: string; limit?: number },
): Promise<ScriptWorkflowEventRecord[]> {
  const rows =
    input.limit && input.limit > 0
      ? db
          .prepare(`
      SELECT * FROM (
        SELECT * FROM workflow_event WHERE run_id = ? ORDER BY sequence DESC LIMIT ?
      ) ORDER BY sequence ASC
    `)
          .all(input.runId, input.limit)
      : db
          .prepare("SELECT * FROM workflow_event WHERE run_id = ? ORDER BY sequence ASC")
          .all(input.runId);
  return rows.map((row) => decodeEvent(row as unknown as WorkflowEventRow));
}

export async function createSessionTaskLink(
  db: DatabaseSync,
  input: CreateSessionTaskLinkInput,
): Promise<SessionTaskLinkRecord> {
  const time = Date.now();
  let result!: SessionTaskLinkRecord;
  withWriteTransaction(db, "borrow", () => {
    const statement = db.prepare(`
      INSERT INTO session_task_link (
        id, root_workflow_run_id, parent_link_id, activity_id, parent_session_id, child_session_id,
        role, depth, path, phase, label, agent_type, model, status, time_created, time_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(child_session_id) DO UPDATE SET status = excluded.status, time_updated = excluded.time_updated
    `);
    statement.run(
      input.id,
      input.rootWorkflowRunId ?? null,
      input.parentLinkId ?? null,
      input.activityId ?? null,
      input.parentSessionId ?? null,
      input.childSessionId,
      input.role,
      input.depth ?? 0,
      input.path,
      input.phase ?? null,
      input.label ?? null,
      input.agentType ?? null,
      input.model ?? null,
      input.status,
      time,
      time,
    );
    const row = db
      .prepare("SELECT * FROM session_task_link WHERE child_session_id = ?")
      .get(input.childSessionId) as unknown as SessionTaskLinkRow | undefined;
    if (!row) throw new Error(`Session task link not found after write: ${input.childSessionId}`);
    result = decodeTaskLink(row);
  });
  return result;
}
