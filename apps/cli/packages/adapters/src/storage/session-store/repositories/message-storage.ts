// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 消息与分片的写入/读取：两条 UPSERT 负责「保留旧文档的 legacy 字段」这一语义。
// SQL 文本（含 legacy json_set 片段）与排序列都是数据格式的一部分，逐字保留。

import type { DatabaseSync } from "node:sqlite";
import type {
  MessageId,
  MessageInfo,
  MessagePart,
  MessageWithParts,
  PartId,
  SessionId,
} from "@knorvia/contracts";
import { decodeMessageRow, decodePartRow, partCreatedAt } from "../codecs.js";
import { encodeJson } from "../json.js";
import type { MessageRow, PartRow } from "../rows.js";
import {
  applyLegacySnapshot,
  LEGACY_FIELDS,
  messageDocument,
  partDocument,
} from "./message-documents.js";
import { touchSession } from "./sessions.js";
import { withWriteTransaction } from "./write-transaction.js";

type StorageTable = keyof typeof LEGACY_FIELDS;
type CopySource = { sessionID: SessionId; id: string };

const MESSAGE_ORDER = "sequence IS NULL, sequence, time_created, rowid";
const PART_ORDER = "sequence IS NULL, sequence, time_created, id";

/** legacy 字段存在性判断：任一字段在新文档里存在，就只更新这几个字段。 */
function retainedLegacy(table: StorageTable): string {
  const fieldChecks = LEGACY_FIELDS[table].map(
    (field) => `json_type(${table}.data, '$.${field}') IS NOT NULL`,
  );
  const present = fieldChecks.join(" OR ");
  const patches = LEGACY_FIELDS[table].map(
    (field) => `
      CASE WHEN json_type(${table}.data, '$.${field}') IS NOT NULL THEN '$.${field}' END,
      json_extract(${table}.data, '$.${field}')`,
  );
  // 旧值没有快照字段时不解析新文档，避免 JSON1 深度上限拒绝原可保存的 JSON。
  return `CASE WHEN ${present} THEN json_set(excluded.data, ${patches.join(",")}) ELSE excluded.data END`;
}

const UPSERT_MESSAGE = `
  INSERT INTO message (id, session_id, sequence, time_created, time_updated, data)
  VALUES (?, ?, (SELECT COALESCE(MAX(sequence), -1) + 1 FROM message WHERE session_id = ?), ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    session_id = excluded.session_id,
    sequence = CASE WHEN message.session_id = excluded.session_id
      THEN message.sequence ELSE excluded.sequence END,
    time_updated = excluded.time_updated,
    data = CASE WHEN message.session_id = excluded.session_id
      THEN ${retainedLegacy("message")} ELSE excluded.data END
`;
const UPSERT_PART = `
  INSERT INTO part (id, session_id, message_id, sequence, time_created, time_updated, data)
  VALUES (?, ?, ?, (SELECT COALESCE(MAX(sequence), -1) + 1 FROM part WHERE message_id = ?), ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    session_id = excluded.session_id,
    message_id = excluded.message_id,
    sequence = CASE WHEN part.session_id = excluded.session_id
      AND part.message_id = excluded.message_id THEN part.sequence ELSE excluded.sequence END,
    time_updated = excluded.time_updated,
    data = CASE WHEN part.session_id = excluded.session_id AND part.message_id = excluded.message_id
      THEN ${retainedLegacy("part")} ELSE excluded.data END
`;

/** 复制来源的旧文档：取自同一张表同一会话，缺失即报错（不能静默丢 legacy 字段）。 */
function documentWithCopy(
  database: DatabaseSync,
  table: StorageTable,
  document: Record<string, unknown>,
  source: CopySource | undefined,
): Record<string, unknown> {
  if (!source) return document;
  const found = database
    .prepare(`SELECT data FROM ${table} WHERE id = ? AND session_id = ?`)
    .get(source.id, source.sessionID) as { data: string } | undefined;
  if (!found) throw new Error(`Storage copy source missing: ${table}/${source.id}`);
  return applyLegacySnapshot(document, found.data, table);
}

function upsertMessageRow(
  database: DatabaseSync,
  request: MessageInfo,
  created: number,
  updated: number,
  data: string | null,
): void {
  database
    .prepare(UPSERT_MESSAGE)
    .run(request.id, request.sessionID, request.sessionID, created, updated, data);
}

export async function saveMessage(
  database: DatabaseSync,
  request: MessageInfo,
  copyFrom?: CopySource,
): Promise<void> {
  saveMessageSync(database, request, copyFrom);
}

