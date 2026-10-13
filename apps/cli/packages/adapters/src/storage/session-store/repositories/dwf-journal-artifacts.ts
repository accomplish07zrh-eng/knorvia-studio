// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工件行与工件条目的读取：行来自 dwf_node（kind='artifact'），条目来自 dwf_event 的 report 事件。
// 查询片段、报告事件的 payload 字段（instance/item）与接口字段名都是契约，逐字保留。

import type { DatabaseSync } from "node:sqlite";
import type { NodeRecord } from "@knorvia/dynamic-workflow";
import { decodeNode, type DwfEventRow, type DwfNodeRow } from "./dwf-journal-codecs.js";

/** 分页查询：limit 为必填；afterSequence 表示「从该序号之后继续」。 */
export interface DwfArtifactItemsQuery {
  afterSequence?: number;
  limit: number;
}

/** 单条工件：item 是原始载荷，ordinal/sequence/siteId 供排序与去重。 */
export interface DwfArtifactItem {
  item: unknown;
  ordinal: number;
  sequence: number;
  siteId: string;
}

/** 领域别名：运行 id 与工件 id（与契约同为 string，仅用于签名可读性）。 */
type RunId = string;
type ArtifactId = string;

interface FilterSpec {
  bindings: (string | number)[];
  clause: string;
}

/** 过滤条件：report 事件 + payload 里的 artifactId 必须相等，序号可续传。 */
function artifactFilters(
  runId: RunId,
  artifactId: ArtifactId,
  options: DwfArtifactItemsQuery,
): FilterSpec {
  const clauses = [
    "run_id = ?",
    "type = 'report'",
    "json_extract(payload_json, '$.artifactId') = ?",
  ];
  const bindings: (string | number)[] = [runId, artifactId];
  if (options.afterSequence !== undefined) {
    clauses.push("sequence > ?");
    bindings.push(options.afterSequence);
  }
  return { bindings, clause: clauses.join(" AND ") };
}

/** 事件行 → 工件条目：只取 instance 的 siteId/ordinal 与原始 item。 */
function toArtifactItem(entry: unknown): DwfArtifactItem {
  const record = entry as unknown as Pick<DwfEventRow, "sequence" | "payload_json">;
  const parsed = JSON.parse(record.payload_json) as {
    instance: { siteId: string; ordinal: number };
    item: unknown;
  };
  const item = {} as DwfArtifactItem;
  item.sequence = record.sequence;
  item.siteId = parsed.instance.siteId;
  item.ordinal = parsed.instance.ordinal;
  item.item = parsed.item;
  return item;
}

export function listArtifactRows(database: DatabaseSync, runId: RunId): NodeRecord[] {
  const query = database.prepare(
    "SELECT * FROM dwf_node WHERE run_id = ? AND kind = 'artifact' ORDER BY id ASC",
  );
  const records = query.all(runId);
  return records.map((entry) => decodeNode(entry as unknown as DwfNodeRow));
}

// 读取顺序说明：
// 一、行用 dwf_node 的 id 升序；条目用事件 sequence 升序，两者各自稳定。
// 二、limit <= 0 直接返回空数组，不查库，便于调用方把「不取」与「取不到」分开。
export function listArtifactItems(
  database: DatabaseSync,
  runId: RunId,
  artifactId: ArtifactId,
  query: DwfArtifactItemsQuery,
): DwfArtifactItem[] {
  if (query.limit <= 0) return [];
  const spec = artifactFilters(runId, artifactId, query);
  const bindings = [...spec.bindings, query.limit];
  const statement = database.prepare(`
    SELECT sequence, payload_json FROM dwf_event
    WHERE ${spec.clause} ORDER BY sequence ASC LIMIT ?
  `);
  const entries = statement.all(...bindings);
  return entries.map(toArtifactItem);
}
