// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { target } from "./session-target-test-api.js";
import { fixture, seedTarget, clock, uuid, rawState } from "./session-target.fixture.js";

type Fixture = Awaited<ReturnType<typeof fixture>>;
const UUID = "00000000-0000-4000-8000-000000000001";
function read(f: Fixture) {
  const value = target.readSessionTarget(f.db, { sessionID: f.sessionID });
  assert.ok(value);
  return value;
}
function sessionTime(f: Fixture, id = f.sessionID): number {
  const row = f.db.prepare("SELECT time_updated FROM session WHERE id = ?").get(id);
  assert.ok(row);
  assert.equal(typeof row.time_updated, "number");
  return Number(row.time_updated);
}
function changeTitleOnTouch(f: Fixture) {
  f.db.exec(`CREATE TRIGGER observe_touch AFTER UPDATE OF time_updated ON session
    WHEN NEW.id = 'owner' BEGIN
      UPDATE session_target SET summary_title = 'after-touch' WHERE session_id = NEW.id;
    END;`);
}

test("read missing target returns null without time, UUID or row changes", async (t) => {
  const f = await fixture(t);
  const before = rawState(f.db),
    time = clock(t, 9000),
    ids = uuid(t, UUID);
  assert.equal(target.readSessionTarget(f.db, { sessionID: f.sessionID }), null);
  assert.deepEqual(rawState(f.db), before);
  assert.equal(f.db.isTransaction, false);
  assert.equal(time.calls(), 0);
  assert.equal(ids.calls(), 0);
});

test("read projects ordered own fields and preserves nullable and legacy SQLite values", async (t) => {
  const f = await fixture(t);
  seedTarget(f, { summaryTitle: null });
  f.db.exec("UPDATE session_target SET token_budget = 'legacy-budget', objective = '  raw  '");
  const value = read(f);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.deepEqual(Object.keys(value), [
    "sessionID",
    "targetID",
    "objective",
    "summaryTitle",
    "status",
    "tokenBudget",
    "tokensUsed",
    "timeUsedSeconds",
    "activeInputId",
    "activeRunStartedAtMs",
    "activeRunLastSeenAtMs",
    "time",
  ]);
  assert.deepEqual(Object.keys(value.time), ["created", "updated"]);
  assert.equal(Object.getPrototypeOf(value.time), Object.prototype);
  for (const key of [
    "summaryTitle",
    "activeInputId",
    "activeRunStartedAtMs",
    "activeRunLastSeenAtMs",
  ] as const) {
    assert.equal(Object.hasOwn(value, key), true);
    assert.equal(value[key], null);
  }
  assert.equal(value.tokenBudget, "legacy-budget");
  assert.equal(value.objective, "  raw  ");
  assert.deepEqual(value.time, { created: 1000, updated: 2000 });
});

test("set replaces identity, history and active run using two clocks and one UUID", async (t) => {
  const f = await fixture(t);
  seedTarget(f, {
    summaryTitle: "old",
    tokenBudget: 40,
    activeInputId: "old-input",
    activeRunStartedAtMs: 1200,
    activeRunLastSeenAtMs: 1700,
  });
  const priorSessionTime = sessionTime(f),
    time = clock(t, [9000, 12345]),
    ids = uuid(t, UUID);
  const value = target.setSessionTarget(f.db, {
    sessionID: f.sessionID,
    objective: "  replacement  ",
    status: "paused",
  });
  assert.deepEqual(value, {
    sessionID: f.sessionID,
    targetID: `target_${(12345).toString(36)}_${UUID}`,
    objective: "  replacement  ",
    summaryTitle: null,
    status: "paused",
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    activeInputId: null,
    activeRunStartedAtMs: null,
    activeRunLastSeenAtMs: null,
    time: { created: 9000, updated: 9000 },
  });
  assert.deepEqual(read(f), value);
  assert.equal(rawState(f.db).target.length, 1);
  assert.equal(sessionTime(f), Math.max(priorSessionTime, 9000));
  assert.equal(time.calls(), 2);
  assert.equal(ids.calls(), 1);
});

