// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  child,
  compoundFixture,
  metadata,
  nativeFailure,
  operations,
  other,
  parent,
  session,
  shared,
  sid,
} from "./session-store-facade.fixture.js";

for (const operation of operations) {
  test(`${operation} native automatic rollback preserves the exact first SQLite error`, async (t) => {
    const f = await compoundFixture(t, operation);
    const before = f.snapshot();
    const fault = nativeFailure(f, t, operation, "ROLLBACK");
    let actual: unknown;
    try {
      await f.invoke();
      assert.fail("operation should reject");
    } catch (error) {
      actual = error;
    }
    assert.equal(fault.hits, 1);
    assert.equal(fault.captured.length, 1);
    assert.deepEqual(f.snapshot(), before);
    assert.equal(f.db.isTransaction, false);
    const primary = fault.captured[0];
    assert.ok(primary instanceof Error);
    assert.equal(primary.message, "facade synthetic business failure");
    assert.equal(Reflect.get(primary, "errcode"), 1811);
    assert.strictEqual(actual, primary);
  });
}

for (const operation of operations) {
  test(`${operation} failed rollback preserves both exact errors and owns cause`, async (t) => {
    const f = await compoundFixture(t, operation);
    const fault = nativeFailure(f, t, operation, "ABORT");
    const cleanup = new Error("facade synthetic cleanup failure");
    t.mock.method(f.db, "exec", (sql: string) => {
      if (/^\s*rollback\s*;?\s*$/i.test(sql)) throw cleanup;
      return f.nativeExec(sql);
    });
    let actual: unknown;
    try {
      await f.invoke();
      assert.fail("operation should reject");
    } catch (error) {
      actual = error;
    }
    assert.equal(fault.hits, 1);
    assert.equal(fault.captured.length, 1);
    assert.equal(f.db.isTransaction, true);
    assert.ok(actual instanceof AggregateError);
    assert.equal(actual.message, "Session storage write failed and rollback failed");
    assert.equal(Object.hasOwn(actual, "cause"), true);
    assert.strictEqual(actual.cause, fault.captured[0]);
    assert.equal(Object.getOwnPropertyDescriptor(actual, "cause")?.enumerable, false);
    assert.deepEqual(actual.errors, [fault.captured[0], cleanup]);
    assert.strictEqual(actual.errors[0], fault.captured[0]);
    assert.strictEqual(actual.errors[1], cleanup);
  });
}

for (const operation of ["fork", "import", "transition"] as const) {
  test(`${operation} unrelated same-turn successful write is not rolled back with compound failure`, async (t) => {
    const f = await compoundFixture(t, operation);
    const fault = nativeFailure(f, t, operation, "ABORT");
    const primary = f.invoke();
    const otherWrite = f.store.saveSessionEntry({
      id: "unrelated",
      sessionID: other,
      type: "fixture/independent",
      time: { created: 8, updated: 8 },
      data: { retained: true },
    });
    const [first, second] = await Promise.allSettled([primary, otherWrite]);
    assert.equal(fault.hits, 1);
    assert.equal(first.status, "rejected");
    assert.equal(second.status, "fulfilled");
    assert.equal(f.db.isTransaction, false);
    const records = await f.store.sessionEntries({ sessionID: other });
    assert.deepEqual(
      records.map((row) => row.id),
      ["unrelated"],
    );
    assert.deepEqual(records[0]!.data, { retained: true });
  });
}

test("same-turn compound operations each finish their owned transaction without nested BEGIN rejection", async (t) => {
  const f = await compoundFixture(t, "import");
  const first = f.store.commitSharedContextImportBundle(shared());
  const secondId = sid("same-turn-second");
  const second = f.store.createForkedSessionWithMetadata(
    session(secondId, parent),
    metadata(parent, "second-command"),
  );
  const outcomes = await Promise.allSettled([first, second]);
  assert.deepEqual(
    outcomes.map((outcome) => outcome.status),
    ["fulfilled", "fulfilled"],
  );
  assert.ok(await f.store.getSession(child));
  assert.ok(await f.store.getSession(secondId));
  assert.equal(f.db.isTransaction, false);
});
