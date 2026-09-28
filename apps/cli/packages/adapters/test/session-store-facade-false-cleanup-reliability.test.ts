// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { fixture, transition } from "./session-store-facade.fixture.js";

test("false transition cleanup failure is exposed after one cleanup attempt, never retried or converted to false", async (t) => {
  const f = await fixture(t);
  const cleanup = new Error("false transition cleanup sentinel");
  let rollbackAttempts = 0;
  t.mock.method(f.db, "exec", (sql: string) => {
    if (/^\s*rollback\s*;?\s*$/i.test(sql)) {
      rollbackAttempts += 1;
      throw cleanup;
    }
    return f.nativeExec(sql);
  });
  const [outcome] = await Promise.allSettled([f.store.transitionSharedContextImport(transition())]);
  assert.equal(outcome!.status, "rejected");
  t.diagnostic(
    `rollbackAttempts=${rollbackAttempts}; exactCleanup=${outcome!.status === "rejected" && outcome!.reason === cleanup}; transaction=${f.db.isTransaction}`,
  );
  assert.equal(rollbackAttempts, 1);
  if (outcome!.status !== "rejected") assert.fail("expected cleanup rejection");
  // The approved private control-flow marker has no public identity; cleanup must remain reachable.
  const failure: unknown = outcome!.reason;
  assert.ok(failure instanceof AggregateError);
  assert.equal(failure.errors.length, 2);
  assert.strictEqual(failure.errors[1], cleanup);
  assert.equal(Object.hasOwn(failure, "cause"), true);
  assert.strictEqual(failure.cause, failure.errors[0]);
});
