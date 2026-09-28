// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import {
  SESSION_ENTRY_MODEL_SELECTION,
  type SessionEntryInfo,
  type SessionEntryType,
  type SessionId,
} from "@knorvia/contracts";
import { decodeSessionEntryRow } from "../codecs.js";
import { encodeJson } from "../json.js";
import type { SessionEntryRow } from "../rows.js";
import { touchSession } from "./sessions.js";
import { withWriteTransaction } from "./write-transaction.js";

const INVALID_ENTRY_DATA = "Session entry data must be JSON-serializable";
const UPSERT_ENTRY = `
  INSERT INTO session_entry (id, session_id, type, time_created, time_updated, data)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    session_id = excluded.session_id,
    type = excluded.type,
    time_updated = excluded.time_updated,
    data = CASE
      WHEN excluded.type = ?
        AND session_entry.type = excluded.type
        AND session_entry.session_id = excluded.session_id
      THEN CASE json_type(session_entry.data)
        WHEN 'object' THEN json_set(
          session_entry.data,
          '$.modelSelection',
          json_extract(excluded.data, '$.modelSelection')
        )
        ELSE excluded.data
      END
      ELSE excluded.data
    END
`;

export function saveSessionEntry(db: DatabaseSync, input: SessionEntryInfo): void {
  const data = encodeJson(
    input.type === SESSION_ENTRY_MODEL_SELECTION
      ? { modelSelection: input.data ?? null }
      : input.data,
  );
  if (!data) throw new Error(INVALID_ENTRY_DATA);

  // 独立条目与 touch 一起提交；有外层事务时，提交和撤销仍由外层负责。
  withWriteTransaction(db, "borrow", () => {
    db.prepare(UPSERT_ENTRY).run(
      input.id,
      input.sessionID,
      input.type,
      input.time.created,
      input.time.updated,
      data,
      SESSION_ENTRY_MODEL_SELECTION,
    );
    if (input.touchSession !== false) touchSession(db, input.sessionID, input.time.updated);
  });
}

export function sessionEntries(
  db: DatabaseSync,
  input: { sessionID: SessionId; type?: SessionEntryType | string },
): SessionEntryInfo[] {
  const type = input.type;
  const parameters = type ? [input.sessionID, type] : [input.sessionID];
  const rows = db
    .prepare(`
      SELECT id, session_id, type, time_created, time_updated, data
      FROM session_entry
      WHERE session_id = ?${type ? " AND type = ?" : ""}
      ORDER BY time_created ASC, rowid ASC
    `)
    .all(...parameters) as unknown as SessionEntryRow[];
  return rows.map(decodeSessionEntryRow);
}
