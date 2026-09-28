// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import type {
  AssistantMessageInfo,
  MessageId,
  PartId,
  ProjectId,
  SessionId,
  TextPart,
  UserMessageInfo,
} from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";

export const owner = "message-contract-owner" as SessionId;
export const other = "message-contract-other" as SessionId;
export const messageID = "message-contract-main" as MessageId;
export const otherMessageID = "message-contract-other-message" as MessageId;
export const partID = "message-contract-part" as PartId;
export function user(id = messageID, sessionID = owner): UserMessageInfo {
  return { id, sessionID, role: "user", agent: "fixture", time: { created: 20 } };
}
export function assistant(): AssistantMessageInfo {
  return {
    id: "message-contract-assistant" as MessageId,
    sessionID: owner,
    role: "assistant",
    parentID: messageID,
    agent: "fixture",
    mode: "build",
    path: { cwd: ".", root: "." },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 30 },
  };
}
export function part(id = partID, target = messageID, sessionID = owner): TextPart {
  return { id, messageID: target, sessionID, type: "text", text: "Fixture", time: { start: 25 } };
}
export async function messageFixture(t: TestContext) {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  for (const id of [owner, other]) {
    await store.createSession({
      id,
      projectID: "message-contract-project" as ProjectId,
      slug: "fixture",
      directory: ".",
      title: "Fixture",
      version: "1",
      time: { created: 10, updated: 11 },
    });
  }
  const rows = (table: "message" | "part" | "session") =>
    db.prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`).all();
  const row = (table: "message" | "part", id: string) =>
    db.prepare(`SELECT rowid,* FROM ${table} WHERE id=?`).get(id)!;
  const data = (table: "message" | "part", id: string) => JSON.parse(String(row(table, id).data));
  return {
    store,
    db,
    rows,
    row,
    data,
    snapshot: () => ({
      messages: rows("message"),
      parts: rows("part"),
      sessions: rows("session"),
    }),
  };
}
