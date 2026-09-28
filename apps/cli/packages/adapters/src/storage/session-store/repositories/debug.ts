// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import type { DatabaseSync } from "node:sqlite";
import type { SessionId } from "@knorvia/contracts";
import type { SessionStoreDebugCounts } from "../options.js";

export function debugMigrationIds(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT id FROM schema_migration ORDER BY id ASC")
    .all()
    .map((row) => String(row.id));
}

export function debugCounts(db: DatabaseSync, sessionID?: SessionId): SessionStoreDebugCounts {
  const count = (table: string, scopeColumn?: string): number => {
    const scoped = Boolean(sessionID && scopeColumn);
    const statement = db.prepare(
      `SELECT COUNT(*) AS count FROM ${table}${scoped ? ` WHERE ${scopeColumn} = ?` : ""}`,
    );
    const row = scoped ? statement.get(sessionID!) : statement.get();
    return Number(row?.count ?? 0);
  };
  return {
    sessions: count("session", "id"),
    messages: count("message", "session_id"),
    parts: count("part", "session_id"),
    todos: count("todo", "session_id"),
    targets: count("session_target", "session_id"),
    sessionEntries: count("session_entry", "session_id"),
    permissions: count("permission"),
    localSettings: count("local_setting"),
    schemaMigrations: count("schema_migration"),
    inputHistory: count("input_history", "session_id"),
    modelUsage: count("model_usage", "session_id"),
    toolUsage: count("tool_usage", "session_id"),
    turnUsage: count("turn_usage", "session_id"),
  };
}
