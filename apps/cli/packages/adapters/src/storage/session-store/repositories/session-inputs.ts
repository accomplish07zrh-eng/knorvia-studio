// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { SessionInputRecord, SessionStorePort } from "@knorvia/contracts";
import { encodeJson } from "../json.js";
import { editInputPayload, projectSessionInput } from "./session-input-documents.js";
import type { SessionInputRow } from "./session-input-documents.js";
import { withWriteTransaction } from "./write-transaction.js";

export { promoteSessionInput } from "./session-input-promotion.js";

type Admission = Parameters<NonNullable<SessionStorePort["saveSessionInput"]>>[0];
type Edits = Parameters<NonNullable<SessionStorePort["updateSessionInputs"]>>[0];
type Marker = Parameters<NonNullable<SessionStorePort["markSessionInputPromoted"]>>[0];
type Settlement = Parameters<NonNullable<SessionStorePort["settleSessionInput"]>>[0];
type ListQuery = Parameters<NonNullable<SessionStorePort["listSessionInputs"]>>[0];

const READ_INPUT = `
  SELECT id, session_id, kind, delivery, payload, admitted_sequence, promoted_sequence,
    promoted_message_id, status, status_reason, time_created, time_updated
  FROM session_input
`;

export async function saveSessionInput(database: DatabaseSync, request: Admission): Promise<void> {
  saveSessionInputSync(database, request);
}

// 复合提交必须在同步临界段完成入账，避免 await 将其他会话写入卷进本次事务。
export function saveSessionInputSync(database: DatabaseSync, request: Admission): void {
  const time = Date.now();
  const statement = database.prepare(`
    INSERT INTO session_input (
      id, session_id, kind, delivery, payload, admitted_sequence, status, time_created, time_updated
    ) VALUES (?, ?, ?, ?, ?, (
      SELECT COALESCE(MAX(admitted_sequence), -1) + 1 FROM session_input WHERE session_id = ?
    ), 'admitted', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind, delivery = excluded.delivery,
      payload = excluded.payload, time_updated = excluded.time_updated
  `);
  statement.run(
    request.id,
    request.sessionID,
    request.kind,
    request.delivery,
    encodeJson(request.payload) ?? "{}",
    request.sessionID,
    time,
    time,
  );
}

export async function updateSessionInputs(database: DatabaseSync, request: Edits): Promise<void> {
  if (request.updates.length === 0) return;
  const read = database.prepare(`
    SELECT payload, delivery FROM session_input WHERE id = ? AND session_id = ? AND status = 'admitted'
  `);
  const write = database.prepare(`
    UPDATE session_input SET delivery = ?, payload = ?, time_updated = ?
    WHERE id = ? AND session_id = ? AND status = 'admitted'
  `);
  // 只复用既有自有事务边界，避免 SQLite 已自动回滚后再次清理而覆盖首因。
  withWriteTransaction(database, "own", () => {
    const time = Date.now();
    for (const patch of request.updates) {
      const entry = read.get(patch.id, request.sessionID) as
        | Pick<SessionInputRow, "payload" | "delivery">
        | undefined;
      if (!entry) continue;
      const payload = editInputPayload(entry.payload, patch);
      write.run(
        patch.delivery ?? entry.delivery,
        encodeJson(payload) ?? "{}",
        time,
        patch.id,
        request.sessionID,
      );
    }
  });
}

export async function markSessionInputPromoted(
  database: DatabaseSync,
  request: Marker,
): Promise<void> {
  const statement = database.prepare(`
    UPDATE session_input SET status = 'promoted', promoted_message_id = ?, promoted_sequence = (
      SELECT COALESCE(MAX(promoted_sequence), -1) + 1 FROM session_input WHERE session_id = ?
    ), time_updated = ? WHERE id = ? AND session_id = ? AND status = 'admitted'
  `);
  statement.run(
    request.promotedMessageID,
    request.sessionID,
    Date.now(),
    request.id,
    request.sessionID,
  );
}

export async function settleSessionInput(
  database: DatabaseSync,
  request: Settlement,
): Promise<void> {
  const statement = database.prepare(`
    UPDATE session_input SET status = ?, status_reason = ?, time_updated = ?
    WHERE id = ? AND session_id = ? AND status = 'admitted'
  `);
  statement.run(request.status, request.reason ?? null, Date.now(), request.id, request.sessionID);
}

export async function listSessionInputs(
  database: DatabaseSync,
  request: ListQuery,
): Promise<SessionInputRecord[]> {
  const statement = database.prepare(`${READ_INPUT}
    WHERE session_id = ?${input.status ? " AND status = ?" : ""} ORDER BY admitted_sequence ASC
  `);
  const entries = request.status
    ? statement.all(request.sessionID, request.status)
    : statement.all(request.sessionID);
  return entries.map((entry) => projectSessionInput(entry as unknown as SessionInputRow));
}

export async function getSessionInputById(
  database: DatabaseSync,
  id: string,
): Promise<SessionInputRecord | null> {
  const entry = database.prepare(`${READ_INPUT} WHERE id = ?`).get(id) as unknown as
    | SessionInputRow
    | undefined;
  return entry ? projectSessionInput(entry) : null;
}
