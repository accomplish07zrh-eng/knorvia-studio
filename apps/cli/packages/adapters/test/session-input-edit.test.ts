// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  inputFixture,
  inputs,
  intent,
  now,
  otherSession,
  session,
} from "./session-input-fixture.js";

test("ordered repeated input edits retain canonical unknown fields and explicit queue-position precedence", async (t) => {
  const f = await inputFixture(t);
  const payload = {
    text: "old",
    extra: { unchanged: true },
    conversationInputIntent: {
      custom: 1,
      text: "old",
      order: { admissionSeq: 7, extra: true },
      delivery: { unknown: "old" },
      steer: { state: "submitting" },
    },
    intent: { custom: 2, queuePosition: 4 },
  };
  await f.add({ payload });
  const original = structuredClone(payload);
  const updateIntent = intent({ queuePosition: 6, fallbackReasonCode: "busy" });
  let clocks = 0;
  t.mock.method(Date, "now", () => {
    clocks++;
    return 150;
  });
  await f.store.updateSessionInputs({
    sessionID: session,
    updates: [
      { id: "input", text: "new", delivery: "guide", queuePosition: 0, intent: updateIntent },
      { id: "input", text: "last" },
    ],
  });
  assert.equal(clocks, 1);
  const result = (await f.store.getSessionInputById("input"))!;
  assert.equal(result.delivery, "guide");
  assert.equal(result.admittedSequence, 0);
  assert.deepEqual(result.time, { created: now, updated: 150 });
  assert.deepEqual(result.payload, {
    text: "last",
    extra: { unchanged: true },
    conversationInputIntent: {
      custom: 1,
      text: "last",
      order: { admissionSeq: 7, extra: true, queuePosition: 0 },
      delivery: { requested: "guide", admitted: "queue", fallbackReasonCode: "busy" },
      steer: { state: "fellBack", reasonCode: "busy" },
    },
    intent: updateIntent,
  });
  assert.deepEqual(payload, original);
  assert.equal(f.rows("session")[0].time_updated, 2);
});

test("intent without fallback replaces canonical delivery but retains steer and uses its queue position", async (t) => {
  const f = await inputFixture(t);
  await f.add({
    payload: {
      text: "old",
      conversationInputIntent: {
        order: ["legacy"],
        delivery: { extra: 7 },
        steer: { state: "accepted", extra: 9 },
      },
    },
  });
  const updateIntent = intent({
    queuePosition: 3,
    requestedDelivery: "auto",
    admittedDelivery: "startNow",
    fallbackReasonCode: "",
  });
  await f.store.updateSessionInputs({
    sessionID: session,
    updates: [{ id: "input", intent: updateIntent }],
  });
  const value = (await f.store.getSessionInputById("input"))!;
  assert.equal(value.delivery, "queue");
  assert.deepEqual(value.payload.conversationInputIntent, {
    order: { queuePosition: 3 },
    delivery: { requested: "auto", admitted: "startNow" },
    steer: { state: "accepted", extra: 9 },
  });
  assert.deepEqual(value.payload.intent, updateIntent);
});

test("queue-only patches update an existing legacy intent but do not manufacture intent documents", async (t) => {
  const f = await inputFixture(t);
  for (const [id, members] of [
    ["object", { intent: { custom: 1, queuePosition: 7 }, conversationInputIntent: { custom: 2 } }],
    ["absent", {}],
    ["null", { intent: null, conversationInputIntent: null }],
    ["array", { intent: [], conversationInputIntent: [1] }],
    ["scalar", { intent: 4, conversationInputIntent: "old" }],
  ] as const)
    await f.add({ id, payload: { text: id, ...members } });
  await f.store.updateSessionInputs({
    sessionID: session,
    updates: ["object", "absent", "null", "array", "scalar"].map((id) => ({
      id,
      queuePosition: 0,
    })),
  });
  const values = await f.store.listSessionInputs({ sessionID: session });
  assert.deepEqual(values[0].payload, {
    text: "object",
    intent: { custom: 1, queuePosition: 0 },
    conversationInputIntent: { custom: 2, order: { queuePosition: 0 } },
  });
  assert.deepEqual(values[1].payload, { text: "absent" });
  assert.deepEqual(values[2].payload, {
    text: "null",
    intent: null,
    conversationInputIntent: null,
  });
  assert.deepEqual(values[3].payload, { text: "array", intent: [], conversationInputIntent: [1] });
  assert.deepEqual(values[4].payload, {
    text: "scalar",
    intent: 4,
    conversationInputIntent: "old",
  });
  assert.deepEqual(
    values.map((x) => x.admittedSequence),
    [0, 1, 2, 3, 4],
  );
});

