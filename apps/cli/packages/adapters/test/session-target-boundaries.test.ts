// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import {
  captureError,
  clock,
  fixture,
  rawState,
  seedTarget,
  touchTrigger,
  traceTransactions,
} from "./session-target.fixture.js";
import { target, type SessionGoal } from "./session-target-test-api.js";

test("public Store covers twelve Promise ports, defaults and an actual active run", async (t) => {
  const f = await fixture(t);
  const pending = f.store.setTarget({ sessionID: f.sessionID, objective: "Public default" });
  assert.ok(pending instanceof Promise);
  const goal = await pending;
  assert.equal(goal.status, "active");
  assert.equal(target.readSessionTarget(f.db, { sessionID: f.sessionID })?.targetID, goal.targetID);
  await f.store.startTargetRun({
    sessionID: f.sessionID,
    targetID: goal.targetID,
    inputID: "turn",
    startedAtMs: 1000,
  });
  await f.store.heartbeatTargetRun({
    sessionID: f.sessionID,
    targetID: goal.targetID,
    inputID: "turn",
    seenAtMs: 1200,
  });
  const result = await f.store.finishTargetRun({
    sessionID: f.sessionID,
    targetID: goal.targetID,
    inputID: "turn",
    endedAtMs: 2100,
  });
  assert.equal(result?.timeUsedSeconds, 2);
  assert.equal(result?.activeInputId, null);
  assert.deepEqual(await f.store.readTarget({ sessionID: f.sessionID }), result);
  const paused = await f.store.updateTargetStatus({ sessionID: f.sessionID, status: "paused" });
  assert.ok(paused);
  const copy = await f.store.cloneTargetForFork({ sessionID: f.sessionID, source: paused });
  assert.equal(copy.status, "paused", "omitted clone status uses source.status");
  assert.equal(copy.targetID, goal.targetID);
  assert.equal(
    await f.store.createTarget({ sessionID: f.sessionID, objective: "Ignored existing" }),
    null,
  );
  assert.equal(
    (
      await f.store.accountTargetUsage({
        sessionID: f.sessionID,
        targetID: goal.targetID,
        tokensUsedDelta: 3,
      })
    )?.tokensUsed,
    3,
  );
  assert.equal(
    (
      await f.store.updateTargetSummaryTitle({
        sessionID: f.sessionID,
        targetID: goal.targetID,
        summaryTitle: "public summary",
      })
    )?.summaryTitle,
    "public summary",
  );
  await f.store.updateTargetStatus({ sessionID: f.sessionID, status: "active" });
  await f.store.startTargetRun({
    sessionID: f.sessionID,
    targetID: goal.targetID,
    inputID: "recover",
    startedAtMs: 3000,
  });
  await f.store.heartbeatTargetRun({
    sessionID: f.sessionID,
    targetID: goal.targetID,
    inputID: "recover",
    seenAtMs: 4501,
  });
  const recovered = await f.store.recoverInterruptedTargetRun({ sessionID: f.sessionID });
  assert.equal(recovered?.status, "paused");
  assert.equal(recovered?.timeUsedSeconds, 4);
  assert.equal(await f.store.clearTarget({ sessionID: f.sessionID }), true);
  assert.equal(await f.store.readTarget({ sessionID: f.sessionID }), null);
  assert.equal(
    (await f.store.createTarget({ sessionID: f.sessionID, objective: "Public new" }))?.status,
    "active",
  );
});

test("successful writes borrow an existing transaction and remain caller-reversible", async (t) => {
  const f = await fixture(t);
  const before = rawState(f.db);
  f.db.exec("BEGIN IMMEDIATE");
  const events = traceTransactions(t, f.db);
  const created = target.setSessionTarget(f.db, {
    sessionID: f.sessionID,
    objective: "Borrowed",
    status: "active",
  });
  target.startSessionTargetRun(f.db, {
    sessionID: f.sessionID,
    targetID: created.targetID,
    inputID: "input",
    startedAtMs: 1000,
  });
  const settled = target.finishSessionTargetRun(f.db, {
    sessionID: f.sessionID,
    targetID: created.targetID,
    inputID: "input",
    endedAtMs: 2001,
  });
  assert.equal(settled?.timeUsedSeconds, 2);
  assert.equal(f.db.isTransaction, true);
  assert.deepEqual(events, [], "no new BEGIN, COMMIT, rollback or savepoint owner");
  f.db.exec("ROLLBACK");
  assert.deepEqual(rawState(f.db), before);
});

test("borrowed native ABORT does not rollback caller work and caller rollback restores all", async (t) => {
  const f = await fixture(t);
  const before = rawState(f.db);
  touchTrigger(f.db);
  f.db.exec("BEGIN IMMEDIATE");
  const events = traceTransactions(t, f.db);
  const error = captureError(() =>
    target.setSessionTarget(f.db, {
      sessionID: f.sessionID,
      objective: "Partial borrowed",
      status: "active",
    }),
  );
  assert.ok(error instanceof Error);
  assert.equal(error.message, "target touch native failure");
  assert.equal(f.db.isTransaction, true);
  assert.equal(
    target.readSessionTarget(f.db, { sessionID: f.sessionID })?.objective,
    "Partial borrowed",
  );
  assert.deepEqual(events, []);
  f.db.exec("ROLLBACK");
  assert.deepEqual(rawState(f.db), before);
});