test("clone preserves source identity and times across sessions while clearing only the child run", async (t) => {
  const f = await fixture(t);
  seedTarget(f, {
    summaryTitle: "source",
    tokenBudget: 50,
    activeInputId: "source-run",
    activeRunStartedAtMs: 1100,
    activeRunLastSeenAtMs: 1900,
  });
  const childID = "child" as typeof f.sessionID;
  await f.store.createSession({
    id: childID,
    projectID: "fixture" as Parameters<typeof f.store.createSession>[0]["projectID"],
    slug: "child",
    directory: "/synthetic",
    title: "child",
    version: "fixture",
    time: { created: 10, updated: 20 },
  });
  const source = read(f),
    beforeOwner = sessionTime(f),
    beforeChild = sessionTime(f, childID);
  const time = clock(t, 9000),
    ids = uuid(t, UUID);
  const copy = target.cloneSessionTargetForFork(f.db, {
    source,
    sessionID: childID,
    status: "complete",
  });
  assert.deepEqual(copy, {
    ...source,
    sessionID: childID,
    status: "complete",
    activeInputId: null,
    activeRunStartedAtMs: null,
    activeRunLastSeenAtMs: null,
  });
  assert.deepEqual(target.readSessionTarget(f.db, { sessionID: childID }), copy);
  assert.deepEqual(read(f), source);
  assert.equal(rawState(f.db).target.length, 2);
  assert.equal(sessionTime(f), beforeOwner);
  assert.equal(sessionTime(f, childID), Math.max(beforeChild, 9000));
  assert.equal(time.calls(), 1);
  assert.equal(ids.calls(), 0);
});

test("create returns its read before touch, with active defaults and generated identity", async (t) => {
  const f = await fixture(t);
  changeTitleOnTouch(f);
  const time = clock(t, [9000, 9001]),
    ids = uuid(t, UUID);
  const value = target.createSessionTarget(f.db, { sessionID: f.sessionID, objective: "created" });
  assert.ok(value);
  assert.equal(value.targetID, `target_${(9001).toString(36)}_${UUID}`);
  assert.equal(value.status, "active");
  assert.equal(value.tokenBudget, null);
  assert.equal(value.tokensUsed, 0);
  assert.equal(value.timeUsedSeconds, 0);
  assert.deepEqual(value.time, { created: 9000, updated: 9000 });
  assert.equal(value.summaryTitle, null);
  assert.deepEqual(read(f), { ...value, summaryTitle: "after-touch" });
  assert.equal(time.calls(), 2);
  assert.equal(ids.calls(), 1);
});

test("create existing different identity consumes time and UUID but returns null without touch", async (t) => {
  const f = await fixture(t);
  seedTarget(f);
  changeTitleOnTouch(f);
  const before = rawState(f.db),
    time = clock(t, [9000, 9001]),
    ids = uuid(t, UUID);
  assert.equal(
    target.createSessionTarget(f.db, { sessionID: f.sessionID, objective: "ignored" }),
    null,
  );
  assert.deepEqual(rawState(f.db), before);
  assert.equal(time.calls(), 2);
  assert.equal(ids.calls(), 1);
});

test("create same generated identity returns the old row and touches despite INSERT being ignored", async (t) => {
  const f = await fixture(t);
  seedTarget(f, {
    targetID: `target_${(9001).toString(36)}_${UUID}`,
    status: "complete",
    summaryTitle: "before-touch",
  });
  const before = read(f),
    priorSessionTime = sessionTime(f);
  changeTitleOnTouch(f);
  const time = clock(t, [9000, 9001]),
    ids = uuid(t, UUID);
  const value = target.createSessionTarget(f.db, {
    sessionID: f.sessionID,
    objective: "ignored",
    tokenBudget: 99,
  });
  assert.deepEqual(value, before);
  assert.deepEqual(read(f), { ...before, summaryTitle: "after-touch" });
  assert.equal(sessionTime(f), Math.max(priorSessionTime, 9000));
  assert.equal(time.calls(), 2);
  assert.equal(ids.calls(), 1);
});

test("status update preserves active fields and permits target time rollback without session rollback", async (t) => {
  const f = await fixture(t);
  seedTarget(f, { activeInputId: "run", activeRunStartedAtMs: 1200, activeRunLastSeenAtMs: 1800 });
  const before = read(f),
    priorSessionTime = sessionTime(f),
    time = clock(t, 500);
  const value = target.updateSessionTargetStatus(f.db, {
    sessionID: f.sessionID,
    status: "paused",
  });
  assert.deepEqual(value, { ...before, status: "paused", time: { created: 1000, updated: 500 } });
  assert.deepEqual(read(f), value);
  assert.equal(sessionTime(f), Math.max(priorSessionTime, 500));
  assert.equal(time.calls(), 1);
});

test("status update on missing target reads clock once and does not touch session", async (t) => {
  const f = await fixture(t);
  const before = rawState(f.db),
    time = clock(t, 9000);
  assert.equal(
    target.updateSessionTargetStatus(f.db, { sessionID: f.sessionID, status: "complete" }),
    null,
  );
  assert.deepEqual(rawState(f.db), before);
  assert.equal(time.calls(), 1);
});

