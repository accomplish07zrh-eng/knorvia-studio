// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { target } from "./session-target-test-api.js";
import { fixture, seedTarget, clock, uuid, rawState } from "./session-target.fixture.js";

type Fixture = Awaited<ReturnType<typeof fixture>>;
const UUID = "00000000-0000-4000-8000-000000000001";
const statuses = ["active", "paused", "budget_limited", "complete"] as const;
function read(f: Fixture) {
  const value = target.readSessionTarget(f.db, { sessionID: f.sessionID });
  assert.ok(value);
  return value;
}
function runIdentity(f: Fixture) {
  return { sessionID: f.sessionID, targetID: "goal", inputID: "run" };
}

test("active start replaces previous run, clamps negative start and never reads clock or UUID", async (t) => {
  const f = await fixture(t);
  seedTarget(f, {
    activeInputId: "previous",
    activeRunStartedAtMs: 800,
    activeRunLastSeenAtMs: 900,
  });
  const before = read(f),
    time = clock(t, 999999),
    ids = uuid(t, UUID);
  const value = target.startSessionTargetRun(f.db, { ...runIdentity(f), startedAtMs: -8 });
  assert.deepEqual(value, {
    ...before,
    activeInputId: "run",
    activeRunStartedAtMs: 0,
    activeRunLastSeenAtMs: 0,
  });
  assert.deepEqual(read(f), value);
  assert.equal(time.calls(), 0);
  assert.equal(ids.calls(), 0);
});

test("heartbeat advances a real run even after pause and never reduces lastSeen", async (t) => {
  const f = await fixture(t);
  seedTarget(f);
  const time = clock(t, 999999);
  target.startSessionTargetRun(f.db, { ...runIdentity(f), startedAtMs: 1200 });
  f.db.exec("UPDATE session_target SET status = 'paused', active_run_last_seen_at = NULL");
  const first = target.heartbeatSessionTargetRun(f.db, { ...runIdentity(f), seenAtMs: 2500 });
  assert.ok(first);
  assert.equal(first.status, "paused");
  assert.equal(first.activeRunStartedAtMs, 1200);
  assert.equal(first.activeRunLastSeenAtMs, 2500);
  assert.equal(first.time.updated, 2500);
  const after = rawState(f.db);
  assert.deepEqual(
    target.heartbeatSessionTargetRun(f.db, { ...runIdentity(f), seenAtMs: -10 }),
    first,
  );
  assert.deepEqual(rawState(f.db), after);
  assert.equal(time.calls(), 0);
});

test("stale goal or input cannot mutate a current run and absent owners return null", async (t) => {
  const f = await fixture(t);
  seedTarget(f, { activeInputId: "run", activeRunStartedAtMs: 1000, activeRunLastSeenAtMs: 1800 });
  const before = read(f),
    beforeRows = rawState(f.db),
    time = clock(t, 999999);
  assert.deepEqual(
    target.startSessionTargetRun(f.db, { ...runIdentity(f), targetID: "stale", startedAtMs: 5000 }),
    before,
  );
  assert.deepEqual(
    target.heartbeatSessionTargetRun(f.db, {
      ...runIdentity(f),
      inputID: "old-run",
      seenAtMs: 6000,
    }),
    before,
  );
  assert.deepEqual(
    target.finishSessionTargetRun(f.db, { ...runIdentity(f), targetID: "stale", endedAtMs: 7000 }),
    before,
  );
  assert.deepEqual(
    target.finishSessionTargetRun(f.db, { ...runIdentity(f), inputID: "old-run", endedAtMs: 7000 }),
    before,
  );
  const missing = "missing" as typeof f.sessionID;
  assert.equal(
    target.startSessionTargetRun(f.db, {
      ...runIdentity(f),
      sessionID: missing,
      startedAtMs: 5000,
    }),
    null,
  );
  assert.equal(
    target.finishSessionTargetRun(f.db, { ...runIdentity(f), sessionID: missing, endedAtMs: 7000 }),
    null,
  );
  assert.equal(target.recoverInterruptedSessionTargetRun(f.db, { sessionID: missing }), null);
  assert.deepEqual(rawState(f.db), beforeRows);
  assert.equal(time.calls(), 0);
});