test("read, zero usage and inapplicable finish/recover early returns open no transaction", async (t) => {
  const f = await fixture(t);
  const events = traceTransactions(t, f.db);
  const time = clock(t, [444]);
  assert.equal(target.readSessionTarget(f.db, { sessionID: f.sessionID }), null);
  assert.equal(
    target.accountSessionTargetUsage(f.db, { sessionID: f.sessionID, targetID: "missing" }),
    null,
  );
  assert.equal(
    target.finishSessionTargetRun(f.db, {
      sessionID: f.sessionID,
      targetID: "missing",
      inputID: "missing",
      endedAtMs: -1,
    }),
    null,
  );
  assert.equal(target.recoverInterruptedSessionTargetRun(f.db, { sessionID: f.sessionID }), null);
  assert.equal(time.calls(), 1);
  assert.deepEqual(events, []);
});

test("native foreign key and CHECK errors precede touch and retain SQLite fields", async (t) => {
  const f = await fixture(t);
  touchTrigger(f.db);
  for (const [sessionID, status, expected] of [
    ["absent", "active", 787],
    ["owner", "bogus", 275],
  ] as const) {
    const error = captureError(() =>
      target.setSessionTarget(f.db, {
        sessionID: sessionID as SessionGoal["sessionID"],
        objective: "Invalid",
        status: status as "active",
      }),
    ) as Error & { code: string; errcode: number; errstr: string };
    assert.equal(error.name, "Error");
    assert.equal(error.code, "ERR_SQLITE_ERROR");
    assert.equal(error.errcode, expected);
    assert.equal(error.errstr, "constraint failed");
    assert.notEqual(error.message, "target touch native failure");
    assert.equal(Object.hasOwn(error, "cause"), false);
  }
  assert.equal(rawState(f.db).target.length, 0);
});

test("clock then UUID exceptions occur before the first database operation", async (t) => {
  const f = await fixture(t);
  const databaseCalls: string[] = [];
  const originalPrepare = f.db.prepare.bind(f.db);
  const originalExec = f.db.exec.bind(f.db);
  t.mock.method(f.db, "prepare", (sql: string) => {
    databaseCalls.push("prepare");
    return originalPrepare(sql);
  });
  t.mock.method(f.db, "exec", (sql: string) => {
    databaseCalls.push("exec");
    return originalExec(sql);
  });
  const first = { stage: "clock" };
  const second = { stage: "uuid" };
  const time = t.mock.method(Date, "now", () => {
    throw first;
  });
  assert.strictEqual(
    captureError(() =>
      target.createSessionTarget(f.db, { sessionID: f.sessionID, objective: "x" }),
    ),
    first,
  );
  assert.deepEqual(databaseCalls, [], "clock failure precedes prepare and exec");
  time.mock.restore();
  clock(t, [1000, 2000]);
  const random = t.mock.method(crypto, "randomUUID", () => {
    throw second;
  });
  syncBuiltinESMExports();
  t.after(() => {
    random.mock.restore();
    syncBuiltinESMExports();
  });
  assert.strictEqual(
    captureError(() =>
      target.setSessionTarget(f.db, { sessionID: f.sessionID, objective: "x", status: "active" }),
    ),
    second,
  );
  assert.deepEqual(databaseCalls, [], "UUID failure precedes prepare and exec");
  assert.equal(rawState(f.db).target.length, 0);
});

test("set and clone conflicts UPDATE the existing row instead of deleting and reinserting", async (t) => {
  const f = await fixture(t);
  const source = seedTarget(f);
  f.db.exec(`CREATE TABLE write_events(kind TEXT);
    CREATE TRIGGER target_insert AFTER INSERT ON session_target BEGIN INSERT INTO write_events VALUES('insert'); END;
    CREATE TRIGGER target_update AFTER UPDATE ON session_target BEGIN INSERT INTO write_events VALUES('update'); END;
    CREATE TRIGGER target_delete AFTER DELETE ON session_target BEGIN INSERT INTO write_events VALUES('delete'); END;`);
  target.setSessionTarget(f.db, {
    sessionID: f.sessionID,
    objective: "Replacement",
    status: "paused",
  });
  target.cloneSessionTargetForFork(f.db, { sessionID: f.sessionID, source, status: "complete" });
  assert.deepEqual(
    f.db
      .prepare("SELECT kind FROM write_events ORDER BY rowid")
      .all()
      .map((row) => row.kind),
    ["update", "update"],
  );
});

test("touch with zero session rows adds no new missing-session error", async (t) => {
  const f = await fixture(t);
  seedTarget(f);
  f.db.exec("PRAGMA foreign_keys=OFF");
  f.db.prepare("DELETE FROM session WHERE id=?").run("owner");
  const result = target.updateSessionTargetSummaryTitle(f.db, {
    sessionID: f.sessionID,
    targetID: "goal",
    summaryTitle: "Orphan history",
  });
  assert.equal(result?.summaryTitle, "Orphan history");
  assert.equal(rawState(f.db).session.length, 0);
});
