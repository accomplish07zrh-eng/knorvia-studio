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

function readActivity(database: DatabaseSync, id: string): ScriptWorkflowActivityRecord | null {
  const record = database
    .prepare("SELECT * FROM workflow_activity WHERE id = ?")
    .get(id) as unknown as WorkflowActivityRow | undefined;
  return record ? decodeActivity(record) : null;
}

function readWrittenActivity(database: DatabaseSync, id: string): ScriptWorkflowActivityRecord {
  const result = readActivity(database, id);
  if (!result) throw new Error(`Workflow activity not found after write: ${id}`);
  return result;
}

export async function createScriptWorkflowActivity(
  database: DatabaseSync,
  request: CreateScriptWorkflowActivityInput,
): Promise<ScriptWorkflowActivityRecord> {
  const time = Date.now();
  let result!: ScriptWorkflowActivityRecord;
  withWriteTransaction(database, "borrow", () => {
    // 原生数值运算保留 SQLite 对历史 TEXT 值的转换，避免 JS 加法拼接字符串。
    const { attempt } = database
      .prepare(`
      SELECT COALESCE(MAX(attempt), 0) + 1 AS attempt FROM workflow_activity WHERE run_id = ? AND call_path = ?
    `)
      .get(request.runId, request.callPath) as { attempt: number };
    const query = database.prepare(`
      INSERT INTO workflow_activity (
        id, run_id, parent_activity_id, call_index, call_path, attempt, type, phase, label,
        input_hash, prompt, opts_json, child_session_id, result_json, error_json, status,
        time_created, time_updated, time_started, time_completed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, NULL, NULL)
    `);
    query.run(
      request.id,
      request.runId,
      request.parentActivityId ?? null,
      request.callIndex,
      request.callPath,
      attempt,
      request.type,
      request.phase ?? null,
      request.label ?? null,
      request.inputHash,
      request.prompt ?? null,
      encodeJson(request.opts),
      request.status ?? "queued",
      time,
      time,
    );
    result = readWrittenActivity(database, request.id);
  });
  return result;
}

export async function updateScriptWorkflowActivity(
  database: DatabaseSync,
  request: UpdateScriptWorkflowActivityInput,
): Promise<ScriptWorkflowActivityRecord> {
  let result!: ScriptWorkflowActivityRecord;
  // 读取、合并和完整回读不跨让出点，保留子会话关联与结果等不同字段的连续更新。
  withWriteTransaction(database, "borrow", () => {
    const existing = readActivity(database, request.id);
    if (!existing) throw new Error(`Workflow activity not found: ${request.id}`);
    const time = Date.now();
    const query = database.prepare(`
      UPDATE workflow_activity SET status = ?, child_session_id = ?, result_json = ?, error_json = ?,
        time_started = ?, time_completed = ?, time_updated = ? WHERE id = ?
    `);
    query.run(
      request.status ?? existing.status,
      (request.childSessionId === undefined ? existing.childSessionId : request.childSessionId) ??
        null,
      encodeJson(request.result === undefined ? existing.result : request.result),
      encodeJson(request.error === undefined ? existing.error : request.error),
      (request.startedAt === undefined ? existing.startedAt : request.startedAt) ?? null,
      (request.completedAt === undefined ? existing.completedAt : request.completedAt) ?? null,
      time,
      request.id,
    );
    result = readWrittenActivity(database, request.id);
  });
  return result;
}

export async function findCachedScriptWorkflowActivity(
  database: DatabaseSync,
  request: CacheQuery,
): Promise<ScriptWorkflowActivityRecord | null> {
  const record = database
    .prepare(`
    SELECT * FROM workflow_activity WHERE run_id = ? AND call_path = ? AND input_hash = ?
      AND status IN ('completed', 'cached') ORDER BY attempt DESC LIMIT 1
  `)
    .get(request.runId, request.callPath, request.inputHash) as unknown as
    | WorkflowActivityRow
    | undefined;
  return record ? decodeActivity(record) : null;
}

export async function listScriptWorkflowActivities(
  database: DatabaseSync,
  request: { runId: string },
): Promise<ScriptWorkflowActivityRecord[]> {
  const rows = database
    .prepare("SELECT * FROM workflow_activity WHERE run_id = ? ORDER BY call_index ASC, id ASC")
    .all(request.runId);
  return rows.map((record) => decodeActivity(record as unknown as WorkflowActivityRow));
}

export async function appendScriptWorkflowEvent(
  database: DatabaseSync,
  request: EventInput,
): Promise<ScriptWorkflowEventRecord> {
  const time = Date.now();
  let result!: ScriptWorkflowEventRecord;
  withWriteTransaction(database, "borrow", () => {
    const { sequence } = database
      .prepare(
        "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM workflow_event WHERE run_id = ?",
      )
      .get(request.runId) as { sequence: number };
    const query = database.prepare(`
      INSERT INTO workflow_event (id, run_id, sequence, type, phase, activity_id, payload_json, time_created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    query.run(
      request.id,
      request.runId,
      sequence,
      request.type,
      request.phase ?? null,
      request.activityId ?? null,
      encodeJson(request.payload),
      time,
    );
    const record = database
      .prepare("SELECT * FROM workflow_event WHERE run_id = ? AND sequence = ?")
      .get(request.runId, sequence) as unknown as WorkflowEventRow | undefined;
    if (!record)
      throw new Error(`Workflow event not found after write: ${request.runId}:${sequence}`);
    result = decodeEvent(record);
  });
  return result;
}

export async function listScriptWorkflowEvents(
  database: DatabaseSync,
  request: { runId: string; limit?: number },
): Promise<ScriptWorkflowEventRecord[]> {
  const rows =
    request.limit && request.limit > 0
      ? database
          .prepare(`
      SELECT * FROM (
        SELECT * FROM workflow_event WHERE run_id = ? ORDER BY sequence DESC LIMIT ?
      ) ORDER BY sequence ASC
    `)
          .all(request.runId, request.limit)
      : database
          .prepare("SELECT * FROM workflow_event WHERE run_id = ? ORDER BY sequence ASC")
          .all(request.runId);
  return rows.map((record) => decodeEvent(record as unknown as WorkflowEventRow));
}

export async function createSessionTaskLink(
  database: DatabaseSync,
  request: CreateSessionTaskLinkInput,
): Promise<SessionTaskLinkRecord> {
  const time = Date.now();
  let result!: SessionTaskLinkRecord;
  withWriteTransaction(database, "borrow", () => {
    const query = database.prepare(`
      INSERT INTO session_task_link (
        id, root_workflow_run_id, parent_link_id, activity_id, parent_session_id, child_session_id,
        role, depth, path, phase, label, agent_type, model, status, time_created, time_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(child_session_id) DO UPDATE SET status = excluded.status, time_updated = excluded.time_updated
    `);
    query.run(
      request.id,
      request.rootWorkflowRunId ?? null,
      request.parentLinkId ?? null,
      request.activityId ?? null,
      request.parentSessionId ?? null,
      request.childSessionId,
      request.role,
      request.depth ?? 0,
      request.path,
      request.phase ?? null,
      request.label ?? null,
      request.agentType ?? null,
      request.model ?? null,
      request.status,
      time,
      time,
    );
    const record = database
      .prepare("SELECT * FROM session_task_link WHERE child_session_id = ?")
      .get(request.childSessionId) as unknown as SessionTaskLinkRow | undefined;
    if (!record)
      throw new Error(`Session task link not found after write: ${request.childSessionId}`);
    result = decodeTaskLink(record);
  });
  return result;
}
