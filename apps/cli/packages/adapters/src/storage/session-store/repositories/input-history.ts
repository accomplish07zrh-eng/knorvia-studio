// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type {
  InputHistoryAttachment,
  InputHistoryEntry,
  InputHistoryId,
  ProjectId,
  RecordInputHistoryInput,
  RecallPreviousInputHistoryInput,
} from "@knorvia/contracts";
import { decodeJson, encodeJson } from "../json.js";
import type { InputHistoryRow } from "../rows.js";
import { withWriteTransaction } from "./write-transaction.js";

const ATTACHMENT_TYPES: readonly InputHistoryAttachment["type"][] = ["file", "image", "pdf", "url"];
const HISTORY_LIMIT = 100;
const RECENT_FIRST = "time_created DESC, id DESC";
const READ_HISTORY = `
  SELECT id, project_id, session_id, text, attachments, kind, time_created
  FROM input_history WHERE project_id = ? ORDER BY ${RECENT_FIRST} LIMIT 1 OFFSET ?
`;
const INSERT_HISTORY = `
  INSERT INTO input_history (id, project_id, session_id, text, attachments, kind, time_created)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;
const PRUNE_HISTORY = `
  DELETE FROM input_history WHERE id NOT IN (
    SELECT id FROM input_history ORDER BY ${RECENT_FIRST} LIMIT ?
  )
`;

function projectAttachments(
  attachments: InputHistoryAttachment[] | null | undefined,
): InputHistoryAttachment[] | undefined {
  const projected = (attachments ?? []).flatMap((attachment) => {
    if (!ATTACHMENT_TYPES.includes(attachment.type)) return [];
    const path = typeof attachment.path === "string" ? attachment.path.trim() : undefined;
    const rawContent =
      typeof attachment.content === "string" ? attachment.content.trim() : undefined;
    const content = rawContent?.startsWith("data:") ? undefined : rawContent;
    if (!path && !content) return [];
    return [{ type: attachment.type, ...(path ? { path } : {}), ...(content ? { content } : {}) }];
  });
  return projected.length ? projected : undefined;
}

function historyEntry(row: InputHistoryRow): InputHistoryEntry {
  const attachments = projectAttachments(
    decodeJson<InputHistoryAttachment[] | null>(row.attachments),
  );
  return {
    id: row.id as InputHistoryId,
    projectID: row.project_id as ProjectId,
    sessionID: (row.session_id || undefined) as InputHistoryEntry["sessionID"],
    text: row.text,
    ...(attachments ? { attachments } : {}),
    kind: row.kind as InputHistoryEntry["kind"],
    time: { created: row.time_created },
  };
}

function readHistory(db: DatabaseSync, projectID: ProjectId, skip = 0): InputHistoryEntry | null {
  const row = db.prepare(READ_HISTORY).get(projectID, skip) as unknown as
    | InputHistoryRow
    | undefined;
  return row ? historyEntry(row) : null;
}

function isDuplicate(
  previous: InputHistoryEntry | null,
  text: string,
  attachments: InputHistoryAttachment[] | undefined,
): boolean {
  return (
    previous !== null &&
    previous.text === text &&
    JSON.stringify(previous.attachments ?? []) === JSON.stringify(attachments ?? [])
  );
}

export async function recordInputHistory(
  db: DatabaseSync,
  input: RecordInputHistoryInput,
): Promise<InputHistoryEntry | null> {
  const text = input.text.trim();
  if (!text) return null;
  const attachments = projectAttachments(input.attachments);
  // 预检只允许无写入退出，保留外层事务内重复输入也能直接返回的行为。
  if (isDuplicate(readHistory(db, input.projectID), text, attachments)) return null;

  const id = `input_${Date.now().toString(36)}_${crypto.randomUUID()}` as InputHistoryId;
  const created = input.time?.created ?? Date.now();
  let inserted = false;
  // 锁内复查才决定插入，避免预检后另一连接提交同内容造成重复记录。
  // 复用自有事务边界处理自动回滚与清理双失败，不能用重复回滚覆盖数据库首因。
  withWriteTransaction(db, "own", () => {
    if (isDuplicate(readHistory(db, input.projectID), text, attachments)) return;
    db.prepare(INSERT_HISTORY).run(
      id,
      input.projectID,
      input.sessionID ?? null,
      text,
      encodeJson(attachments),
      input.kind,
      created,
    );
    db.prepare(PRUNE_HISTORY).run(HISTORY_LIMIT);
    inserted = true;
  });
  if (!inserted) return null;
  return {
    id,
    projectID: input.projectID,
    sessionID: input.sessionID,
    text,
    ...(attachments ? { attachments } : {}),
    kind: input.kind,
    time: { created },
  };
}

export async function recallPreviousInputHistory(
  db: DatabaseSync,
  input: RecallPreviousInputHistoryInput,
): Promise<InputHistoryEntry | null> {
  return readHistory(db, input.projectID, input.skip ?? 0);
}
