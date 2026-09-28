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
  ON CONFLICT(id) DO UPDATE SET
    project_id = excluded.project_id,
    workspace_id = excluded.workspace_id,
    parent_id = excluded.parent_id,
    trace_id = COALESCE(session.trace_id, excluded.trace_id),
    task_type = excluded.task_type,
    slug = excluded.slug,
    directory = excluded.directory,
    path = excluded.path,
    title = excluded.title,
    title_source = excluded.title_source,
    title_message_id = excluded.title_message_id,
    version = excluded.version,
    share_url = excluded.share_url,
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

export function getSession(db: DatabaseSync, sessionID: SessionId): SessionInfo | null {
  const row = db.prepare("SELECT * FROM session WHERE id = ?").get(sessionID) as unknown as
    | SessionRow
    | undefined;
  return row ? decodeSessionRow(row) : null;
}

function readAfterWrite(db: DatabaseSync, sessionID: SessionId): SessionInfo {
  const stored = getSession(db, sessionID);
  if (!stored) throw new Error(`Session not found after write: ${sessionID}`);
  return stored;
}

export function createSession(db: DatabaseSync, input: CreateSessionInput): SessionInfo {
  const now = Date.now();
  const created = input.time?.created ?? now;
  const updated = input.time?.updated ?? created;
  const titleUpdated = input.titleSource || input.titleMessageID ? updated : null;
  db.prepare(CREATE_SESSION).run(
    input.id,
    input.projectID,
    input.workspaceID ?? null,
    input.parentID ?? null,
    input.traceID ?? null,
    input.taskType ?? DEFAULT_TASK_TYPE,
    input.slug,
    input.directory,
    input.path ?? null,
    input.title,
    input.titleSource ?? DEFAULT_TITLE_SOURCE,
    input.titleMessageID ?? null,
    input.version,
    input.shareURL ?? null,
    encodeJson(input.permission),
    created,
    updated,
    titleUpdated,
  );
  return readAfterWrite(db, input.id);
}

function patchParameters(
  current: SessionInfo,
  input: UpdateSessionInput,
  now: number,
): SQLInputValue[] {
  const summary =
    input.summary === undefined
      ? {
          additions: current.summaryAdditions,
          deletions: current.summaryDeletions,
          files: current.summaryFiles,
          diffs: current.summaryDiffs,
        }
      : input.summary;
  const title = input.title ?? current.title;
  // 显式 null 保留旧标题文本，但仍须按原始输入比较刷新标题时间。
  const titleChanged =
    (input.title !== undefined && input.title !== current.title) ||
    input.titleSource !== undefined ||
    input.titleMessageID !== undefined;
  return [
    input.directory ?? current.directory,
    (input.path === undefined ? current.path : input.path) ?? null,
    title,
    input.titleSource ?? current.titleSource ?? DEFAULT_TITLE_SOURCE,
    (input.titleMessageID === undefined ? current.titleMessageID : input.titleMessageID) ?? null,
    (input.shareURL === undefined ? current.shareURL : input.shareURL) ?? null,
    summary?.additions ?? null,
    summary?.deletions ?? null,
    summary?.files ?? null,
    encodeJson(summary?.diffs),
    encodeJson(input.revert === undefined ? current.revert : input.revert),
    encodeJson(input.permission === undefined ? current.permission : input.permission),
    (input.timeCompacting === undefined ? current.time.compacting : input.timeCompacting) ?? null,
    (input.timeArchived === undefined ? current.time.archived : input.timeArchived) ?? null,
    input.timeUpdated ?? now,
    titleChanged ? now : (current.time.titleUpdated ?? null),
    input.id,
  ];
}

function applySessionPatch(db: DatabaseSync, input: UpdateSessionInput): SessionInfo {
  let result!: SessionInfo;
  // 先取得写入归属再读取，避免同步调用之间用旧快照覆盖标题、权限或标题 gate。
  withWriteTransaction(db, "borrow", () => {
    const current = getSession(db, input.id);
    if (!current) throw new Error(`Session not found: ${input.id}`);
    if (
      input.title !== undefined &&
      input.expectedTitleSources?.length &&
      !input.expectedTitleSources.includes(current.titleSource ?? DEFAULT_TITLE_SOURCE)
    ) {
      result = current;
      return;
    }
    const parameters = patchParameters(current, input, Date.now());
    db.prepare(UPDATE_SESSION).run(...parameters);
    // 写后解码也属于本次事务；失败时不能留下已写入但无法返回的部分结果。
    result = readAfterWrite(db, input.id);
  });
  return result;
}

export async function updateSession(
  db: DatabaseSync,
  input: UpdateSessionInput,
): Promise<SessionInfo> {
  return applySessionPatch(db, input);
}

export async function setRevert(
  db: DatabaseSync,
  input: {
    sessionID: SessionId;
    revert: SessionRevert;
    summary?: { additions: number; deletions: number; files: number; diffs?: FileDiff[] };
  },
): Promise<void> {
  const summary = input.summary;
  applySessionPatch(db, {
    id: input.sessionID,
    revert: input.revert,
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

export async function clearRevert(db: DatabaseSync, sessionID: SessionId): Promise<void> {
  applySessionPatch(db, { id: sessionID, revert: null, summary: null });
}

export function touchSession(db: DatabaseSync, sessionID: SessionId, timeUpdated: number): void {
  db.prepare("UPDATE session SET time_updated = MAX(time_updated, ?) WHERE id = ?").run(
    timeUpdated,
    sessionID,
  );
}
