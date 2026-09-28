// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { NodeRecord, RunStatus, StoredEvent } from "@knorvia/dynamic-workflow";
import type { DwfArtifactItem, DwfArtifactItemsQuery } from "./dwf-journal-artifacts.js";
import {
  decodeEvent,
  decodeNode,
  decodeRunDetailRow,
  decodeRunListItem,
  decodeRunSessionListItem,
  encodeRunStatusPredicate,
  type DwfEventRow,
  type DwfNodeRow,
  type DwfRunDetailRow,
  type DwfRunListItem,
  type DwfRunMetadataRow,
  type DwfRunRow,
  type DwfRunSessionListItem,
  type DwfWorldNodeRow,
} from "./dwf-journal-codecs.js";

export interface DwfListRunsQuery {
  cwd?: string;
  limit: number;
  statuses?: readonly RunStatus[];
  name?: string;
}
export interface DwfNodeStatusCounts {
  completed: number;
  failed: number;
  running: number;
}
export interface DwfRunIntrospectionQueries {
  countNodesByStatus(runId: string): DwfNodeStatusCounts;
  getRunRow(runId: string): DwfRunDetailRow | undefined;
  listArtifactItems(
    runId: string,
    artifactId: string,
    query: DwfArtifactItemsQuery,
  ): DwfArtifactItem[];
  listArtifactRows(runId: string): NodeRecord[];
  listRecentLogEvents(runId: string, limit: number): StoredEvent[];
  listRuns(query: DwfListRunsQuery): DwfRunListItem[];
  listWorldNodes(runId: string): DwfWorldNodeRow[];
}

const runMetadataColumns = `
  id, parent_session_id, cwd, name, script_text, script_hash, tool_call_id, args_json,
  resumed_from, caps_max_concurrency, spent_tokens, status, failure_json, time_created, time_updated
`;

export function listRuns(db: DatabaseSync, query: DwfListRunsQuery): DwfRunListItem[] {
  if (query.statuses?.length === 0 || query.limit <= 0) return [];
  const filters: string[] = [];
  const values: (string | number)[] = [];
  if (query.cwd !== undefined) {
    filters.push("cwd = ?");
    values.push(query.cwd);
  }
  if (query.statuses !== undefined) {
    const predicate = encodeRunStatusPredicate(query.statuses);
    filters.push(predicate.sql);
    values.push(...predicate.params);
  }
  if (query.name !== undefined) {
    filters.push("name = ?");
    values.push(query.name);
  }
  values.push(query.limit);
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = db
    .prepare(`
    SELECT ${runMetadataColumns} FROM dwf_run ${where} ORDER BY time_updated DESC LIMIT ?
  `)
    .all(...values);
  return rows.map((row) => decodeRunListItem(row as unknown as DwfRunMetadataRow));
}

export function getRunRow(db: DatabaseSync, runId: string): DwfRunDetailRow | undefined {
  const row = db.prepare("SELECT * FROM dwf_run WHERE id = ?").get(runId);
  return row === undefined ? undefined : decodeRunDetailRow(row as unknown as DwfRunRow);
}

export function countNodesByStatus(db: DatabaseSync, runId: string): DwfNodeStatusCounts {
  const counts: DwfNodeStatusCounts = { running: 0, completed: 0, failed: 0 };
  const rows = db
    .prepare("SELECT status, COUNT(*) AS count FROM dwf_node WHERE run_id = ? GROUP BY status")
    .all(runId);
  for (const row of rows) {
    if (row.status === "running" || row.status === "completed" || row.status === "failed") {
      counts[row.status] = Number(row.count);
    }
  }
  return counts;
}

export function listRecentLogEvents(db: DatabaseSync, runId: string, limit: number): StoredEvent[] {
  if (limit <= 0) return [];
  const rows = db
    .prepare(`
    SELECT * FROM (
      SELECT * FROM dwf_event WHERE run_id = ? AND type = 'log' ORDER BY sequence DESC LIMIT ?
    ) ORDER BY sequence ASC
  `)
    .all(runId, limit);
  return rows.map((row) => decodeEvent(row as unknown as DwfEventRow));
}

export function listRunsByParentSession(
  db: DatabaseSync,
  parentSessionId: string,
  limit: number,
): DwfRunSessionListItem[] {
  const rows = db
    .prepare(`
    SELECT ${runMetadataColumns} FROM dwf_run
    WHERE parent_session_id = ? ORDER BY time_updated DESC, id DESC LIMIT ?
  `)
    .all(parentSessionId, Math.max(0, limit));
  return rows.map((row) => decodeRunSessionListItem(row as unknown as DwfRunMetadataRow));
}

type WorldSummaryRow = DwfNodeRow & {
  result_bytes: number | null;
  result_count: number | null;
  exit_code: unknown;
  stdout_bytes: number | null;
  stderr_bytes: number | null;
};

export function listWorldNodes(db: DatabaseSync, runId: string): DwfWorldNodeRow[] {
  const rows = db
    .prepare(`
    SELECT id, run_id, site_id, ordinal, kind, actor_site_id, actor_ordinal, actor_seq,
      input_hash, status, NULL AS result_json, error_json, stats_json, message_boundary,
      artifact_id, input_json, time_created, time_updated,
      length(CAST(result_json AS BLOB)) AS result_bytes,
      CASE WHEN json_type(result_json) = 'array' THEN json_array_length(result_json) END AS result_count,
      CASE WHEN json_type(result_json) = 'object' THEN json_extract(result_json, '$.exitCode') END AS exit_code,
      CASE WHEN json_type(result_json) = 'object'
        THEN length(CAST(json_extract(result_json, '$.stdout') AS BLOB)) END AS stdout_bytes,
      CASE WHEN json_type(result_json) = 'object'
        THEN length(CAST(json_extract(result_json, '$.stderr') AS BLOB)) END AS stderr_bytes
    FROM dwf_node WHERE run_id = ? AND kind IN ('world-read', 'world-run') ORDER BY id ASC
  `)
    .all(runId);
  return rows.map((raw) => {
    const row = raw as unknown as WorldSummaryRow;
    const node: DwfWorldNodeRow = {
      ...decodeNode(row),
      timeCreated: row.time_created,
      timeUpdated: row.time_updated,
    };
    if (row.result_bytes !== null) node.resultBytes = row.result_bytes;
    if (row.result_count !== null) node.resultCount = row.result_count;
    if (typeof row.exit_code === "number") node.exitCode = row.exit_code;
    if (row.stdout_bytes !== null) node.stdoutBytes = row.stdout_bytes;
    if (row.stderr_bytes !== null) node.stderrBytes = row.stderr_bytes;
    return node;
  });
}
