// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

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

function retainedLegacy(table: StorageTable): string {
  const present = LEGACY_FIELDS[table]
    .map((field) => `json_type(${table}.data, '$.${field}') IS NOT NULL`)
    .join(" OR ");
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
const MESSAGE_ORDER = "sequence IS NULL, sequence, time_created, rowid";
const PART_ORDER = "sequence IS NULL, sequence, time_created, id";

function documentWithCopy(
  db: DatabaseSync,
  table: StorageTable,
  document: Record<string, unknown>,
  source: CopySource | undefined,
): Record<string, unknown> {
  if (!source) return document;
  const row = db
    .prepare(`SELECT data FROM ${table} WHERE id = ? AND session_id = ?`)
    .get(source.id, source.sessionID) as { data: string } | undefined;
  if (!row) throw new Error(`Storage copy source missing: ${table}/${source.id}`);
  return applyLegacySnapshot(document, row.data, table);
}

export async function saveMessage(
  db: DatabaseSync,
  input: MessageInfo,
  copyFrom?: CopySource,
): Promise<void> {
  const document = messageDocument(input);
  const created = input.time.created;
  const updated = input.role === "assistant" ? (input.time.completed ?? Date.now()) : created;
  // 自有事务覆盖来源快照、目标写入与 touch；外层已有事务时仍由调用者收尾。
  withWriteTransaction(db, "borrow", () => {
    const data = encodeJson(documentWithCopy(db, "message", document, copyFrom));
    db.prepare(UPSERT_MESSAGE).run(
      input.id,
      input.sessionID,
      input.sessionID,
      created,
      updated,
      data,
    );
    touchSession(db, input.sessionID, updated);
  });
}

export async function savePart(
  db: DatabaseSync,
  input: MessagePart,
  copyFrom?: CopySource,
): Promise<void> {
  const document = partDocument(input);
  const updated = Date.now();
  const created = partCreatedAt(input, updated);
  // touch 失败时一并撤销本次片段写入；借用事务仍由外层决定清理。
  withWriteTransaction(db, "borrow", () => {
    const data = encodeJson(documentWithCopy(db, "part", document, copyFrom));
    db.prepare(UPSERT_PART).run(
      input.id,
      input.sessionID,
      input.messageID,
      input.messageID,
      created,
      updated,
      data,
    );
    touchSession(db, input.sessionID, updated);
  });
}

export async function messages(
  db: DatabaseSync,
  input: { sessionID: SessionId },
): Promise<MessageWithParts[]> {
  const messageRows = db
    .prepare(`SELECT * FROM message WHERE session_id = ? ORDER BY ${MESSAGE_ORDER}`)
    .all(input.sessionID) as unknown as MessageRow[];
  const partRows = db
    .prepare(`SELECT * FROM part WHERE session_id = ? ORDER BY message_id, ${PART_ORDER}`)
    .all(input.sessionID) as unknown as PartRow[];
  const partsByMessage = new Map<string, MessagePart[]>();
  for (const row of partRows) {
    const part = decodePartRow(row);
    const group = partsByMessage.get(part.messageID);
    if (group) group.push(part);
    else partsByMessage.set(part.messageID, [part]);
  }
  return messageRows.map((row) => {
    const info = decodeMessageRow(row);
    return { info, parts: partsByMessage.get(info.id) ?? [] };
  });
}

export async function messageWithParts(
  db: DatabaseSync,
  input: { sessionID: SessionId; messageID: MessageId },
): Promise<MessageWithParts | null> {
  const row = db
    .prepare("SELECT * FROM message WHERE id = ? AND session_id = ?")
    .get(input.messageID, input.sessionID) as unknown as MessageRow | undefined;
  if (!row) return null;
  const partRows = db
    .prepare(`SELECT * FROM part WHERE session_id = ? AND message_id = ? ORDER BY ${PART_ORDER}`)
    .all(input.sessionID, input.messageID) as unknown as PartRow[];
  const info = decodeMessageRow(row);
  return { info, parts: partRows.map(decodePartRow) };
}

export async function removeMessage(
  db: DatabaseSync,
  input: { sessionID: SessionId; messageID: MessageId },
): Promise<void> {
  db.prepare("DELETE FROM message WHERE id = ? AND session_id = ?").run(
    input.messageID,
    input.sessionID,
  );
}

export async function removePart(
  db: DatabaseSync,
  input: { sessionID: SessionId; messageID: MessageId; partID: PartId },
): Promise<void> {
  db.prepare("DELETE FROM part WHERE id = ? AND message_id = ? AND session_id = ?").run(
    input.partID,
    input.messageID,
    input.sessionID,
  );
}
