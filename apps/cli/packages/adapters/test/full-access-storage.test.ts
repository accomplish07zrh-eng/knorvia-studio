// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { fullAccessFixture, otherSession, ownerSession } from "./full-access-fixture.js";

test("full access commits only its fixed queue and both entries, preserving unrelated fields", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: 1000 });
  const f = await fullAccessFixture(t),
    later = f.queue("later");
  await f.commit();
  assert.equal(f.db.isTransaction, false);
  for (const id of f.input.queueItemIds) {
    assert.deepEqual(f.data(id), {
      ...f.payload,
      intent: { ...f.payload.intent, mode: "yolo" },
      conversationInputIntent: { ...f.payload.conversationInputIntent, mode: "yolo" },
    });
    assert.equal(f.queue(id)?.time_updated, 1000);
    assert.equal(f.queue(id)?.status, "admitted");
  }
  assert.deepEqual(f.queue("later"), later);
  assert.equal(f.snapshot().entries.length, 2);
  assert.equal((await f.store.getSession(ownerSession))?.time.updated, 30);
  assert.equal((await f.store.getSession(otherSession))?.time.updated, 11);
});

test("an existing receipt makes retries idempotent without inspecting newly selected queue items", async (t) => {
  const f = await fullAccessFixture(t);
  await f.commit();
  const before = f.snapshot();
  f.input.queueItemIds = ["later", "unavailable"];
  f.input.execution.data = { mode: "changed on retry" };
  await f.commit();
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("a receipt belonging to another session rejects and keeps every row", async (t) => {
  const f = await fullAccessFixture(t);
  await f.store.saveSessionEntry({ ...f.input.receipt, sessionID: otherSession });
  const before = f.snapshot();
  await assert.rejects(f.commit(), /receipt session mismatch/i);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

for (const key of ["execution", "receipt"] as const)
  test(`a ${key} session mismatch fails before opening a transaction`, async (t) => {
    const f = await fullAccessFixture(t);
    f.input[key].sessionID = otherSession;
    const before = f.snapshot();
    const exec = t.mock.method(f.db, "exec", () => {
      throw new Error("transaction must not start");
    });
    await assert.rejects(f.commit(), /commit session mismatch/i);
    assert.equal(exec.mock.callCount(), 0);
    exec.mock.restore();
    assert.deepEqual(f.snapshot(), before);
  });

test("entry cancellation takes priority over invalid scope and does not start a transaction", async (t) => {
  const f = await fullAccessFixture(t),
    reason = new Error("fixture cancellation");
  f.input.signal = AbortSignal.abort(reason);
  f.input.execution.sessionID = otherSession;
  const before = f.snapshot();
  await assert.rejects(f.commit(), (error) => error === reason);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("an existing transaction keeps ownership and its earlier writes", async (t) => {
  const f = await fullAccessFixture(t);
  const before = f.snapshot();
  f.db.exec("BEGIN IMMEDIATE");
  f.db.prepare("UPDATE session_input SET status='cancelled' WHERE id='later'").run();
  const pending = f.snapshot();
  await assert.rejects(f.commit(), /transaction/i);
  assert.equal(f.db.isTransaction, true);
  assert.deepEqual(f.snapshot(), pending);
  f.db.exec("ROLLBACK");
  assert.deepEqual(f.snapshot(), before);
});

test("only existing object intents change, including when selected IDs repeat", async (t) => {
  const f = await fullAccessFixture(t);
  const value = { text: "retained", intent: null, conversationInputIntent: [], mode: "build" };
  f.db.prepare("UPDATE session_input SET payload=? WHERE id='first'").run(JSON.stringify(value));
  f.input.queueItemIds = ["first", "first"];
  await f.commit();
  assert.deepEqual(f.data("first"), value);
  assert.deepEqual(f.data("second"), f.payload);
});

test("empty target queues still commit entries in execution then receipt order", async (t) => {
  const f = await fullAccessFixture(t),
    names: string[] = [];
  f.db.function("observe_entry", (value) => {
    names.push(String(value));
    return null;
  });
  f.db.exec(
    "CREATE TRIGGER observe_full_access AFTER INSERT ON session_entry BEGIN SELECT observe_entry(NEW.id); END",
  );
  f.input.queueItemIds = [];
  await f.commit();
  assert.deepEqual(names, ["execution", "receipt"]);
  assert.deepEqual(f.data("first"), f.payload);
});

test("queue writes preserve the original live session lookup after each read", async (t) => {
  const f = await fullAccessFixture(t);
  let reads = 0;
  Object.defineProperty(f.input, "sessionID", {
    get() {
      return ++reads === 4 ? otherSession : ownerSession;
    },
  });
  await f.commit();
  assert.equal(reads, 6);
  assert.deepEqual(f.data("first"), f.payload);
  assert.equal(f.data("second").intent.mode, "yolo");
});
