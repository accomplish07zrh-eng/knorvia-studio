// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工作流运行的自省查询：列运行、取明细、统计节点状态、取日志事件、列世界节点。
// 这些查询只读不写，服务于「看历史工作流跑成什么样」。
//
// 对外类型在 dwf-journal-introspection-types.ts（三个名字都在 interface.md 里，属合同声明）。
// SQL 片段与列名是数据格式的一部分，逐字保留。

import type { DatabaseSync } from "node:sqlite";
import type { NodeRecord, StoredEvent } from "@knorvia/dynamic-workflow";
import type { DwfListRunsQuery, DwfNodeStatusCounts } from "./dwf-journal-introspection-types.js";
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

export type {
  DwfListRunsQuery,
  DwfNodeStatusCounts,
  DwfRunIntrospectionQueries,
} from "./dwf-journal-introspection-types.js";

/** 运行明细查询固定取的列（顺序即契约）。 */
const RUN_METADATA_COLUMNS = `
  id, parent_session_id, cwd, name, script_text, script_hash, tool_call_id, args_json,
  resumed_from, caps_max_concurrency, spent_tokens, status, failure_json, time_created, time_updated
`;

/** 节点状态统计要认的三种状态（其余状态不计数）。 */
const COUNTED_NODE_STATUSES = ["running", "completed", "failed"] as const;

/** 世界节点的汇总行：在解码结果之上额外带着聚合出来的字节数与条数。 */
type WorldSummaryRow = DwfNodeRow & {
  result_bytes: number | null;
  result_count: number | null;
  exit_code: unknown;
  stdout_bytes: number | null;
  stderr_bytes: number | null;
};

/** 把一组 WHERE 片段与绑定值收成可拼接的 where 子句。 */
function whereClause(filters: readonly string[]): string {
  return filters.length === 0 ? "" : `WHERE ${filters.join(" AND ")}`;
}

/** 按条件列出运行（time_updated 倒序）。状态为空数组或上限非正时直接返回空。 */
export function listRuns(db: DatabaseSync, query: DwfListRunsQuery): DwfRunListItem[] {
  if (query.statuses?.length === 0) return [];
  if (query.limit <= 0) return [];

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

  const sql = `SELECT ${RUN_METADATA_COLUMNS} FROM dwf_run ${whereClause(filters)} ORDER BY time_updated DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...values);
  const items: DwfRunListItem[] = [];
  for (const row of rows) items.push(decodeRunListItem(row as unknown as DwfRunMetadataRow));
  return items;
}

/** 取单条运行明细；没有该运行返回 undefined。 */
export function getRunRow(db: DatabaseSync, runId: string): DwfRunDetailRow | undefined {
  const row = db.prepare("SELECT * FROM dwf_run WHERE id = ?").get(runId);
  if (row === undefined) return undefined;
  return decodeRunDetailRow(row as unknown as DwfRunRow);
}

/** 按状态统计节点数：只认三种状态，其余行忽略。 */
export function countNodesByStatus(db: DatabaseSync, runId: string): DwfNodeStatusCounts {
  const counts = {} as DwfNodeStatusCounts;
  for (const status of COUNTED_NODE_STATUSES) counts[status] = 0;

  const rows = db
    .prepare("SELECT status, COUNT(*) AS count FROM dwf_node WHERE run_id = ? GROUP BY status")
    .all(runId);
  for (const row of rows) {
    const status = row.status as (typeof COUNTED_NODE_STATUSES)[number];
    if (!COUNTED_NODE_STATUSES.includes(status)) continue;
    counts[status] = Number(row.count);
  }
  return counts;
}

/** 取最近 limit 条日志事件，返回时按 sequence 升序（便于直接展示）。 */
export function listRecentLogEvents(db: DatabaseSync, runId: string, limit: number): StoredEvent[] {
  if (limit <= 0) return [];
  const rows = db
    .prepare(`
    SELECT * FROM (
      SELECT * FROM dwf_event WHERE run_id = ? AND type = 'log' ORDER BY sequence DESC LIMIT ?
    ) ORDER BY sequence ASC
  `)
    .all(runId, limit);
  const events: StoredEvent[] = [];
  for (const row of rows) events.push(decodeEvent(row as unknown as DwfEventRow));
  return events;
}

/** 按父会话列出运行（time_updated 与 id 双倒序）；上限按非负收敛。 */
export function listRunsByParentSession(
  db: DatabaseSync,
  parentSessionId: string,
  limit: number,
): DwfRunSessionListItem[] {
  const rows = db
    .prepare(`
    SELECT ${RUN_METADATA_COLUMNS} FROM dwf_run
    WHERE parent_session_id = ? ORDER BY time_updated DESC, id DESC LIMIT ?
  `)
    .all(parentSessionId, Math.max(0, limit));
  const items: DwfRunSessionListItem[] = [];
  for (const row of rows) items.push(decodeRunSessionListItem(row as unknown as DwfRunMetadataRow));
  return items;
}

/** 世界节点查询：result_json 不直接取出，只取它的长度/条数/关键字段。 */
const WORLD_NODES_SQL = `
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
`;

/** 把一行汇总解码成世界节点：可选字段只在非空时出现。 */
function toWorldNode(source: unknown): DwfWorldNodeRow {
  const summary = source as unknown as WorldSummaryRow;
  const record = { ...decodeNode(summary) } as DwfWorldNodeRow;
  record.timeCreated = summary.time_created;
  record.timeUpdated = summary.time_updated;
  if (summary.result_bytes !== null) record.resultBytes = summary.result_bytes;
  if (summary.result_count !== null) record.resultCount = summary.result_count;
  if (typeof summary.exit_code === "number") record.exitCode = summary.exit_code;
  if (summary.stdout_bytes !== null) record.stdoutBytes = summary.stdout_bytes;
  if (summary.stderr_bytes !== null) record.stderrBytes = summary.stderr_bytes;
  return record;
}

/** 列出世界节点（world-read / world-run），按 id 升序。 */
export function listWorldNodes(db: DatabaseSync, runId: string): DwfWorldNodeRow[] {
  const rows = db.prepare(WORLD_NODES_SQL).all(runId);
  const nodes: DwfWorldNodeRow[] = [];
  for (const row of rows) nodes.push(toWorldNode(row));
  return nodes;
}
