// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { SESSION_ENTRY_MODEL_SELECTION, type ProjectId, type SessionId } from "@knorvia/contracts";
import { SqliteSessionStore } from "../src/storage/session-store/sqlite-session-store.js";
import { rawSelection, selectedModel } from "./storage-codec-fixture.js";

async function fixture(t: TestContext) {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  t.after(() => store.close());
  const db = Reflect.get(store, "db") as DatabaseSync;
  assert.ok(db instanceof DatabaseSync);
  const sessionID = "codec-storage-session" as SessionId;
  await store.createSession({
    id: sessionID,
    projectID: "codec-project" as ProjectId,
    slug: "fixture",
    directory: ".",
    title: "Fixture",
    version: "1",
    time: { created: 0, updated: 1 },
  });
  return { store, db, sessionID };
}

test("public memory store projects stored message/part snapshots without rewriting source JSON", async (t) => {
  const { store, db, sessionID } = await fixture(t);
  const message = JSON.stringify({
    id: "snapshot",
    role: "user",
    model: { providerID: "legacy" },
    modelSelection: rawSelection,
    unknown: true,
  });
  const part = JSON.stringify({
    id: "snapshot",
    type: "subtask",
    model: { legacy: true },
    modelSelection: rawSelection,
    prompt: "Fixture",
  });
  db.prepare(
    "INSERT INTO message(id,session_id,time_created,time_updated,data,sequence) VALUES(?,?,?,?,?,?)",
  ).run("stored-message", sessionID, 0, 1, message, 0);
  db.prepare(
    "INSERT INTO part(id,session_id,message_id,time_created,time_updated,data,sequence) VALUES(?,?,?,?,?,?,?)",
  ).run("stored-part", sessionID, "stored-message", 0, 1, part, 0);
  const [result] = await store.messages({ sessionID });
  assert.equal(result.info.id, "stored-message");
  assert.deepEqual(Reflect.get(result.info, "modelSelection"), selectedModel);
  assert.equal(Object.hasOwn(result.info, "model"), false);
  assert.equal(Reflect.get(result.info, "unknown"), true);
  assert.equal(result.parts[0].id, "stored-part");
  assert.deepEqual(Reflect.get(result.parts[0], "model"), selectedModel);
  assert.equal(
    db.prepare("SELECT data FROM message WHERE id=?").get("stored-message")?.data,
    message,
  );
  assert.equal(db.prepare("SELECT data FROM part WHERE id=?").get("stored-part")?.data, part);
});

test("public memory store preserves zero/empty session cells, todo fields and invalid selection entries", async (t) => {
  const { store, db, sessionID } = await fixture(t);
  db.prepare(
    "UPDATE session SET path='',workspace_id='',summary_additions=0,time_archived=0 WHERE id=?",
  ).run(sessionID);
  const session = await store.getSession(sessionID);
  assert.equal(session?.path, "");
  assert.equal(session?.workspaceID, undefined);
  assert.equal(session?.summaryAdditions, 0);
  assert.equal(session?.time.archived, 0);
  const todos = [{ content: "Fixture", status: "pending" as const, priority: "high" as const }];
  await store.updateTodos({ sessionID, todos });
  assert.deepEqual(await store.readTodos({ sessionID }), todos);
  await store.saveSessionEntry({
    id: "selection-null",
    sessionID,
    type: SESSION_ENTRY_MODEL_SELECTION,
    time: { created: 1, updated: 2 },
    data: null,
  });
  await store.saveSessionEntry({
    id: "selection-valid",
    sessionID,
    type: SESSION_ENTRY_MODEL_SELECTION,
    time: { created: 2, updated: 3 },
    data: rawSelection,
  });
  const entries = await store.sessionEntries({ sessionID });
  assert.deepEqual(
    entries.map((entry) => entry.data),
    [null, selectedModel],
  );
  assert.deepEqual(
    JSON.parse(
      String(db.prepare("SELECT data FROM session_entry WHERE id=?").get("selection-null")?.data),
    ),
    { modelSelection: null },
  );
});

test("public memory store reports malformed stored message JSON and keeps its bytes", async (t) => {
  const { store, db, sessionID } = await fixture(t);
  db.prepare(
    "INSERT INTO message(id,session_id,time_created,time_updated,data,sequence) VALUES(?,?,?,?,?,?)",
  ).run("damaged-message", sessionID, 0, 1, "", 0);
  await assert.rejects(store.messages({ sessionID }), SyntaxError);
  assert.equal(db.prepare("SELECT data FROM message WHERE id=?").get("damaged-message")?.data, "");
});