test("recover charges only until lastSeen, pauses active state and is idempotent offline", async (t) => {
  const f = await fixture(t);
  seedTarget(f, { activeInputId: "run", activeRunStartedAtMs: 1000, activeRunLastSeenAtMs: 2501 });
  const time = clock(t, 999999999);
  const value = target.recoverInterruptedSessionTargetRun(f.db, { sessionID: f.sessionID });
  assert.ok(value);
  assert.equal(value.timeUsedSeconds, 5);
  assert.equal(value.tokensUsed, 2);
  assert.equal(value.status, "paused");
  assert.equal(value.time.updated, 2501);
  assert.equal(value.activeInputId, null);
  assert.equal(value.activeRunStartedAtMs, null);
  assert.equal(value.activeRunLastSeenAtMs, null);
  assert.deepEqual(read(f), value);
  const after = rawState(f.db);
  assert.deepEqual(
    target.recoverInterruptedSessionTargetRun(f.db, { sessionID: f.sessionID }),
    value,
  );
  assert.deepEqual(rawState(f.db), after);
  f.db.exec(
    "UPDATE session_target SET status = 'budget_limited', active_input_id = 'resumed', active_run_started_at = 4000, active_run_last_seen_at = NULL",
  );
  const noHeartbeat = target.recoverInterruptedSessionTargetRun(f.db, { sessionID: f.sessionID });
  assert.ok(noHeartbeat);
  assert.equal(noHeartbeat.status, "budget_limited");
  assert.equal(noHeartbeat.timeUsedSeconds, 5);
  assert.equal(noHeartbeat.time.updated, 4000);
  assert.deepEqual(read(f), noHeartbeat);
  assert.equal(time.calls(), 0);
});

test("empty input can heartbeat and finish but not recover; null input retains SQL null equality", async (t) => {
  const f = await fixture(t);
  seedTarget(f, {
    tokenBudget: null,
    activeInputId: "",
    activeRunStartedAtMs: 1000,
    activeRunLastSeenAtMs: 1600,
  });
  const before = read(f),
    beforeRows = rawState(f.db),
    time = clock(t, 999999);
  assert.deepEqual(
    target.recoverInterruptedSessionTargetRun(f.db, { sessionID: f.sessionID }),
    before,
  );
  assert.deepEqual(rawState(f.db), beforeRows);
  assert.equal(
    target.heartbeatSessionTargetRun(f.db, { ...runIdentity(f), inputID: "", seenAtMs: 2000 })
      ?.activeRunLastSeenAtMs,
    2000,
  );
  const finished = target.finishSessionTargetRun(f.db, {
    ...runIdentity(f),
    inputID: "",
    endedAtMs: 2501,
    tokensUsedDelta: 1,
  });
  assert.equal(finished?.timeUsedSeconds, 5);
  assert.equal(finished?.tokensUsed, 3);
  assert.equal(finished?.activeInputId, null);
  assert.equal(finished?.status, "active");
  assert.deepEqual(read(f), finished);
  f.db.exec(
    "UPDATE session_target SET active_input_id = NULL, active_run_started_at = 1000, active_run_last_seen_at = NULL",
  );
  const nullInput = read(f),
    nullRows = rawState(f.db),
    inputID = null as unknown as string;
  assert.deepEqual(
    target.heartbeatSessionTargetRun(f.db, { ...runIdentity(f), inputID, seenAtMs: 9000 }),
    nullInput,
  );
  assert.deepEqual(
    target.finishSessionTargetRun(f.db, { ...runIdentity(f), inputID, endedAtMs: 9000 }),
    nullInput,
  );
  assert.deepEqual(
    target.recoverInterruptedSessionTargetRun(f.db, { sessionID: f.sessionID }),
    nullInput,
  );
  assert.deepEqual(rawState(f.db), nullRows);
  assert.equal(time.calls(), 0);
});

