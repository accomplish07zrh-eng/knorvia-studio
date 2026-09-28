// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { SqliteSessionMigrationError } from "./session-store-facade.target.js";
import {
  countKeys,
  counts,
  fixture,
  owner,
  other,
  project,
  otherProject,
  sessionInput,
  type SessionID,
  type Store,
} from "./session-store-facade-surface.fixture.js";

async function populated(t: TestContext) {
  const f = fixture(t);
  const now = Date.now();
  for (const [index, sessionID] of [owner, other].entries()) {
    await f.store.createSession(sessionInput(sessionID));
    const messageID = `debug-message-${index}` as Parameters<Store["saveMessage"]>[0]["id"];
    await f.store.saveMessage({
      id: messageID,
      sessionID,
      role: "user",
      agent: "fixture",
      time: { created: now },
    });
    for (let part = 0; part < (index === 0 ? 2 : 1); part++)
      await f.store.savePart({
        id: `debug-part-${index}-${part}` as Parameters<Store["savePart"]>[0]["id"],
        sessionID,
        messageID,
        type: "text",
        text: "Synthetic",
        time: { start: now },
      });
    await f.store.updateTodos({
      sessionID,
      todos: Array.from({ length: index === 0 ? 2 : 1 }, (_, item) => ({
        content: `todo-${item}`,
        status: "pending",
        priority: "high",
      })),
    });
    await f.store.setTarget({ sessionID, objective: `target-${index}` });
    for (let entry = 0; entry < (index === 0 ? 2 : 1); entry++)
      await f.store.saveSessionEntry({
        id: `debug-entry-${index}-${entry}`,
        sessionID,
        type: "fixture/debug",
        time: { created: now, updated: now },
        data: { synthetic: true },
      });
    await f.store.recordInputHistory({
      projectID: project,
      sessionID,
      text: `debug-history-${index}`,
      kind: "prompt",
      time: { created: now },
    });
    await f.store.recordModelUsage({
      id: `debug-model-${index}`,
      logicalRequestId: `logical-${index}`,
      sessionID,
      querySource: "main_turn",
      providerId: "fixture",
      modelId: "fixture",
      status: "completed",
      startedAt: now,
    });
    await f.store.upsertToolUsage({
      id: `debug-tool-${index}`,
      sessionID,
      toolCallID: `call-${index}`,
      toolName: "Read",
      status: "completed",
      startedAt: now,
    });
    await f.store.upsertTurnUsage({
      sessionID,
      turnID: `debug-turn-${index}` as Parameters<Store["upsertTurnUsage"]>[0]["turnID"],
      status: "completed",
      startedAt: now,
    });
  }
  // Historical permissions are a separate global table from current local settings.
  for (const projectID of [project, otherProject]) {
    f.db
      .prepare("INSERT INTO permission VALUES (?,1,1,?)")
      .run(projectID, '{"version":1,"allow":[]}');
    f.store.saveProjectPermissionMode({ projectID, mode: "plan" });
  }
  return f;
}

test("debug: thirteen own numeric fields preserve order and global versus session scope", async (t) => {
  const { store } = await populated(t);
  const global = store.debugCounts();
  assert.deepEqual(Object.keys(global), countKeys);
  assert.equal(Object.getPrototypeOf(global), Object.prototype);
  assert.ok(
    Object.values(global).every(
      (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    ),
  );
  assert.deepEqual(global, counts([2, 2, 3, 3, 2, 3, 2, 2, 22, 2, 2, 2, 2]));
  assert.deepEqual(store.debugCounts(owner), counts([1, 1, 2, 2, 1, 2, 2, 2, 22, 1, 1, 1, 1]));
  assert.deepEqual(store.debugCounts(other), counts([1, 1, 1, 1, 1, 1, 2, 2, 22, 1, 1, 1, 1]));
  assert.deepEqual(store.debugCounts("" as SessionID), global);
  assert.deepEqual(
    store.debugCounts(" " as SessionID),
    counts([0, 0, 0, 0, 0, 0, 2, 2, 22, 0, 0, 0, 0]),
  );
});

test("debug: migration IDs include all stored identities in SQLite ascending order", (t) => {
  const { store, db } = fixture(t);
  const original = store.debugMigrationIds();
  assert.equal(original.length, 22);
  db.prepare("INSERT INTO schema_migration VALUES (?,?,?,?)").run(
    "zz_fixture",
    "fixture",
    "fixture",
    1,
  );
  db.prepare("INSERT INTO schema_migration VALUES (?,?,?,?)").run(
    "!_fixture",
    "fixture",
    "fixture",
    1,
  );
  const observed = store.debugMigrationIds();
  assert.deepEqual(observed, ["!_fixture", ...original, "zz_fixture"]);
  observed.length = 0;
  assert.equal(store.debugMigrationIds().length, 24, "caller mutation must not affect later reads");
});

test("debug: counts issue thirteen independent reads without transaction control or cached results", (t) => {
  const { store, db } = fixture(t);
  const nativePrepare = db.prepare.bind(db);
  const calls: string[] = [];
  const prepare = t.mock.method(db, "prepare", (sql: string) => {
    calls.push(sql);
    return nativePrepare(sql);
  });
  const exec = t.mock.method(db, "exec", () => {
    assert.fail("debug must not control transactions");
  });
  const first = store.debugCounts();
  assert.equal(calls.length, 13);
  assert.equal(db.isTransaction, false);
  prepare.mock.restore();
  exec.mock.restore();
  db.prepare("INSERT INTO permission VALUES (?,1,1,?)").run(project, "{}");
  assert.equal(store.debugCounts().permissions, first.permissions + 1);
  assert.equal(first.permissions, 0, "earlier results are independent objects");
});

test("debug: missing native tables and a closed connection remain observable errors", (t) => {
  const { store, db } = fixture(t);
  db.exec("DROP TABLE permission");
  assert.throws(
    () => store.debugCounts(),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error instanceof SqliteSessionMigrationError, false);
      assert.equal((error as { code?: string }).code, "ERR_SQLITE_ERROR");
      assert.match(error.message, /permission/);
      return true;
    },
  );
  store.close();
  assert.throws(() => store.debugCounts());
  assert.throws(() => store.debugMigrationIds());
});
