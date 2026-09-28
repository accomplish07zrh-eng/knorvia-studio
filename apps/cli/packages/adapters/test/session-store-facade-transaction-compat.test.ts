// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { compoundFixture, operations } from "./session-store-facade.fixture.js";

for (const operation of operations) {
  test(`${operation} nested BEGIN preserves caller transaction and caller can commit`, async (t) => {
    const f = await compoundFixture(t, operation);
    const before = f.snapshot();
    f.nativeExec("CREATE TABLE caller_marker (id TEXT PRIMARY KEY)");
    f.nativeExec("BEGIN IMMEDIATE");
    f.nativeExec("INSERT INTO caller_marker VALUES ('kept')");
    await assert.rejects(f.invoke(), {
      code: "ERR_SQLITE_ERROR",
      errcode: 1,
      message: "cannot start a transaction within a transaction",
    });
    assert.equal(f.db.isTransaction, true);
    assert.ok(f.db.prepare("SELECT 1 FROM caller_marker").get());
    assert.deepEqual(f.snapshot(), before);
    f.nativeExec("COMMIT");
    assert.ok(f.db.prepare("SELECT 1 FROM caller_marker").get());
  });
}
