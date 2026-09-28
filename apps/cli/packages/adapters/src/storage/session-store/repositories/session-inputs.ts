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

export async function saveSessionInput(db: DatabaseSync, input: Admission): Promise<void> {
  saveSessionInputSync(db, input);
}

// 复合提交必须在同步临界段完成入账，避免 await 将其他会话写入卷进本次事务。
export function saveSessionInputSync(db: DatabaseSync, input: Admission): void {
  const time = Date.now();
  const statement = db.prepare(`
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
    input.id,
    input.sessionID,
    input.kind,
    input.delivery,
    encodeJson(input.payload) ?? "{}",
    input.sessionID,
    time,
    time,
  );
}

export async function updateSessionInputs(db: DatabaseSync, input: Edits): Promise<void> {
  if (input.updates.length === 0) return;
  const read = db.prepare(`
    SELECT payload, delivery FROM session_input WHERE id = ? AND session_id = ? AND status = 'admitted'
  `);
  const write = db.prepare(`
    UPDATE session_input SET delivery = ?, payload = ?, time_updated = ?
    WHERE id = ? AND session_id = ? AND status = 'admitted'
  `);
  // 只复用既有自有事务边界，避免 SQLite 已自动回滚后再次清理而覆盖首因。
  withWriteTransaction(db, "own", () => {
    const time = Date.now();
    for (const patch of input.updates) {
      const row = read.get(patch.id, input.sessionID) as
        | Pick<SessionInputRow, "payload" | "delivery">
        | undefined;
      if (!row) continue;
      const payload = editInputPayload(row.payload, patch);
      write.run(
        patch.delivery ?? row.delivery,
        encodeJson(payload) ?? "{}",
        time,
        patch.id,
        input.sessionID,
      );
    }
  });
}

export async function markSessionInputPromoted(db: DatabaseSync, input: Marker): Promise<void> {
  const statement = db.prepare(`
    UPDATE session_input SET status = 'promoted', promoted_message_id = ?, promoted_sequence = (
      SELECT COALESCE(MAX(promoted_sequence), -1) + 1 FROM session_input WHERE session_id = ?
    ), time_updated = ? WHERE id = ? AND session_id = ? AND status = 'admitted'
  `);
  statement.run(input.promotedMessageID, input.sessionID, Date.now(), input.id, input.sessionID);
}

export async function settleSessionInput(db: DatabaseSync, input: Settlement): Promise<void> {
  const statement = db.prepare(`
    UPDATE session_input SET status = ?, status_reason = ?, time_updated = ?
    WHERE id = ? AND session_id = ? AND status = 'admitted'
  `);
  statement.run(input.status, input.reason ?? null, Date.now(), input.id, input.sessionID);
}

export async function listSessionInputs(
  db: DatabaseSync,
  input: ListQuery,
): Promise<SessionInputRecord[]> {
  const statement = db.prepare(`${READ_INPUT}
    WHERE session_id = ?${input.status ? " AND status = ?" : ""} ORDER BY admitted_sequence ASC
  `);
  const rows = input.status
    ? statement.all(input.sessionID, input.status)
    : statement.all(input.sessionID);
  return rows.map((row) => projectSessionInput(row as unknown as SessionInputRow));
}

export async function getSessionInputById(
  db: DatabaseSync,
  id: string,
): Promise<SessionInputRecord | null> {
  const row = db.prepare(`${READ_INPUT} WHERE id = ?`).get(id) as unknown as
    | SessionInputRow
    | undefined;
  return row ? projectSessionInput(row) : null;
}
