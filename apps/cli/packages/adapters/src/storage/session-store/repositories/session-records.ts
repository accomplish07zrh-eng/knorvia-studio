// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  CreateSessionInput,
  FileDiff,
  SessionId,
  SessionInfo,
  SessionRevert,
  UpdateSessionInput,
} from "@knorvia/contracts";
import { decodeSessionRow } from "../codecs.js";
import { encodeJson } from "../json.js";
import type { SessionRow } from "../rows.js";
import { withWriteTransaction } from "./write-transaction.js";

const DEFAULT_TASK_TYPE = "interactive";
const DEFAULT_TITLE_SOURCE = "first_input";
const CREATE_SESSION = `
  INSERT INTO session (
    id, project_id, workspace_id, parent_id, trace_id, task_type, slug, directory, path,
    title, title_source, title_message_id, version, share_url, permission,
    time_created, time_updated, time_title_updated,
    summary_additions, summary_deletions, summary_files, summary_diffs,
    revert, time_compacting, time_archived
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
        -- SET 子句各赋值彼此独立（右侧只读 excluded.*，左侧各写一列），因此书写顺序不影响结果；
      -- 这里按列分组排列便于与 INSERT 的列清单对照阅读。
ON CONFLICT(id) DO UPDATE SET
    project_id = excluded.project_id,
    workspace_id = excluded.workspace_id,
    parent_id = excluded.parent_id,
    trace_id = COALESCE(session.trace_id, excluded.trace_id),
    share_url = excluded.share_url,
    version = excluded.version,
    title_message_id = excluded.title_message_id,
    title_source = excluded.title_source,
    title = excluded.title,
    path = excluded.path,
    directory = excluded.directory,
    slug = excluded.slug,
    task_type = excluded.task_type,
    permission = COALESCE(excluded.permission, session.permission),
    time_updated = excluded.time_updated,
    time_title_updated = excluded.time_title_updated
`;
const UPDATE_SESSION = `
  UPDATE session SET
    directory = ?, path = ?, title = ?, title_source = ?, title_message_id = ?, share_url = ?,
    summary_additions = ?, summary_deletions = ?, summary_files = ?, summary_diffs = ?,
    revert = ?, permission = ?, time_compacting = ?, time_archived = ?,
    time_updated = MAX(time_updated, ?), time_title_updated = ?
  WHERE id = ?
`;

export function getSession(database: DatabaseSync, sessionID: SessionId): SessionInfo | null {
  const record = database.prepare("SELECT * FROM session WHERE id = ?").get(sessionID) as unknown as
    | SessionRow
    | undefined;
  return record ? decodeSessionRow(record) : null;
}

function readAfterWrite(database: DatabaseSync, sessionID: SessionId): SessionInfo {
  const stored = getSession(database, sessionID);
  if (!stored) throw new Error(`Session not found after write: ${sessionID}`);
  return stored;
}

export function createSession(database: DatabaseSync, request: CreateSessionInput): SessionInfo {
  const now = Date.now();
  const created = request.time?.created ?? now;
  const updated = request.time?.updated ?? created;
  const titleUpdated = request.titleSource || request.titleMessageID ? updated : null;
  database
    .prepare(CREATE_SESSION)
    .run(
      request.id,
      request.projectID,
      request.workspaceID ?? null,
      request.parentID ?? null,
      request.traceID ?? null,
      request.taskType ?? DEFAULT_TASK_TYPE,
      request.slug,
      request.directory,
      request.path ?? null,
      request.title,
      request.titleSource ?? DEFAULT_TITLE_SOURCE,
      request.titleMessageID ?? null,
      request.version,
      request.shareURL ?? null,
      encodeJson(request.permission),
      created,
      updated,
      titleUpdated,
    );
  return readAfterWrite(database, request.id);
}

function patchParameters(
  prior: SessionInfo,
  request: UpdateSessionInput,
  now: number,
): SQLInputValue[] {
  const summary =
    request.summary === undefined
      ? {
          additions: prior.summaryAdditions,
          deletions: prior.summaryDeletions,
          files: prior.summaryFiles,
          diffs: prior.summaryDiffs,
        }
      : request.summary;
  const title = request.title ?? prior.title;
  // 显式 null 保留旧标题文本，但仍须按原始输入比较刷新标题时间。
  const titleChanged =
    (request.title !== undefined && request.title !== prior.title) ||
    request.titleSource !== undefined ||
    request.titleMessageID !== undefined;
  return [
    request.directory ?? prior.directory,
    (request.path === undefined ? prior.path : request.path) ?? null,
    title,
    request.titleSource ?? prior.titleSource ?? DEFAULT_TITLE_SOURCE,
    (request.titleMessageID === undefined ? prior.titleMessageID : request.titleMessageID) ?? null,
    (request.shareURL === undefined ? prior.shareURL : request.shareURL) ?? null,
    summary?.additions ?? null,
    summary?.deletions ?? null,
    summary?.files ?? null,
    encodeJson(summary?.diffs),
    encodeJson(request.revert === undefined ? prior.revert : request.revert),
    encodeJson(request.permission === undefined ? prior.permission : request.permission),
    (request.timeCompacting === undefined ? prior.time.compacting : request.timeCompacting) ?? null,
    (request.timeArchived === undefined ? prior.time.archived : request.timeArchived) ?? null,
    request.timeUpdated ?? now,
    titleChanged ? now : (prior.time.titleUpdated ?? null),
    request.id,
  ];
}

function applySessionPatch(database: DatabaseSync, request: UpdateSessionInput): SessionInfo {
  let result!: SessionInfo;
  // 先取得写入归属再读取，避免同步调用之间用旧快照覆盖标题、权限或标题 gate。
  withWriteTransaction(database, "borrow", () => {
    const prior = getSession(database, request.id);
    if (!prior) throw new Error(`Session not found: ${request.id}`);
    if (
      request.title !== undefined &&
      request.expectedTitleSources?.length &&
      !request.expectedTitleSources.includes(prior.titleSource ?? DEFAULT_TITLE_SOURCE)
    ) {
      result = prior;
      return;
    }
    const parameters = patchParameters(prior, request, Date.now());
    database.prepare(UPDATE_SESSION).run(...parameters);
    // 写后解码也属于本次事务；失败时不能留下已写入但无法返回的部分结果。
    result = readAfterWrite(database, request.id);
  });
  return result;
}

export async function updateSession(
  database: DatabaseSync,
  request: UpdateSessionInput,
): Promise<SessionInfo> {
  return applySessionPatch(database, request);
}

export async function setRevert(
  database: DatabaseSync,
  request: {
    sessionID: SessionId;
    revert: SessionRevert;
    summary?: { additions: number; deletions: number; files: number; diffs?: FileDiff[] };
  },
): Promise<void> {
  const summary = request.summary;
  applySessionPatch(database, {
    id: request.sessionID,
    revert: request.revert,
    summary: summary
      ? {
          additions: summary.additions,
          deletions: summary.deletions,
          files: summary.files,
          diffs: summary.diffs,
        }
      : undefined,
  });
}

export async function clearRevert(database: DatabaseSync, sessionID: SessionId): Promise<void> {
  applySessionPatch(database, { id: sessionID, revert: null, summary: null });
}

export function touchSession(
  database: DatabaseSync,
  sessionID: SessionId,
  timeUpdated: number,
): void {
  database
    .prepare("UPDATE session SET time_updated = MAX(time_updated, ?) WHERE id = ?")
    .run(timeUpdated, sessionID);
}
