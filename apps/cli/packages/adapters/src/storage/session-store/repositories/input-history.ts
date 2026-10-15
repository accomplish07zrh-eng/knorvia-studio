// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 输入历史：记录用户提交过的输入（可带附件），并按项目维度回捞上一条。
// SQL 文本与元素列名属于数据格式，逐字保留；本文件只调整编排与局部命名。

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
const ID_PREFIX = "input_";

/** 附件投影：只保留已知类型，且至少要有一个可用字段（路径或正文）。 */
function projectAttachments(
  attachments: InputHistoryAttachment[] | null | undefined,
): InputHistoryAttachment[] | undefined {
  const kept = (attachments ?? []).flatMap((attachment) => {
    if (!ATTACHMENT_TYPES.includes(attachment.type)) return [];
    const target = typeof attachment.path === "string" ? attachment.path.trim() : undefined;
    const rawBody = typeof attachment.content === "string" ? attachment.content.trim() : undefined;
    // data URL 形态的正文不落库（体积与隐私），只保留真实文本。
    const body = rawBody?.startsWith("data:") ? undefined : rawBody;
    if (!target && !body) return [];
    return [
      {
        type: attachment.type,
        ...(target ? { path: target } : {}),
        ...(body ? { content: body } : {}),
      },
    ];
  });
  return kept.length ? kept : undefined;
}

/** 行 → 条目：sessionID 用 `|| undefined` 把空串抹平；附件为空时不产出该字段。 */
function toEntry(record: InputHistoryRow): InputHistoryEntry {
  const attachments = projectAttachments(
    decodeJson<InputHistoryAttachment[] | null>(record.attachments),
  );
  const entry = {} as InputHistoryEntry;
  entry.id = record.id as InputHistoryId;
  entry.projectID = record.project_id as ProjectId;
  entry.sessionID = (record.session_id || undefined) as InputHistoryEntry["sessionID"];
  entry.text = record.text;
  if (attachments) entry.attachments = attachments;
  entry.kind = record.kind as InputHistoryEntry["kind"];
  entry.time = { created: record.time_created };
  return entry;
}

function readHistory(db: DatabaseSync, projectID: ProjectId, skip = 0): InputHistoryEntry | null {
  const record = db.prepare(READ_HISTORY).get(projectID, skip) as unknown as
    | InputHistoryRow
    | undefined;
  return record ? toEntry(record) : null;
}

/** 重复判定：正文与附件序列都一致才算重复（附件按 JSON 序列比较）。 */
function isDuplicate(
  prior: InputHistoryEntry | null,
  body: string,
  attachments: InputHistoryAttachment[] | undefined,
): boolean {
  if (prior === null) return false;
  if (prior.text !== body) return false;
  return JSON.stringify(prior.attachments ?? []) === JSON.stringify(attachments ?? []);
}

function newEntryId(): InputHistoryId {
  return `${ID_PREFIX}${Date.now().toString(36)}_${crypto.randomUUID()}` as InputHistoryId;
}

/** 写入 + 裁剪：两条语句必须在同一事务里，裁剪失败要能整体回滚。 */
function persistHistory(
  db: DatabaseSync,
  values: {
    attachments: InputHistoryAttachment[] | undefined;
    body: string;
    created: number;
    id: InputHistoryId;
    input: RecordInputHistoryInput;
  },
): void {
  const { attachments, body, created, id, input } = values;
  db.prepare(INSERT_HISTORY).run(
    id,
    input.projectID,
    input.sessionID ?? null,
    body,
    encodeJson(attachments),
    input.kind,
    created,
  );
  db.prepare(PRUNE_HISTORY).run(HISTORY_LIMIT);
}

function resultEntry(
  input: RecordInputHistoryInput,
  body: string,
  attachments: InputHistoryAttachment[] | undefined,
  id: InputHistoryId,
  created: number,
): InputHistoryEntry {
  const entry = {} as InputHistoryEntry;
  entry.id = id;
  entry.projectID = input.projectID;
  entry.sessionID = input.sessionID;
  entry.text = body;
  if (attachments) entry.attachments = attachments;
  entry.kind = input.kind;
  entry.time = { created };
  return entry;
}

export async function recordInputHistory(
  db: DatabaseSync,
  input: RecordInputHistoryInput,
): Promise<InputHistoryEntry | null> {
  const body = input.text.trim();
  if (!body) return null;
  const attachments = projectAttachments(input.attachments);
  // 预检只允许无写入退出，保留外层事务内重复输入也能直接返回的行为。
  if (isDuplicate(readHistory(db, input.projectID), body, attachments)) return null;

  const id = newEntryId();
  const created = input.time?.created ?? Date.now();
  let written = false;
  // 锁内复查才决定插入，避免预检后另一连接提交同内容造成重复记录。
  // 复用自有事务边界处理自动回滚与清理双失败，不能用重复回滚覆盖数据库首因。
  withWriteTransaction(db, "own", () => {
    if (isDuplicate(readHistory(db, input.projectID), body, attachments)) return;
    persistHistory(db, { attachments, body, created, id, input });
    written = true;
  });
  return written ? resultEntry(input, body, attachments, id, created) : null;
}

export async function recallPreviousInputHistory(
  db: DatabaseSync,
  input: RecallPreviousInputHistoryInput,
): Promise<InputHistoryEntry | null> {
  return readHistory(db, input.projectID, input.skip ?? 0);
}
