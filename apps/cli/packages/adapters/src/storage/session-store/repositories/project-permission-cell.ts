// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { DatabaseSync } from "node:sqlite";
import type { PermissionRuleset, ProjectId } from "@knorvia/contracts";
import { decodeJson } from "../json.js";

type CellKind = "ruleset" | "mode";
const CELL_IDENTITY = ["scope", "scope_id", "namespace", "key"] as const;
const CELL_VALUES = ["value", "schema_version", "time_created", "time_updated"] as const;
const COLUMNS = [...CELL_IDENTITY, ...CELL_VALUES];
const PREDICATE = CELL_IDENTITY.map((column) => `${column} = ?`).join(" AND ");
const READ_CELL = `SELECT value FROM local_setting WHERE ${PREDICATE}`;
const WRITE_CELL = `INSERT INTO local_setting (${COLUMNS.join(", ")})
  VALUES (${COLUMNS.map(() => "?").join(", ")})
  ON CONFLICT (${CELL_IDENTITY.join(", ")}) DO UPDATE SET
  ${CELL_VALUES.filter((column) => column !== "time_created")
    .map((column) => `${column} = excluded.${column}`)
    .join(", ")}`;
const cellIdentity = (projectID: ProjectId, kind: CellKind) => [
  "project",
  projectID,
  "permission",
  kind,
];

export function readPermissionCell(db: DatabaseSync, projectID: ProjectId, kind: CellKind) {
  return db.prepare(READ_CELL).get(...cellIdentity(projectID, kind)) as
    | { value: string }
    | undefined;
}

export function readProjectRules(db: DatabaseSync, projectID: ProjectId): PermissionRuleset | null {
  const local = readPermissionCell(db, projectID, "ruleset");
  if (local) return decodeJson<PermissionRuleset>(local.value) ?? null;
  const legacy = db.prepare("SELECT * FROM permission WHERE project_id = ?").get(projectID);
  return legacy ? (decodeJson<PermissionRuleset>(legacy.data as string) ?? null) : null;
}

export function writePermissionCell(
  db: DatabaseSync,
  projectID: ProjectId,
  kind: CellKind,
  encoded: string,
  timestamp: number,
): void {
  db.prepare(WRITE_CELL).run(...cellIdentity(projectID, kind), encoded, 1, timestamp, timestamp);
}
