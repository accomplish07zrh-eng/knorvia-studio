// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { MessageId } from "@knorvia/contracts";
import { inputFixture, now, otherSession, session } from "./session-input-fixture.js";

test("marker only advances admitted ledger rows and never creates transcript or touches session", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.add({ id: "next" });
  const sessions = f.rows("session");
  await f.store.markSessionInputPromoted({
    id: "input",
    sessionID: otherSession,
    promotedMessageID: "ignored" as MessageId,
  });
  await f.store.markSessionInputPromoted({
    id: "missing",
    sessionID: session,
    promotedMessageID: "ignored" as MessageId,
  });
  await f.store.markSessionInputPromoted({
    id: "input",
    sessionID: session,
    promotedMessageID: "" as MessageId,
  });
  const row = await f.store.getSessionInputById("input");
  assert.equal(row?.status, "promoted");
  assert.equal(row?.promotedSequence, 0);
  assert.equal(row?.promotedMessageID, "");
  t.mock.method(Date, "now", () => 150);
  await f.store.markSessionInputPromoted({
    id: "input",
    sessionID: session,
    promotedMessageID: "replacement" as MessageId,
  });
  assert.deepEqual(await f.store.getSessionInputById("input"), row);
  await f.store.markSessionInputPromoted({
    id: "next",
    sessionID: session,
    promotedMessageID: "notice" as MessageId,
  });
  assert.equal((await f.store.getSessionInputById("next"))?.promotedSequence, 1);
  assert.deepEqual(f.rows("message"), []);
  assert.deepEqual(f.rows("part"), []);
  assert.deepEqual(f.rows("session"), sessions);
});

test("terminal settlement preserves empty reason, ignores late/cross-scope calls and permits all three terminal states", async (t) => {
  const f = await inputFixture(t);
  const sessions = f.rows("session");
  for (const status of ["cancelled", "discarded", "failed"] as const) {
    await f.add({ id: status });
    await f.store.settleSessionInput({
      id: status,
      sessionID: otherSession,
      status,
      reason: "wrong owner",
    });
    assert.equal((await f.store.getSessionInputById(status))?.status, "admitted");
    await f.store.settleSessionInput({ id: status, sessionID: session, status, reason: "" });
    const settled = await f.store.getSessionInputById(status);
    assert.equal(settled?.status, status);
    assert.equal(settled?.statusReason, "");
    await f.store.settleSessionInput({
      id: status,
      sessionID: session,
      status: "failed",
      reason: "late",
    });
    assert.deepEqual(await f.store.getSessionInputById(status), settled);
  }
  await f.add();
  await f.store.markSessionInputPromoted({
    id: "input",
    sessionID: session,
    promotedMessageID: "message" as MessageId,
  });
  const promoted = await f.store.getSessionInputById("input");
  await f.store.settleSessionInput({ id: "input", sessionID: session, status: "discarded" });
  assert.deepEqual(await f.store.getSessionInputById("input"), promoted);
  assert.deepEqual(f.rows("session"), sessions);
});

test("marker and settlement borrow an existing transaction, propagate constraints and use no fake transcript", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.add({ id: "terminal" });
  const before = f.snapshot();
  f.db.exec("BEGIN IMMEDIATE");
  await f.store.markSessionInputPromoted({
    id: "input",
    sessionID: session,
    promotedMessageID: "not-written" as MessageId,
  });
  await f.store.settleSessionInput({ id: "terminal", sessionID: session, status: "failed" });
  assert.equal(f.db.isTransaction, true);
  assert.equal((await f.store.getSessionInputById("terminal"))?.statusReason, undefined);
  assert.equal((await f.store.getSessionInputById("terminal"))?.time.updated, now);
  f.db.exec("ROLLBACK");
  assert.deepEqual(f.snapshot(), before);
  await assert.rejects(
    f.store.settleSessionInput({ id: "input", sessionID: session, status: "invalid" as never }),
    /CHECK/,
  );
  assert.deepEqual(f.snapshot(), before);
});