test("finish clamps negative deltas and explicit status wins over exhausted active budget", async (t) => {
  const f = await fixture(t);
  seedTarget(f, {
    tokenBudget: 1,
    activeInputId: "run",
    activeRunStartedAtMs: 5000,
    activeRunLastSeenAtMs: 6000,
  });
  const time = clock(t, 999999);
  const value = target.finishSessionTargetRun(f.db, {
    ...runIdentity(f),
    endedAtMs: -8,
    tokensUsedDelta: -4,
    status: "complete",
  });
  assert.ok(value);
  assert.equal(value.status, "complete");
  assert.equal(value.tokensUsed, 2);
  assert.equal(value.timeUsedSeconds, 3);
  assert.equal(value.time.updated, 2000);
  assert.equal(value.activeInputId, null);
  assert.deepEqual(read(f), value);
  assert.equal(time.calls(), 0);
});

for (const status of statuses) {
  test(`finish ${status} run writes usage, applies budget boundary and cannot account twice`, async (t) => {
    const f = await fixture(t);
    seedTarget(f, {
      status,
      tokenBudget: 5,
      activeInputId: "run",
      activeRunStartedAtMs: 1000,
      activeRunLastSeenAtMs: 9000,
    });
    const before = read(f),
      time = clock(t, 999999);
    const value = target.finishSessionTargetRun(f.db, {
      ...runIdentity(f),
      endedAtMs: 2501,
      tokensUsedDelta: 3,
    });
    assert.deepEqual(value, {
      ...before,
      tokensUsed: 5,
      timeUsedSeconds: 5,
      status: status === "active" ? "budget_limited" : status,
      activeInputId: null,
      activeRunStartedAtMs: null,
      activeRunLastSeenAtMs: null,
      time: { created: 1000, updated: 2501 },
    });
    assert.deepEqual(read(f), value);
    const after = rawState(f.db);
    assert.deepEqual(
      target.finishSessionTargetRun(f.db, {
        ...runIdentity(f),
        endedAtMs: 99999,
        tokensUsedDelta: 99,
      }),
      value,
    );
    assert.deepEqual(rawState(f.db), after);
    assert.equal(time.calls(), 0);
  });
}

for (const status of statuses) {
  test(`account ${status} writes both deltas, applies budget and preserves active run on clock rollback`, async (t) => {
    const f = await fixture(t);
    seedTarget(f, {
      status,
      tokenBudget: 5,
      activeInputId: "run",
      activeRunStartedAtMs: 1200,
      activeRunLastSeenAtMs: 1800,
    });
    const before = read(f),
      previousSession = rawState(f.db).session;
    const time = clock(t, 300);
    const value = target.accountSessionTargetUsage(f.db, {
      sessionID: f.sessionID,
      targetID: "goal",
      tokensUsedDelta: 3,
      timeUsedSecondsDelta: 2,
    });
    assert.deepEqual(value, {
      ...before,
      tokensUsed: 5,
      timeUsedSeconds: 5,
      status: status === "active" ? "budget_limited" : status,
      time: { created: 1000, updated: 300 },
    });
    assert.deepEqual(read(f), value);
    const nowSession = rawState(f.db).session;
    assert.equal(nowSession.length, previousSession.length);
    assert.equal(
      nowSession[0]!.time_updated,
      Math.max(Number(previousSession[0]!.time_updated), 300),
    );
    assert.equal(time.calls(), 1);
  });
}

test("native finish binding treats NaN status like SQL null, without declaring invalid inputs supported", async (t) => {
  // Parent's independent old-source native observation; this is not a public validation guarantee.
  for (const [status, requested] of [
    ["active", Number.NaN],
    ["paused", Number.NaN],
    ["active", null],
  ] as const) {
    const f = await fixture(t);
    seedTarget(f, {
      status,
      tokenBudget: 10,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      activeInputId: "run",
      activeRunStartedAtMs: 5000,
      activeRunLastSeenAtMs: 5000,
    });
    const value = target.finishSessionTargetRun(f.db, {
      ...runIdentity(f),
      endedAtMs: 6001,
      tokensUsedDelta: 12,
      status: requested as unknown as typeof status,
    });
    assert.ok(value);
    assert.equal(value.status, status === "active" ? "budget_limited" : "paused");
    assert.equal(value.tokensUsed, 12);
    assert.equal(value.timeUsedSeconds, 2);
    assert.equal(value.activeInputId, null);
    assert.equal(value.activeRunStartedAtMs, null);
    assert.equal(value.activeRunLastSeenAtMs, null);
    assert.deepEqual(read(f), value);
  }
});
