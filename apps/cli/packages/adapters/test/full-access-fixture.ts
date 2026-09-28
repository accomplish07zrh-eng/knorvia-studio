// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import {
  PERMISSION_FULL_ACCESS_ENTRY,
  SESSION_ENTRY_EXECUTION_STATE,
  type ProjectId,
  type SessionId,
  type SessionStorePort,
} from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import { commitPermissionFullAccess } from "../src/storage/session-store/repositories/permission-full-access.js";

export type FullAccessInput = Parameters<
  NonNullable<SessionStorePort["commitPermissionFullAccess"]>
>[0];
export const ownerSession = "full-access-session" as SessionId;
export const otherSession = "other-access-session" as SessionId;

export async function fullAccessFixture(t: TestContext) {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  for (const sessionID of [ownerSession, otherSession])
    await store.createSession({
      id: sessionID,
      projectID: "access-project" as ProjectId,
      slug: "fixture",
      directory: ".",
      title: "Fixture",
      version: "1",
      time: { created: 10, updated: 11 },
    });
  const input: FullAccessInput = {
    sessionID: ownerSession,
    queueItemIds: ["first", "second"],
    execution: {
      id: "execution",
      sessionID: ownerSession,
      type: SESSION_ENTRY_EXECUTION_STATE,
      time: { created: 20, updated: 30 },
      data: { mode: "yolo", planEnabled: false },
    },
    receipt: {
      id: "receipt",
      sessionID: ownerSession,
      type: PERMISSION_FULL_ACCESS_ENTRY,
      time: { created: 40, updated: 50 },
      touchSession: false,
      data: { interactionId: "fixture-interaction", event: { id: "fixture-event" } },
    },
  };
  const payload = {
    text: "fixture",
    intent: { mode: "build", keep: true },
    conversationInputIntent: { mode: "plan", nested: { value: 2 } },
    extra: { preserved: true },
  };
  for (const id of ["first", "second", "later"])
    await store.saveSessionInput({
      id,
      sessionID: ownerSession,
      kind: "fixture",
      delivery: "queue",
      payload,
    });
  return {
    db,
    store,
    input,
    payload,
    commit: (value = input) => commitPermissionFullAccess(db, value),
    queue: (id: string) => db.prepare("SELECT * FROM session_input WHERE id = ?").get(id),
    data: (id: string) =>
      JSON.parse(
        String(db.prepare("SELECT payload FROM session_input WHERE id = ?").get(id)?.payload),
      ),
    snapshot: () => ({
      queues: db.prepare("SELECT * FROM session_input ORDER BY id").all(),
      entries: db.prepare("SELECT * FROM session_entry ORDER BY id").all(),
      sessions: db.prepare("SELECT * FROM session ORDER BY id").all(),
    }),
  };
}
