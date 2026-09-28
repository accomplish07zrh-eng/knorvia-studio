// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import type {
  MessageId,
  MessageInfo,
  MessagePart,
  PartId,
  ProjectId,
  SessionId,
  SessionStorePort,
  TurnInputIntentMetadata,
} from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import * as inputs from "../src/storage/session-store/repositories/session-inputs.js";

export { inputs };
export const session = "input-session" as SessionId;
export const otherSession = "other-input-session" as SessionId;
export const project = "input-project" as ProjectId;
export const now = 100;
type Admission = Parameters<NonNullable<SessionStorePort["saveSessionInput"]>>[0];
export function admission(patch: Partial<Admission> = {}): Admission {
  return {
    id: "input",
    sessionID: session,
    kind: "sendText",
    delivery: "queue",
    payload: { text: "first" },
    ...patch,
  };
}
export function message(
  id = "input-message",
  metadata?: Record<string, unknown>,
  owner = session,
): MessageInfo {
  return {
    id: id as MessageId,
    sessionID: owner,
    role: "user",
    agent: "fixture",
    time: { created: 20 },
    ...(metadata ? { metadata } : {}),
  };
}
export function part(id = "input-part", messageID = "input-message", owner = session): MessagePart {
  return {
    id: id as PartId,
    sessionID: owner,
    messageID: messageID as MessageId,
    type: "text",
    text: "Synthetic input",
    time: { start: 20 },
  };
}
export function intent(patch: Partial<TurnInputIntentMetadata> = {}): TurnInputIntentMetadata {
  return {
    sourceCommandId: "command",
    queueItemId: "input",
    clientId: "fixture-client",
    kind: "sendText",
    admissionSeq: 7,
    admittedAt: 5,
    requestedDelivery: "guide",
    admittedDelivery: "queue",
    ...patch,
  };
}
export async function inputFixture(t: TestContext) {
  t.mock.method(Date, "now", () => now);
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  for (const id of [session, otherSession]) {
    await store.createSession({
      id,
      projectID: project,
      slug: id,
      directory: "/fixture/input",
      title: id,
      version: "test",
      time: { created: 1, updated: 2 },
    });
  }
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  const rows = (table: "session_input" | "message" | "part" | "session_entry" | "session") =>
    db
      .prepare(`SELECT rowid,* FROM ${table} ORDER BY rowid`)
      .all()
      .map((row) => ({ ...row }));
  const snapshot = () =>
    Object.fromEntries(
      (["session_input", "message", "part", "session_entry", "session"] as const).map((table) => [
        table,
        rows(table),
      ]),
    );
  const add = (patch: Partial<Admission> = {}) => store.saveSessionInput(admission(patch));
  const promote = (id = "input", info = message(), parts: MessagePart[] = [part()]) =>
    store.promoteSessionInput({ id, sessionID: session, message: info, parts });
  return { db, store, rows, snapshot, add, promote };
}
