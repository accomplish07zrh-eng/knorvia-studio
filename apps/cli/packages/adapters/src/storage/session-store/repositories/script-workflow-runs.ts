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

function readRun(db: DatabaseSync, id: string): ScriptWorkflowRunRecord | null {
  const row = db.prepare("SELECT * FROM workflow_run WHERE id = ?").get(id) as unknown as
    | WorkflowRunRow
    | undefined;
  return row ? decodeRun(row) : null;
}

function readWrittenRun(db: DatabaseSync, id: string): ScriptWorkflowRunRecord {
  const result = readRun(db, id);
  if (!result) throw new Error(`Workflow run not found after write: ${id}`);
  return result;
}

export async function upsertScriptWorkflowDefinition(
  db: DatabaseSync,
  input: UpsertScriptWorkflowDefinitionInput,
): Promise<ScriptWorkflowDefinitionRecord> {
  const time = Date.now();
  let result!: ScriptWorkflowDefinitionRecord;
  // 回读和投影也属于写入结果；独立调用失败时应整体回滚，外层事务仍由调用者负责。
  withWriteTransaction(db, "borrow", () => {
    const statement = db.prepare(`
      INSERT INTO workflow_definition (
        id, name, source, scope, trusted, enabled, script_path, script_hash, meta_json, time_created, time_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, source = excluded.source, scope = excluded.scope,
        trusted = excluded.trusted, enabled = excluded.enabled, script_path = excluded.script_path,
        script_hash = excluded.script_hash, meta_json = excluded.meta_json, time_updated = excluded.time_updated
    `);
    statement.run(
      input.id,
      input.name,
      input.source,
      input.scope ?? (input.source === "builtin" ? "builtin" : "explicit"),
      input.trusted === true ? 1 : 0,
      input.enabled === false ? 0 : 1,
      input.scriptPath ?? null,
      input.scriptHash,
      JSON.stringify(input.meta) as string,
      time,
      time,
    );
    const row = db
      .prepare("SELECT * FROM workflow_definition WHERE id = ?")
      .get(input.id) as unknown as WorkflowDefinitionRow | undefined;
    if (!row) throw new Error(`Workflow definition not found after write: ${input.id}`);
    result = decodeDefinition(row);
  });
  return result;
}

export async function createScriptWorkflowRun(
  db: DatabaseSync,
  input: CreateScriptWorkflowRunInput,
): Promise<ScriptWorkflowRunRecord> {
  const time = Date.now();
  let result!: ScriptWorkflowRunRecord;
  withWriteTransaction(db, "borrow", () => {
    const statement = db.prepare(`
      INSERT INTO workflow_run (
        id, definition_id, parent_session_id, name, kind, cwd, script_path, script_hash,
        args_json, args_hash, status, current_phase, budget_total, budget_spent, stats_json,
        failure_json, time_created, time_updated, time_started, time_completed
      ) VALUES (?, ?, ?, ?, 'script', ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, NULL, ?, ?, NULL, NULL)
    `);
    statement.run(
      input.id,
      input.definitionId ?? null,
      input.parentSessionId ?? null,
      input.name,
      input.cwd,
      input.scriptPath ?? null,
      input.scriptHash,
      encodeJson(input.args),
      input.argsHash ?? null,
      input.status ?? "pending",
      input.budgetTotal ?? null,
      encodeJson(input.stats),
      time,
      time,
    );
    result = readWrittenRun(db, input.id);
  });
  return result;
}

export async function updateScriptWorkflowRun(
  db: DatabaseSync,
  input: UpdateScriptWorkflowRunInput,
): Promise<ScriptWorkflowRunRecord> {
  let result!: ScriptWorkflowRunRecord;
  // 当前值必须在同步事务中读取，避免两个不同字段的更新复用旧快照而相互覆盖。
  withWriteTransaction(db, "borrow", () => {
    const current = readRun(db, input.id);
    if (!current) throw new Error(`Workflow run not found: ${input.id}`);
    const time = Date.now();
    const statement = db.prepare(`
      UPDATE workflow_run SET status = ?, current_phase = ?, budget_spent = ?, stats_json = ?,
        failure_json = ?, time_started = ?, time_completed = ?, time_updated = ? WHERE id = ?
    `);
    statement.run(
      input.status ?? current.status,
      (input.currentPhase === undefined ? current.currentPhase : input.currentPhase) ?? null,
      input.budgetSpent ?? current.budgetSpent,
      encodeJson(input.stats === undefined ? current.stats : input.stats),
      encodeJson(input.failure === undefined ? current.failure : input.failure),
      (input.startedAt === undefined ? current.startedAt : input.startedAt) ?? null,
      (input.completedAt === undefined ? current.completedAt : input.completedAt) ?? null,
      time,
      input.id,
    );
    result = readWrittenRun(db, input.id);
  });
  return result;
}

export async function getScriptWorkflowRun(
  db: DatabaseSync,
  runId: string,
): Promise<ScriptWorkflowRunRecord | null> {
  return readRun(db, runId);
}

export async function listScriptWorkflowRuns(
  db: DatabaseSync,
  input: { cwd?: string; limit?: number; statuses?: readonly ScriptWorkflowRunStatus[] } = {},
): Promise<ScriptWorkflowRunRecord[]> {
  const filters: string[] = [];
  const bindings: SQLInputValue[] = [];
  if (input.cwd) {
    filters.push("cwd = ?");
    bindings.push(input.cwd);
  }
  if (input.statuses?.length) {
    filters.push(`status IN (${input.statuses.map(() => "?").join(", ")})`);
    bindings.push(...input.statuses);
  }
  const limited = Boolean(input.limit && input.limit > 0);
  if (limited) bindings.push(input.limit!);
  const rows = db
    .prepare(`
    SELECT * FROM workflow_run${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""}
    ORDER BY time_updated DESC, id DESC${limited ? " LIMIT ?" : ""}
  `)
    .all(...bindings);
  return rows.map((row) => decodeRun(row as unknown as WorkflowRunRow));
}
