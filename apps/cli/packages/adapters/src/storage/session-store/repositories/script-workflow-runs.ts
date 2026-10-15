// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  CreateScriptWorkflowRunInput,
  ScriptWorkflowDefinitionRecord,
  ScriptWorkflowRunRecord,
  ScriptWorkflowRunStatus,
  UpdateScriptWorkflowRunInput,
  UpsertScriptWorkflowDefinitionInput,
} from "@knorvia/contracts";
import { encodeJson } from "../json.js";
import { decodeDefinition, decodeRun } from "./script-workflow-codecs.js";
import type { WorkflowDefinitionRow, WorkflowRunRow } from "./script-workflow-codecs.js";
import { withWriteTransaction } from "./write-transaction.js";

function readRun(database: DatabaseSync, id: string): ScriptWorkflowRunRecord | null {
  const record = database.prepare("SELECT * FROM workflow_run WHERE id = ?").get(id) as unknown as
    | WorkflowRunRow
    | undefined;
  return record ? decodeRun(record) : null;
}

function readWrittenRun(database: DatabaseSync, id: string): ScriptWorkflowRunRecord {
  const result = readRun(database, id);
  if (!result) throw new Error(`Workflow run not found after write: ${id}`);
  return result;
}

export async function upsertScriptWorkflowDefinition(
  database: DatabaseSync,
  request: UpsertScriptWorkflowDefinitionInput,
): Promise<ScriptWorkflowDefinitionRecord> {
  const time = Date.now();
  let result!: ScriptWorkflowDefinitionRecord;
  // 回读和投影也属于写入结果；独立调用失败时应整体回滚，外层事务仍由调用者负责。
  withWriteTransaction(database, "borrow", () => {
    const statement = database.prepare(`
      INSERT INTO workflow_definition (
        id, name, source, scope, trusted, enabled, script_path, script_hash, meta_json, time_created, time_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, source = excluded.source, scope = excluded.scope,
        trusted = excluded.trusted, enabled = excluded.enabled, script_path = excluded.script_path,
        script_hash = excluded.script_hash, meta_json = excluded.meta_json, time_updated = excluded.time_updated
    `);
    statement.run(
      request.id,
      request.name,
      request.source,
      request.scope ?? (request.source === "builtin" ? "builtin" : "explicit"),
      request.trusted === true ? 1 : 0,
      request.enabled === false ? 0 : 1,
      request.scriptPath ?? null,
      request.scriptHash,
      JSON.stringify(request.meta) as string,
      time,
      time,
    );
    const record = database
      .prepare("SELECT * FROM workflow_definition WHERE id = ?")
      .get(request.id) as unknown as WorkflowDefinitionRow | undefined;
    if (!record) throw new Error(`Workflow definition not found after write: ${request.id}`);
    result = decodeDefinition(record);
  });
  return result;
}

export async function createScriptWorkflowRun(
  database: DatabaseSync,
  request: CreateScriptWorkflowRunInput,
): Promise<ScriptWorkflowRunRecord> {
  const time = Date.now();
  let result!: ScriptWorkflowRunRecord;
  withWriteTransaction(database, "borrow", () => {
    const statement = database.prepare(`
      INSERT INTO workflow_run (
        id, definition_id, parent_session_id, name, kind, cwd, script_path, script_hash,
        args_json, args_hash, status, current_phase, budget_total, budget_spent, stats_json,
        failure_json, time_created, time_updated, time_started, time_completed
      ) VALUES (?, ?, ?, ?, 'script', ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, NULL, ?, ?, NULL, NULL)
    `);
    statement.run(
      request.id,
      request.definitionId ?? null,
      request.parentSessionId ?? null,
      request.name,
      request.cwd,
      request.scriptPath ?? null,
      request.scriptHash,
      encodeJson(request.args),
      request.argsHash ?? null,
      request.status ?? "pending",
      request.budgetTotal ?? null,
      encodeJson(request.stats),
      time,
      time,
    );
    result = readWrittenRun(database, request.id);
  });
  return result;
}

export async function updateScriptWorkflowRun(
  database: DatabaseSync,
  request: UpdateScriptWorkflowRunInput,
): Promise<ScriptWorkflowRunRecord> {
  let result!: ScriptWorkflowRunRecord;
  // 当前值必须在同步事务中读取，避免两个不同字段的更新复用旧快照而相互覆盖。
  withWriteTransaction(database, "borrow", () => {
    const current = readRun(database, request.id);
    if (!current) throw new Error(`Workflow run not found: ${request.id}`);
    const time = Date.now();
    const statement = database.prepare(`
      UPDATE workflow_run SET status = ?, current_phase = ?, budget_spent = ?, stats_json = ?,
        failure_json = ?, time_started = ?, time_completed = ?, time_updated = ? WHERE id = ?
    `);
    statement.run(
      request.status ?? current.status,
      (request.currentPhase === undefined ? current.currentPhase : request.currentPhase) ?? null,
      request.budgetSpent ?? current.budgetSpent,
      encodeJson(request.stats === undefined ? current.stats : request.stats),
      encodeJson(request.failure === undefined ? current.failure : request.failure),
      (request.startedAt === undefined ? current.startedAt : request.startedAt) ?? null,
      (request.completedAt === undefined ? current.completedAt : request.completedAt) ?? null,
      time,
      request.id,
    );
    result = readWrittenRun(database, request.id);
  });
  return result;
}

export async function getScriptWorkflowRun(
  database: DatabaseSync,
  runId: string,
): Promise<ScriptWorkflowRunRecord | null> {
  return readRun(database, runId);
}

export async function listScriptWorkflowRuns(
  database: DatabaseSync,
  request: { cwd?: string; limit?: number; statuses?: readonly ScriptWorkflowRunStatus[] } = {},
): Promise<ScriptWorkflowRunRecord[]> {
  const filters: string[] = [];
  const bindings: SQLInputValue[] = [];
  if (request.cwd) {
    filters.push("cwd = ?");
    bindings.push(request.cwd);
  }
  if (request.statuses?.length) {
    filters.push(`status IN (${request.statuses.map(() => "?").join(", ")})`);
    bindings.push(...request.statuses);
  }
  const limited = Boolean(request.limit && request.limit > 0);
  if (limited) bindings.push(request.limit!);
  const rows = database
    .prepare(`
    SELECT * FROM workflow_run${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY time_updated DESC, id DESC${limited ? " LIMIT ?" : ""}
  `)
    .all(...bindings);
  return rows.map((record) => decodeRun(record as unknown as WorkflowRunRow));
}
