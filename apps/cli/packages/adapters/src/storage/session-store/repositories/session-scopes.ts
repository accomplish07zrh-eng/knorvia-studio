// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import {
  SESSION_TASK_TYPES,
  type ClaimLegacySessionWorkspaceInput,
  type ListSessionsInput,
  type RepairLegacyRemoteSessionWorkspaceInput,
  type RepairRemoteSessionPathsInput,
  type SessionInfo,
} from "@knorvia/contracts";
import { decodeSessionRow } from "../codecs.js";
import type { SessionRow } from "../rows.js";

export async function listSessions(
  db: DatabaseSync,
  input: ListSessionsInput = {},
): Promise<SessionInfo[]> {
  const predicates: string[] = [];
  const parameters: SQLInputValue[] = [];
  const addFilter = (predicate: string, ...values: SQLInputValue[]) => {
    predicates.push(predicate);
    parameters.push(...values);
  };
  if (input.projectID) addFilter("project_id = ?", input.projectID);
  if (input.workspaceID === null) addFilter("workspace_id IS NULL");
  else if (input.workspaceID !== undefined) addFilter("workspace_id = ?", input.workspaceID);
  if (input.directory) addFilter("directory = ?", input.directory);
  if (input.path !== undefined) {
    if (input.path === "") addFilter("(path IS NULL OR path = '')");
    else {
      // 只让实现追加的后代通配符生效，路径内的反斜线、百分号和下划线都是字面字符。
      const literal = input.path.replace(/[\\%_]/g, (character) => `\\${character}`);
      addFilter("(path = ? OR path LIKE ? ESCAPE '\\')", input.path, `${literal}/%`);
    }
  }
  if (input.roots) addFilter("parent_id IS NULL");
  const taskTypes = [
    ...new Set(input.taskTypes?.filter((taskType) => SESSION_TASK_TYPES.includes(taskType)) ?? []),
  ];
  if (taskTypes.length) {
    addFilter(`task_type IN (${taskTypes.map(() => "?").join(",")})`, ...taskTypes);
  }
  if (!input.includeArchived) addFilter("time_archived IS NULL");
  let query = "SELECT * FROM session";
  if (predicates.length) query += ` WHERE ${predicates.join(" AND ")}`;
  query += " ORDER BY time_updated DESC, id DESC";
  if (input.limit !== undefined && input.limit > 0) {
    query += " LIMIT ?";
    parameters.push(input.limit);
  }
  const rows = db.prepare(query).all(...parameters) as unknown as SessionRow[];
  return rows.map(decodeSessionRow);
}

export function claimLegacySessionWorkspace(
  db: DatabaseSync,
  input: ClaimLegacySessionWorkspaceInput,
): number {
  const ids = [...new Set(input.sessionIDs)];
  if (!ids.length) return 0;
  const result = db
    .prepare(`
    UPDATE session SET workspace_id = ?
    WHERE directory = ? AND workspace_id IS NULL AND id IN (${ids.map(() => "?").join(",")})
  `)
    .run(input.workspaceID, input.directory, ...ids);
  return Number(result.changes);
}

export function repairLegacyRemoteSessionWorkspace(
  db: DatabaseSync,
  input: RepairLegacyRemoteSessionWorkspaceInput,
): boolean {
  const result = db
    .prepare(`
    UPDATE session SET project_id = ?, workspace_id = ?, directory = ?, path = ?
    WHERE id = ? AND workspace_id IS NULL AND directory = ? AND (path IS NULL OR path = ?)
  `)
    .run(
      input.projectID,
      input.workspaceID,
      input.workspacePath,
      input.workspacePath,
      input.sessionID,
      input.legacyWorkspaceDirectory,
      input.legacyWorkspaceDirectory,
    );
  return Number(result.changes) === 1;
}

export function repairRemoteSessionPaths(
  db: DatabaseSync,
  input: RepairRemoteSessionPathsInput,
): boolean {
  const result = db
    .prepare(`
    UPDATE session SET directory = ?, path = ?, time_updated = MAX(time_updated, ?)
    WHERE id = ? AND workspace_id = ? AND directory = ? AND path IS ?
  `)
    .run(
      input.directory,
      input.path,
      input.timeUpdated,
      input.sessionID,
      input.workspaceID,
      input.expectedDirectory,
      input.expectedPath,
    );
  return Number(result.changes) === 1;
}
