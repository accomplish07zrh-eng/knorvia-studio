// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import type { ProjectId, SessionEntryInfo, SessionId } from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";

export const owner = "entry-todo-owner" as SessionId;
export const other = "entry-todo-other" as SessionId;

export function entry(id = "entry", data: unknown = { note: "Fixture" }): SessionEntryInfo {
  return { id, sessionID: owner, type: "fixture/entry", time: { created: 20, updated: 30 }, data };
}

export async function storageFixture(t: TestContext) {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  for (const id of [owner, other])
    await store.createSession({
      id,
      projectID: "entry-todo-project" as ProjectId,
      slug: "fixture",
      directory: ".",
      title: "Fixture",
      version: "1",
      time: { created: 10, updated: 11 },
    });
  const rows = (table: "session_entry" | "todo" | "session") =>
    db.prepare(`SELECT rowid, * FROM ${table} ORDER BY rowid`).all();
  return {
    store,
    db,
    rows,
    snapshot: () => ({
      entries: rows("session_entry"),
      todos: rows("todo"),
      sessions: rows("session"),
    }),
    rawEntry: (id = "entry") => db.prepare("SELECT rowid,* FROM session_entry WHERE id=?").get(id),
  };
}