test("delivery-only edit remains independent of intent and empty matched edit normalizes stored bad JSON", async (t) => {
  const f = await inputFixture(t);
  await f.add({
    payload: {
      text: "unchanged",
      conversationInputIntent: { delivery: { requested: "guide", admitted: "queue" } },
    },
  });
  await f.store.updateSessionInputs({
    sessionID: session,
    updates: [{ id: "input", delivery: "startNow" }],
  });
  const value = (await f.store.getSessionInputById("input"))!;
  assert.equal(value.delivery, "startNow");
  assert.deepEqual(value.payload.conversationInputIntent, {
    delivery: { requested: "guide", admitted: "queue" },
  });
  f.db.exec("UPDATE session_input SET payload='broken'");
  t.mock.method(Date, "now", () => 170);
  await f.store.updateSessionInputs({ sessionID: session, updates: [{ id: "input" }] });
  assert.equal(f.rows("session_input")[0].payload, '{"text":""}');
  assert.equal(f.rows("session_input")[0].time_updated, 170);
});

test("batch edit skips missing, terminal and other-session rows while sharing one time for admitted changes", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.add({ id: "second" });
  await f.add({ id: "terminal" });
  await f.add({ id: "other", sessionID: otherSession });
  await f.store.settleSessionInput({
    id: "terminal",
    sessionID: session,
    status: "failed",
    reason: "startup",
  });
  const before = f.rows("session_input");
  let clocks = 0;
  t.mock.method(Date, "now", () => {
    clocks++;
    return 180;
  });
  await f.store.updateSessionInputs({
    sessionID: session,
    updates: ["input", "second", "terminal", "other", "missing"].map((id) => ({
      id,
      text: "edited",
    })),
  });
  assert.equal(clocks, 1);
  assert.deepEqual(f.rows("session_input").slice(2), before.slice(2));
  assert.deepEqual(
    f
      .rows("session_input")
      .slice(0, 2)
      .map((x) => x.time_updated),
    [180, 180],
  );
  assert.deepEqual(
    (await f.store.listSessionInputs({ sessionID: session, status: "admitted" })).map((x) => x.id),
    ["input", "second"],
  );
});

test("empty edit preserves an outer transaction without time access but any nonempty edit still owns BEGIN", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  f.db.exec("BEGIN IMMEDIATE; UPDATE session_input SET kind='outer'");
  const before = f.snapshot();
  t.mock.method(Date, "now", () => {
    throw new Error("unexpected clock");
  });
  await inputs.updateSessionInputs(f.db, { sessionID: session, updates: [] });
  assert.equal(f.db.isTransaction, true);
  await assert.rejects(
    inputs.updateSessionInputs(f.db, { sessionID: session, updates: [{ id: "missing" }] }),
    /cannot start a transaction/,
  );
  assert.equal(f.db.isTransaction, true);
  assert.deepEqual(f.snapshot(), before);
  f.db.exec("ROLLBACK");
});

test("a later invalid edit rolls back prior rows and preserves native JSON and CHECK errors", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.add({ id: "second" });
  const before = f.snapshot();
  await assert.rejects(
    f.store.updateSessionInputs({
      sessionID: session,
      updates: [
        { id: "input", text: "would-change" },
        { id: "second", delivery: "invalid" as never },
      ],
    }),
    /CHECK/,
  );
  assert.deepEqual(f.snapshot(), before);
  const circular = intent();
  Object.assign(circular, { self: circular });
  await assert.rejects(
    f.store.updateSessionInputs({
      sessionID: session,
      updates: [{ id: "input", intent: circular }],
    }),
    TypeError,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});
