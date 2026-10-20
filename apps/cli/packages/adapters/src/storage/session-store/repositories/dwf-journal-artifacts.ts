// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工件（artifact）与工件条目的读取。
//
// 工件的「行」存在 dwf_node（kind = 'artifact'），按 id 升序读出；
// 工件的「条目」来自 dwf_event 里的 report 事件，按 sequence 升序分页读出。
// 两种读法各自稳定，互不依赖。
//
// 对外类型放在 dwf-journal-artifacts-types.ts（字段名是契约，独立成声明文件便于核对）。
// 查询片段、report 事件的 payload 字段名（instance/item）同样属契约，逐字保留。

import type { DatabaseSync } from "node:sqlite";
import type { NodeRecord } from "@knorvia/dynamic-workflow";
import { decodeNode, type DwfEventRow, type DwfNodeRow } from "./dwf-journal-codecs.js";
import type { DwfArtifactItem, DwfArtifactItemsQuery } from "./dwf-journal-artifacts-types.js";

export type { DwfArtifactItem, DwfArtifactItemsQuery } from "./dwf-journal-artifacts-types.js";

/** 领域别名：运行 id 与工件 id（与契约同为 string，仅用于签名可读性）。 */
type RunId = string;
type ArtifactId = string;

/** 工件行的固定查询：同一运行下 kind 为 artifact，按 id 升序。 */
const ARTIFACT_ROWS_SQL =
  "SELECT * FROM dwf_node WHERE run_id = ? AND kind = 'artifact' ORDER BY id ASC";

/** 条目查询的固定片段：report 事件 + payload 里的 artifactId 相等。 */
const ITEM_CLAUSES = [
  "run_id = ?",
  "type = 'report'",
  "json_extract(payload_json, '$.artifactId') = ?",
];

/** report 事件载荷里需要读取的两段结构。 */
type ReportPayload = {
  instance: { siteId: string; ordinal: number };
  item: unknown;
};

/** 一条 WHERE 片段与它对应的绑定值。 */
interface FilterSpec {
  bindings: (string | number)[];
  clause: string;
}

/** 组装条目过滤条件：前三段固定，续传序号可选。 */
function artifactFilters(
  runId: RunId,
  artifactId: ArtifactId,
  options: DwfArtifactItemsQuery,
): FilterSpec {
  const clauses = [...ITEM_CLAUSES];
  const bindings: (string | number)[] = [runId, artifactId];
  if (options.afterSequence !== undefined) {
    clauses.push("sequence > ?");
    bindings.push(options.afterSequence);
  }
  return { bindings, clause: clauses.join(" AND ") };
}

/** 事件行 → 工件条目：取 instance 的排序信息与原始 item，字段逐个赋值。 */
function toArtifactItem(entry: unknown): DwfArtifactItem {
  const row = entry as unknown as Pick<DwfEventRow, "sequence" | "payload_json">;
  const payload = JSON.parse(row.payload_json) as ReportPayload;
  const item = {} as DwfArtifactItem;
  item.sequence = row.sequence;
  item.siteId = payload.instance.siteId;
  item.ordinal = payload.instance.ordinal;
  item.item = payload.item;
  return item;
}

/** 读一个运行下的全部工件行（按 id 升序）。 */
export function listArtifactRows(database: DatabaseSync, runId: RunId): NodeRecord[] {
  const statement = database.prepare(ARTIFACT_ROWS_SQL);
  const rows = statement.all(runId);
  const records: NodeRecord[] = [];
  for (const row of rows) records.push(decodeNode(row as unknown as DwfNodeRow));
  return records;
}

/**
 * 分页读一个工件的条目（按 sequence 升序）。
 * limit <= 0 时直接返回空数组、不查库 —— 让调用方能区分「不取」与「取不到」。
 */
export function listArtifactItems(
  database: DatabaseSync,
  runId: RunId,
  artifactId: ArtifactId,
  query: DwfArtifactItemsQuery,
): DwfArtifactItem[] {
  if (query.limit <= 0) return [];
  const spec = artifactFilters(runId, artifactId, query);
  const statement = database.prepare(`
    SELECT sequence, payload_json FROM dwf_event
    WHERE ${spec.clause} ORDER BY sequence ASC LIMIT ?
  `);
  const rows = statement.all(...spec.bindings, query.limit);
  const items: DwfArtifactItem[] = [];
  for (const row of rows) items.push(toArtifactItem(row));
  return items;
}
