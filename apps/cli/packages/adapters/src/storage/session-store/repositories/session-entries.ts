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

export function saveSessionEntry(database: DatabaseSync, request: SessionEntryInfo): void {
  const data = encodeJson(
    request.type === SESSION_ENTRY_MODEL_SELECTION
      ? { modelSelection: request.data ?? null }
      : request.data,
  );
  if (!data) throw new Error(INVALID_ENTRY_DATA);

  // 独立条目与 touch 一起提交；有外层事务时，提交和撤销仍由外层负责。
  withWriteTransaction(database, "borrow", () => {
    database
      .prepare(UPSERT_ENTRY)
      .run(
        request.id,
        request.sessionID,
        request.type,
        request.time.created,
        request.time.updated,
        data,
        SESSION_ENTRY_MODEL_SELECTION,
      );
    if (request.touchSession !== false)
      touchSession(database, request.sessionID, request.time.updated);
  });
}

export function sessionEntries(
  database: DatabaseSync,
  request: { sessionID: SessionId; type?: SessionEntryType | string },
): SessionEntryInfo[] {
  const type = request.type;
  const parameters = type ? [request.sessionID, type] : [request.sessionID];
  const entries = database
    .prepare(`
      SELECT id, session_id, type, time_created, time_updated, data
      FROM session_entry
      WHERE session_id = ?${type ? " AND type = ?" : ""}
      ORDER BY time_created ASC, rowid ASC
    `)
    .all(...parameters) as unknown as SessionEntryRow[];
  return entries.map(decodeSessionEntryRow);
}
