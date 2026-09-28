// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  SqliteSessionStore,
  createSqliteSessionStore,
  openStartupSqliteSessionStore,
} from "./session-store-facade.target.js";
import {
  fixture,
  owner,
  other,
  project,
  portShapes,
  sessionInput,
  track,
} from "./session-store-facade-surface.fixture.js";

test("surface: all 73 declared ports exist with 66 Promise and seven synchronous signatures", (t) => {
  const { store } = fixture(t);
  const entries = Object.entries(portShapes);
  assert.equal(entries.length, 73);
  assert.equal(entries.filter(([, shape]) => shape === "promise").length, 66);
  assert.equal(entries.filter(([, shape]) => shape === "sync").length, 7);
  for (const key of Object.keys(portShapes) as (keyof typeof portShapes)[])
    assert.equal(typeof store[key], "function", key);
  assert.ok(store instanceof SqliteSessionStore);
});

test("surface: both public factories synchronously return initialized distinct class instances", (t) => {
  const first = track(t, createSqliteSessionStore({ dbPath: ":memory:" }));
  const second = track(t, openStartupSqliteSessionStore({ dbPath: ":memory:" }));
  for (const { store, db } of [first, second]) {
    assert.ok(store instanceof SqliteSessionStore);
    assert.equal(store instanceof Promise, false);
    assert.equal(store.getDatabasePath(), ":memory:");
    assert.equal(store.debugMigrationIds().length, 22);
    assert.equal(db.isTransaction, false);
  }
  assert.notEqual(first.store, second.store);
  assert.notEqual(first.db, second.db);
});

test("surface: an arbitrary constructor symbol cannot skip migration and static startup returns a Promise", async (t) => {
  const ordinary = track(t, new SqliteSessionStore({ dbPath: ":memory:" }, Symbol("external")));
  assert.equal(ordinary.store.debugMigrationIds().length, 22);
  const pending = SqliteSessionStore.openStartup({ dbPath: ":memory:" });
  assert.ok(pending instanceof Promise);
  const asyncStore = track(t, await pending);
  assert.ok(asyncStore.store instanceof SqliteSessionStore);
  assert.equal(asyncStore.store.getDatabasePath(), ":memory:");
  assert.equal(asyncStore.store.debugMigrationIds().length, 22);
});

test("surface: synchronous permissions and representative Promise writes keep their immediate effects and defaults", async (t) => {
  const { store, db } = fixture(t);
  assert.equal(store.getProjectPermissionMode(project), null);
  assert.equal(store.saveProjectPermissionMode({ projectID: project, mode: "plan" }), "plan");
  assert.equal(store.getProjectPermissionMode(project), "plan");
  const creation = store.createSession(sessionInput());
  assert.ok(creation instanceof Promise);
  assert.equal(db.prepare("SELECT id FROM session WHERE id=?").get(owner)?.id, owner);
  await creation;
  const listing = store.listSessions();
  assert.ok(listing instanceof Promise);
  assert.deepEqual(
    (await listing).map((entry) => entry.id),
    [owner],
  );
  const admission = store.saveSessionInput({
    id: "surface-input",
    sessionID: owner,
    kind: "sendText",
    delivery: "queue",
    payload: { text: "synthetic" },
  });
  assert.ok(admission instanceof Promise);
  assert.equal(
    db.prepare("SELECT status FROM session_input WHERE id='surface-input'").get()?.status,
    "admitted",
  );
  assert.equal(db.isTransaction, false);
  await admission;
  const goal = await store.setTarget({ sessionID: owner, objective: "Synthetic target" });
  assert.equal(goal.status, "active");
  const paused = await store.updateTargetStatus({ sessionID: owner, status: "paused" });
  assert.ok(paused);
  await store.createSession(sessionInput(other));
  const copy = await store.cloneTargetForFork({ sessionID: other, source: paused });
  assert.equal(copy.status, "paused");
  const rejection = store.updateSession(undefined as never);
  assert.ok(
    rejection instanceof Promise,
    "invalid public async calls reject rather than synchronously throw",
  );
  await assert.rejects(rejection);
});

test("surface: journal identity is stable and close exposes native errors without reconnecting", (t) => {
  const { store, db } = fixture(t);
  const first = store.workflowJournalStore();
  assert.equal(first instanceof Promise, false);
  assert.equal(store.workflowJournalStore(), first);
  assert.equal(Array.isArray(store.debugMigrationIds()), true);
  assert.equal(store.debugCounts() instanceof Promise, false);
  assert.equal(store.close(), undefined);
  assert.equal(db.isOpen, false);
  assert.equal(store.workflowJournalStore(), first);
  assert.equal(store.getDatabasePath(), ":memory:");
  assert.throws(() => first.getRun("closed-fixture"));
  assert.throws(() => store.debugCounts());
  assert.throws(() => store.close());
});