// 提升事务不能跨 await；公开 Promise API 与同域同步调用共用这一条写入路径。
export function saveMessageSync(
  database: DatabaseSync,
  request: MessageInfo,
  copyFrom?: CopySource,
): void {
  const document = messageDocument(request);
  const created = request.time.created;
  const updated = request.role === "assistant" ? (request.time.completed ?? Date.now()) : created;
  // 自有事务覆盖来源快照、目标写入与 touch；外层已有事务时仍由调用者收尾。
  withWriteTransaction(database, "borrow", () => {
    const data = encodeJson(documentWithCopy(database, "message", document, copyFrom));
    upsertMessageRow(database, request, created, updated, data);
    touchSession(database, request.sessionID, updated);
  });
}

export async function savePart(
  database: DatabaseSync,
  request: MessagePart,
  copyFrom?: CopySource,
): Promise<void> {
  savePartSync(database, request, copyFrom);
}

export function savePartSync(
  database: DatabaseSync,
  request: MessagePart,
  copyFrom?: CopySource,
): void {
  const document = partDocument(request);
  const now = Date.now();
  const created = partCreatedAt(request, now);
  // touch 失败时一并撤销本次片段写入；借用事务仍由外层决定清理。
  withWriteTransaction(database, "borrow", () => {
    const data = encodeJson(documentWithCopy(database, "part", document, copyFrom));
    database
      .prepare(UPSERT_PART)
      .run(request.id, request.sessionID, request.messageID, request.messageID, created, now, data);
    touchSession(database, request.sessionID, now);
  });
}

/** 按 messageID 归组：读取消息列表时一次查完所有分片再分发。 */
function groupPartsByMessage(fragments: PartRow[]): Map<string, MessagePart[]> {
  const grouped = new Map<string, MessagePart[]>();
  for (const record of fragments) {
    const part = decodePartRow(record);
    const bucket = grouped.get(part.messageID);
    if (bucket) bucket.push(part);
    else grouped.set(part.messageID, [part]);
  }
  return grouped;
}

function withParts(info: MessageInfo, parts: MessagePart[]): MessageWithParts {
  const bundle = {} as MessageWithParts;
  bundle.info = info;
  bundle.parts = parts;
  return bundle;
}

export async function messages(
  database: DatabaseSync,
  request: { sessionID: SessionId },
): Promise<MessageWithParts[]> {
  return messagesSync(database, request);
}

export function messagesSync(
  database: DatabaseSync,
  request: { sessionID: SessionId },
): MessageWithParts[] {
  const messageRows = database
    .prepare(`SELECT * FROM message WHERE session_id = ? ORDER BY ${MESSAGE_ORDER}`)
    .all(request.sessionID) as unknown as MessageRow[];
  const partRows = database
    .prepare(`SELECT * FROM part WHERE session_id = ? ORDER BY message_id, ${PART_ORDER}`)
    .all(request.sessionID) as unknown as PartRow[];
  const grouped = groupPartsByMessage(partRows);
  return messageRows.map((record) => {
    const info = decodeMessageRow(record);
    return withParts(info, grouped.get(info.id) ?? []);
  });
}

export async function messageWithParts(
  database: DatabaseSync,
  request: { sessionID: SessionId; messageID: MessageId },
): Promise<MessageWithParts | null> {
  const found = database
    .prepare("SELECT * FROM message WHERE id = ? AND session_id = ?")
    .get(request.messageID, request.sessionID) as unknown as MessageRow | undefined;
  if (!found) return null;
  const fragments = database
    .prepare(`SELECT * FROM part WHERE session_id = ? AND message_id = ? ORDER BY ${PART_ORDER}`)
    .all(request.sessionID, request.messageID) as unknown as PartRow[];
  const info = decodeMessageRow(found);
  return withParts(info, fragments.map(decodePartRow));
}

export async function removeMessage(
  database: DatabaseSync,
  request: { sessionID: SessionId; messageID: MessageId },
): Promise<void> {
  database
    .prepare("DELETE FROM message WHERE id = ? AND session_id = ?")
    .run(request.messageID, request.sessionID);
}

export async function removePart(
  database: DatabaseSync,
  request: { sessionID: SessionId; messageID: MessageId; partID: PartId },
): Promise<void> {
  database
    .prepare("DELETE FROM part WHERE id = ? AND message_id = ? AND session_id = ?")
    .run(request.partID, request.messageID, request.sessionID);
}
