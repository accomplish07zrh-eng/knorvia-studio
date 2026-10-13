// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 会话作用域与历史数据修复：列表筛选的动态 SQL、以及三条回填更新。
// SQL 片段、ESCAPE 语义与顺序（时间倒序、id 倒序）都是数据格式，逐字保留。

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

/** 追加一个筛选片段并同步它的绑定值。 */
/** 任务类型：与契约允许集合同源，避免把任意外部字符串传进筛选。 */
type TaskType = (typeof SESSION_TASK_TYPES)[number];

type AppendFilter = (predicate: string, ...values: SQLInputValue[]) => void;

/** 路径筛选：空串按「未设置」匹配，其它值按「自身或其后代」匹配。 */
function addPathFilter(path: string, append: AppendFilter): void {
  if (path === "") {
    append("(path IS NULL OR path = '')");
    return;
  }
  // 只让实现追加的后代通配符生效，路径内的反斜线、百分号和下划线都是字面字符。
  const literal = path.replace(/[\\%_]/g, (character) => `\\${character}`);
  append("(path = ? OR path LIKE ? ESCAPE '\\')", path, `${literal}/%`);
}

/** 任务类型筛选：先按允许集合过滤并去重，空集合不产生条件。 */
function addTaskTypeFilter(taskTypes: readonly TaskType[] | undefined, append: AppendFilter): void {
  const selected = [
    ...new Set(taskTypes?.filter((taskType) => SESSION_TASK_TYPES.includes(taskType)) ?? []),
  ];
  if (!selected.length) return;
  append(`task_type IN (${selected.map(() => "?").join(",")})`, ...selected);
}

/** 拼装列表 SQL：WHERE 由片段决定，排序与 LIMIT 固定。 */
function buildSessionQuery(request: ListSessionsInput, bindings: SQLInputValue[]): string {
  const conditions: string[] = [];
  const append: AppendFilter = (predicate, ...values) => {
    conditions.push(predicate);
    bindings.push(...values);
  };
  if (request.projectID) append("project_id = ?", request.projectID);
  if (request.workspaceID === null) append("workspace_id IS NULL");
  else if (request.workspaceID !== undefined) append("workspace_id = ?", request.workspaceID);
  if (request.directory) append("directory = ?", request.directory);
  if (request.path !== undefined) addPathFilter(request.path, append);
  if (request.roots) append("parent_id IS NULL");
  addTaskTypeFilter(request.taskTypes, append);
  if (!request.includeArchived) append("time_archived IS NULL");

  let sql = "SELECT * FROM session";
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY time_updated DESC, id DESC";
  if (request.limit !== undefined && request.limit > 0) {
    sql += " LIMIT ?";
    bindings.push(request.limit);
  }
  return sql;
}

export async function listSessions(
  database: DatabaseSync,
  request: ListSessionsInput = {},
): Promise<SessionInfo[]> {
  const bindings: SQLInputValue[] = [];
  const sql = buildSessionQuery(request, bindings);
  const records = database.prepare(sql).all(...bindings) as unknown as SessionRow[];
  return records.map(decodeSessionRow);
}

/** 认领：只更新指定目录下尚未认领的会话，返回实际改动行数。 */
function selectedIds(sessionIDs: readonly string[]): string[] {
  return [...new Set(sessionIDs)];
}

export function claimLegacySessionWorkspace(
  database: DatabaseSync,
  request: ClaimLegacySessionWorkspaceInput,
): number {
  const ids = selectedIds(request.sessionIDs);
  if (!ids.length) return 0;
  const outcome = database
    .prepare(`
    UPDATE session SET workspace_id = ?
    WHERE directory = ? AND workspace_id IS NULL AND id IN (${ids.map(() => "?").join(",")})
  `)
    .run(request.workspaceID, request.directory, ...ids);
  return Number(outcome.changes);
}

export function repairLegacyRemoteSessionWorkspace(
  database: DatabaseSync,
  request: RepairLegacyRemoteSessionWorkspaceInput,
): boolean {
  const outcome = database
    .prepare(`
    UPDATE session SET project_id = ?, workspace_id = ?, directory = ?, path = ?
    WHERE id = ? AND workspace_id IS NULL AND directory = ? AND (path IS NULL OR path = ?)
  `)
    .run(
      request.projectID,
      request.workspaceID,
      request.workspacePath,
      request.workspacePath,
      request.sessionID,
      request.legacyWorkspaceDirectory,
      request.legacyWorkspaceDirectory,
    );
  return Number(outcome.changes) === 1;
}

export function repairRemoteSessionPaths(
  database: DatabaseSync,
  request: RepairRemoteSessionPathsInput,
): boolean {
  const outcome = database
    .prepare(`
    UPDATE session SET directory = ?, path = ?, time_updated = MAX(time_updated, ?)
    WHERE id = ? AND workspace_id = ? AND directory = ? AND path IS ?
  `)
    .run(
      request.directory,
      request.path,
      request.timeUpdated,
      request.sessionID,
      request.workspaceID,
      request.expectedDirectory,
      request.expectedPath,
    );
  return Number(outcome.changes) === 1;
}
