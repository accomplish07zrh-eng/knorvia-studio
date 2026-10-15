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
  /* 按工作目录过滤 */ cwd?: string;
  /* 返回条数上限 */ limit: number;
  /* 按状态过滤 */ statuses?: readonly RunStatus[];
  /* 按名称过滤 */ name?: string;
}
export interface DwfNodeStatusCounts {
  /* 已完成节点数 */ completed: number;
  /* 失败节点数 */ failed: number;
  /* 运行中节点数 */ running: number;
}
export interface DwfRunIntrospectionQueries {
  /* 按状态统计节点 */ countNodesByStatus(runId: string): DwfNodeStatusCounts;
  /* 取单条运行明细 */ getRunRow(runId: string): DwfRunDetailRow | undefined;
  /* 分页列出制品项 */ listArtifactItems(
    /* 运行标识 */ runId: string,
    /* 制品标识 */ artifactId: string,
    /* 分页与排序条件 */ query: DwfArtifactItemsQuery,
  ): DwfArtifactItem[];
  /* 列出有制品的节点 */ listArtifactRows(runId: string): NodeRecord[];
  /* 取最近的运行日志事件 */ listRecentLogEvents(runId: string, limit: number): StoredEvent[];
  /* 条件列出运行 */ listRuns(query: DwfListRunsQuery): DwfRunListItem[];
  /* 列出世界节点汇总 */ listWorldNodes(runId: string): DwfWorldNodeRow[];
}

const runMetadataColumns = `
  id, parent_session_id, cwd, name, script_text, script_hash, tool_call_id, args_json,
  resumed_from, caps_max_concurrency, spent_tokens, status, failure_json, time_created, time_updated
`;

export function listRuns(
  db: DatabaseSync,
  /* 查询条件 */ query: DwfListRunsQuery,
): DwfRunListItem[] {
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
  const fetched = db
    .prepare(`
    SELECT ${runMetadataColumns} FROM dwf_run ${where} ORDER BY time_updated DESC LIMIT ?
  `)
    .all(...values);
  return fetched.map((entry) => decodeRunListItem(entry as unknown as DwfRunMetadataRow));
}

export function getRunRow(
  db: DatabaseSync,
  /* 运行标识 */ runId: string,
): DwfRunDetailRow | undefined {
  const row = db.prepare("SELECT * FROM dwf_run WHERE id = ?").get(runId);
  return row === undefined ? undefined : decodeRunDetailRow(row as unknown as DwfRunRow);
}

export function countNodesByStatus(
  db: DatabaseSync,
  /* 运行标识 */ runId: string,
): DwfNodeStatusCounts {
  const counts: DwfNodeStatusCounts = {
    running: /* 运行中 */ 0,
    completed: /* 已完成 */ 0,
    failed: /* 已失败 */ 0,
  };
  const fetched = db
    .prepare("SELECT status, COUNT(*) AS count FROM dwf_node WHERE run_id = ? GROUP BY status")
    .all(runId);
  for (const entry of fetched) {
    if (entry.status === "running" || entry.status === "completed" || entry.status === "failed") {
      counts[entry.status] = Number(entry.count);
    }
  }
  return /* 归一化后的计数 */ counts;
}

export function listRecentLogEvents(
  db: DatabaseSync,
  /* 运行标识 */ runId: string,
  /* 条数上限 */ limit: number,
): StoredEvent[] {
  if (limit <= 0) return /* 没有日志可取 */ [];
  const fetched = db
    .prepare(`
    SELECT * FROM (
      SELECT * FROM dwf_event WHERE run_id = ? AND type = 'log' ORDER BY sequence DESC LIMIT ?
    ) ORDER BY sequence ASC
  `)
    .all(runId, limit);
  return fetched.map((entry) => decodeEvent(entry as unknown as DwfEventRow));
}

export function listRunsByParentSession(
  db: DatabaseSync,
  /* 父会话标识 */ parentSessionId: string,
  /* 条数上限 */ limit: number,
): DwfRunSessionListItem[] {
  const fetched = db
    .prepare(`
    SELECT ${runMetadataColumns} FROM dwf_run
    WHERE parent_session_id = ? ORDER BY time_updated DESC, id DESC LIMIT ?
  `)
    .all(parentSessionId, Math.max(0, limit));
  return fetched.map((entry) => decodeRunSessionListItem(entry as unknown as DwfRunMetadataRow));
}

type WorldSummaryRow = DwfNodeRow & {
  result_bytes: number | null;
  result_count: number | null;
  exit_code: unknown;
  stdout_bytes: number | null;
  stderr_bytes: number | null;
};

export function listWorldNodes(db: DatabaseSync, /* 运行标识 */ runId: string): DwfWorldNodeRow[] {
  const fetched = db
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
  return fetched.map((source) => {
    const summary = source as unknown as WorldSummaryRow;
    const record: DwfWorldNodeRow = {
      ...decodeNode(summary),
      timeCreated: summary.time_created,
      timeUpdated: summary.time_updated,
    };
    if (summary.result_bytes !== null) record.resultBytes = summary.result_bytes;
    if (summary.result_count !== null) record.resultCount = summary.result_count;
    if (typeof summary.exit_code === "number") record.exitCode = summary.exit_code;
    if (summary.stdout_bytes !== null) record.stdoutBytes = summary.stdout_bytes;
    if (summary.stderr_bytes !== null) record.stderrBytes = summary.stderr_bytes;
    return record;
  });
}