test("old async title is rejected while matching title preserves raw text and active run", async (t) => {
  const f = await fixture(t);
  seedTarget(f, { activeInputId: "run", activeRunStartedAtMs: 1200, activeRunLastSeenAtMs: 1800 });
  const before = read(f),
    beforeRows = rawState(f.db),
    priorSessionTime = sessionTime(f);
  const time = clock(t, [500, 600]);
  assert.deepEqual(
    target.updateSessionTargetSummaryTitle(f.db, {
      sessionID: f.sessionID,
      targetID: "superseded-goal",
      summaryTitle: "wrong",
    }),
    before,
  );
  assert.deepEqual(rawState(f.db), beforeRows);
  const value = target.updateSessionTargetSummaryTitle(f.db, {
    sessionID: f.sessionID,
    targetID: before.targetID,
    summaryTitle: "  retained title  ",
  });
  assert.deepEqual(value, {
    ...before,
    summaryTitle: "  retained title  ",
    time: { created: 1000, updated: 600 },
  });
  assert.deepEqual(read(f), value);
  assert.equal(sessionTime(f), Math.max(priorSessionTime, 600));
  assert.equal(time.calls(), 2);
});

test("clear touches only the successful deletion and still clocks the missing deletion", async (t) => {
  const f = await fixture(t);
  seedTarget(f);
  const priorSessionTime = sessionTime(f),
    time = clock(t, [5000, 6000]);
  assert.equal(target.clearSessionTarget(f.db, { sessionID: f.sessionID }), true);
  assert.equal(target.readSessionTarget(f.db, { sessionID: f.sessionID }), null);
  assert.equal(sessionTime(f), Math.max(priorSessionTime, 5000));
  const after = rawState(f.db);
  assert.equal(target.clearSessionTarget(f.db, { sessionID: f.sessionID }), false);
  assert.deepEqual(rawState(f.db), after);
  assert.equal(time.calls(), 2);
});

test("account zero-clamped deltas return current even for stale target ID without writes", async (t) => {
  const f = await fixture(t);
  seedTarget(f);
  const before = read(f),
    beforeRows = rawState(f.db),
    time = clock(t, 9000);
  assert.deepEqual(
    target.accountSessionTargetUsage(f.db, {
      sessionID: f.sessionID,
      targetID: "stale",
      tokensUsedDelta: -4,
      timeUsedSecondsDelta: 0,
    }),
    before,
  );
  assert.deepEqual(rawState(f.db), beforeRows);
  assert.equal(time.calls(), 1);
});

test("account retains SQLite numeric affinity instead of JS concatenation or integer coercion", async (t) => {
  const f = await fixture(t);
  seedTarget(f, { activeInputId: "run", activeRunStartedAtMs: 1200, activeRunLastSeenAtMs: 1800 });
  f.db.exec(
    "UPDATE session_target SET tokens_used = 'legacy', time_used_seconds = '3.25', token_budget = '6'",
  );
  const time = clock(t, 9000);
  const value = target.accountSessionTargetUsage(f.db, {
    sessionID: f.sessionID,
    targetID: "goal",
    tokensUsedDelta: 2.5,
    timeUsedSecondsDelta: 1.25,
  });
  assert.ok(value);
  assert.equal(value.tokensUsed, 2.5);
  assert.equal(value.timeUsedSeconds, 4.5);
  assert.equal(value.status, "active");
  assert.equal(value.activeInputId, "run");
  assert.deepEqual(read(f), value);
  const storage = f.db
    .prepare(
      "SELECT typeof(tokens_used) AS tokens, typeof(time_used_seconds) AS seconds FROM session_target",
    )
    .get();
  assert.equal(storage?.tokens, "real");
  assert.equal(storage?.seconds, "real");
  assert.equal(time.calls(), 1);
});

test("set does not impose tool schema trimming or positive-budget validation", async (t) => {
  const f = await fixture(t);
  const time = clock(t, [5000, 5001]),
    ids = uuid(t, UUID);
  const value = target.setSessionTarget(f.db, {
    sessionID: f.sessionID,
    objective: " \n ",
    tokenBudget: -3,
    status: "complete",
  });
  assert.equal(value.objective, " \n ");
  assert.equal(value.tokenBudget, -3);
  assert.equal(value.status, "complete");
  assert.deepEqual(read(f), value);
  assert.equal(time.calls(), 2);
  assert.equal(ids.calls(), 1);
});
