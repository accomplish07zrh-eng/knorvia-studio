// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { constants } from "node:sqlite";
import type { SessionId } from "@knorvia/contracts";
import { admission, inputFixture, now, otherSession, session } from "./session-input-fixture.js";

test("input admission allocates per-session sequence without touching session activity", async (t) => {
  const f = await inputFixture(t);
  const sessions = f.rows("session");
  assert.deepEqual(await f.store.listSessionInputs({ sessionID: session }), []);
  assert.equal(await f.store.getSessionInputById("missing"), null);
  await f.add();
  await f.add({ id: "second", delivery: "startNow" });
  await f.add({ id: "other", sessionID: otherSession, delivery: "guide" });
  const first = await f.store.getSessionInputById("input");
  assert.deepEqual(first, {
    id: "input",
    sessionID: session,
    kind: "sendText",
    delivery: "queue",
    payload: { text: "first" },
    admittedSequence: 0,
    status: "admitted",
    time: { created: now, updated: now },
  });
  assert.equal(Object.getPrototypeOf(first), Object.prototype);
  assert.equal(Object.getPrototypeOf(first?.payload), Object.prototype);
  assert.deepEqual(Object.keys(first!), [
    "id",
    "sessionID",
    "kind",
    "delivery",
    "payload",
    "admittedSequence",
    "status",
    "time",
  ]);
  assert.deepEqual(
    (await f.store.listSessionInputs({ sessionID: session })).map((x) => x.admittedSequence),
    [0, 1],
  );
  assert.equal((await f.store.getSessionInputById("other"))?.admittedSequence, 0);
  assert.deepEqual(f.rows("session"), sessions);
});

test("same global input ID corrects payload but retains terminal status, owner and creation identity", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.store.settleSessionInput({
    id: "input",
    sessionID: session,
    status: "cancelled",
    reason: "removed",
  });
  const rowid = f.rows("session_input")[0].rowid;
  t.mock.method(Date, "now", () => 140);
  await f.add({
    sessionID: otherSession,
    kind: "retry",
    delivery: "guide",
    payload: { extra: 9, text: "corrected" },
  });
  const entry = await f.store.getSessionInputById("input");
  assert.deepEqual(entry, {
    id: "input",
    sessionID: session,
    kind: "retry",
    delivery: "guide",
    payload: { text: "corrected", extra: 9 },
    admittedSequence: 0,
    status: "cancelled",
    statusReason: "removed",
    time: { created: now, updated: 140 },
  });
  assert.equal(f.rows("session_input")[0].rowid, rowid);
  await f.add({ id: "next" });
  assert.equal((await f.store.getSessionInputById("next"))?.admittedSequence, 1);
  assert.deepEqual(await f.store.listSessionInputs({ sessionID: otherSession }), []);
  assert.deepEqual(
    (await f.store.listSessionInputs({ sessionID: session, status: "cancelled" })).map((x) => x.id),
    ["input"],
  );
});

test("single-statement admission borrows outer ownership and completes before its Promise is awaited", async (t) => {
  const f = await inputFixture(t);
  f.db.exec("BEGIN IMMEDIATE");
  const promise = f.add();
  assert.ok(promise instanceof Promise);
  assert.equal(f.rows("session_input").length, 1);
  await promise;
  assert.equal(f.db.isTransaction, true);
  f.db.exec("ROLLBACK");
  assert.deepEqual(f.rows("session_input"), []);
});

test("input JSON uses native encoding and nullish fallback while preserving prepare-before-encode priority", async (t) => {
  const f = await inputFixture(t);
  await f.add({ payload: null as never });
  assert.equal(f.rows("session_input")[0].payload, "{}");
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const before = f.snapshot();
  await assert.rejects(f.add({ payload: cycle as never }), TypeError);
  assert.deepEqual(f.snapshot(), before);
  let encoded = false;
  f.db.setAuthorizer((action, table) =>
    action === constants.SQLITE_INSERT && table === "session_input"
      ? constants.SQLITE_DENY
      : constants.SQLITE_OK,
  );
  await assert.rejects(
    f.add({
      payload: {
        text: "x",
        toJSON() {
          encoded = true;
          throw new Error("encoding must wait");
        },
      },
    }),
    /not authorized/i,
  );
  f.db.setAuthorizer(null);
  assert.equal(encoded, false);
  await assert.rejects(
    f.add({ id: "invalid-parent", sessionID: "missing" as SessionId }),
    /FOREIGN KEY/,
  );
  await assert.rejects(f.add({ id: "invalid-delivery", delivery: "invalid" as never }), /CHECK/);
  assert.deepEqual(f.snapshot(), before);
});

test("input readers tolerate legacy payload shapes without repairing cells or losing unknown keys", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  for (const [raw, expected] of [
    ["{", { text: "" }],
    ["null", { text: "" }],
    ["[]", { text: "" }],
    ["123", { text: "" }],
    ['{"x":1}', { text: "", x: 1 }],
    ['{"text":null,"x":2}', { text: null, x: 2 }],
    [
      '{"__proto__":{"custom":1},"text":"kept"}',
      JSON.parse('{"text":"kept","__proto__":{"custom":1}}'),
    ],
  ] as const) {
    f.db.prepare("UPDATE session_input SET payload=? WHERE id='input'").run(raw);
    const value = (await f.store.getSessionInputById("input"))!.payload;
    assert.deepEqual(value, expected);
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    assert.equal(f.rows("session_input")[0].payload, raw);
    value.text = "mutated reader";
    assert.deepEqual((await f.store.getSessionInputById("input"))?.payload, expected);
  }
});

test("input row projection retains empty optional values and legacy invalid status/delivery fallbacks", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  f.db.exec(
    "PRAGMA ignore_check_constraints=ON; UPDATE session_input SET delivery='legacy',status='legacy',promoted_sequence=0,promoted_message_id='',status_reason=''; PRAGMA ignore_check_constraints=OFF",
  );
  const value = (await f.store.getSessionInputById("input"))!;
  assert.equal(value.delivery, "queue");
  assert.equal(value.status, "admitted");
  assert.equal(value.promotedSequence, 0);
  assert.equal(value.promotedMessageID, "");
  assert.equal(value.statusReason, "");
  assert.deepEqual(Object.keys(value), [
    "id",
    "sessionID",
    "kind",
    "delivery",
    "payload",
    "admittedSequence",
    "promotedSequence",
    "promotedMessageID",
    "status",
    "statusReason",
    "time",
  ]);
  const before = f.snapshot();
  t.mock.method(Date, "now", () => {
    throw new Error("read must not use clock");
  });
  t.mock.method(f.db, "exec", () => {
    throw new Error("read must not control transactions");
  });
  assert.deepEqual(await f.store.listSessionInputs({ sessionID: session, status: "" as never }), [
    value,
  ]);
  assert.deepEqual(await f.store.listSessionInputs({ sessionID: otherSession }), []);
  assert.deepEqual(f.snapshot(), before);
});

test("facade guard still rejects ledger mutation before it reaches the repository", async (t) => {
  const f = await inputFixture(t);
  const failure = new Error("fixture write guard");
  t.mock.method(f.store as unknown as { throwBeforeWrite(): void }, "throwBeforeWrite", () => {
    throw failure;
  });
  await assert.rejects(f.store.saveSessionInput(admission()), (error) => error === failure);
  await assert.rejects(
    f.store.updateSessionInputs({ sessionID: session, updates: [] }),
    (error) => error === failure,
  );
  assert.deepEqual(f.rows("session_input"), []);
  assert.equal(await f.store.getSessionInputById("input"), null);
});
