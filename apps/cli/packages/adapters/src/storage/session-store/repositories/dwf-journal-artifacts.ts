// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { NodeRecord } from "@knorvia/dynamic-workflow";
import { decodeNode, type DwfEventRow, type DwfNodeRow } from "./dwf-journal-codecs.js";

export interface DwfArtifactItemsQuery {
  afterSequence?: number;
  limit: number;
}
export interface DwfArtifactItem {
  item: unknown;
  ordinal: number;
  sequence: number;
  siteId: string;
}

export function listArtifactRows(db: DatabaseSync, runId: string): NodeRecord[] {
  const rows = db
    .prepare("SELECT * FROM dwf_node WHERE run_id = ? AND kind = 'artifact' ORDER BY id ASC")
    .all(runId);
  return rows.map((row) => decodeNode(row as unknown as DwfNodeRow));
}

export function listArtifactItems(
  db: DatabaseSync,
  runId: string,
  artifactId: string,
  query: DwfArtifactItemsQuery,
): DwfArtifactItem[] {
  if (query.limit <= 0) return [];
  const filters = [
    "run_id = ?",
    "type = 'report'",
    "json_extract(payload_json, '$.artifactId') = ?",
  ];
  const values: (string | number)[] = [runId, artifactId];
  if (query.afterSequence !== undefined) {
    filters.push("sequence > ?");
    values.push(query.afterSequence);
  }
  values.push(query.limit);
  const rows = db
    .prepare(`
    SELECT sequence, payload_json FROM dwf_event
    WHERE ${filters.join(" AND ")} ORDER BY sequence ASC LIMIT ?
  `)
    .all(...values);
  return rows.map((raw) => {
    const row = raw as unknown as Pick<DwfEventRow, "sequence" | "payload_json">;
    const event = JSON.parse(row.payload_json) as {
      instance: { siteId: string; ordinal: number };
      item: unknown;
    };
    return {
      sequence: row.sequence,
      siteId: event.instance.siteId,
      ordinal: event.instance.ordinal,
      item: event.item,
    };
  });
}
