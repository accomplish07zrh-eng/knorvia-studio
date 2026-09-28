// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inputFixture,
  message,
  now,
  otherSession,
  part,
  session,
} from "./session-input-fixture.js";

// Compatibility cases: these must pass on the unchanged pre-replacement source.
// Automatic rollback and same-turn transaction leakage have separate red-first tests.
test("promotion commits ordered transcript, original metadata and session touch before resolving", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.store.saveMessage(message("earlier-message"));
  const metadata = {
    inputIntent: { sourceCommandId: "cause", extension: { retained: true } },
    custom: [1, "two"],
  };
  await f.promote("input", message("input-message", metadata), [part("z-part"), part("a-part")]);

  assert.equal(f.db.isTransaction, false);
  const transcript = await f.store.messages({ sessionID: session });
  assert.deepEqual(
    transcript.map((item) => item.info.id),
    ["earlier-message", "input-message"],
  );
  assert.deepEqual(transcript[1]!.info.metadata, metadata);
  assert.deepEqual(
    transcript[1]!.parts.map((item) => item.id),
    ["z-part", "a-part"],
  );
  assert.deepEqual(
    f.rows("part").map((row) => row.sequence),
    [0, 1],
  );
  assert.deepEqual(await f.store.getSessionInputById("input"), {
    id: "input",
    sessionID: session,
    kind: "sendText",
    delivery: "queue",
    payload: { text: "first" },
    admittedSequence: 0,
    promotedSequence: 0,
    promotedMessageID: "input-message",
    status: "promoted",
    time: { created: now, updated: now },
  });
  assert.equal(f.rows("session").find((row) => row.id === session)!.time_updated, now);
  assert.equal(f.rows("session").find((row) => row.id === otherSession)!.time_updated, 2);
});

test("full promotion retains terminal reasons and retries advance only the promotion sequence", async (t) => {
  const f = await inputFixture(t);
  const terminal = ["cancelled", "discarded", "failed"] as const;
  for (const [index, status] of terminal.entries()) {
    const id = `input-${status}`;
    await f.add({ id });
    await f.store.settleSessionInput({
      id,
      sessionID: session,
      status,
      reason: `${status}-reason`,
    });
    await f.promote(id, message(`message-${status}`), []);
    const record = await f.store.getSessionInputById(id);
    assert.equal(record!.status, "promoted");
    assert.equal(record!.statusReason, `${status}-reason`);
    assert.equal(record!.admittedSequence, index);
    assert.equal(record!.promotedSequence, index);
  }
  const beforeMessages = f.rows("message");
  await f.promote("input-failed", message("message-failed"), []);
  const retried = await f.store.getSessionInputById("input-failed");
  assert.equal(retried!.admittedSequence, 2);
  assert.equal(retried!.promotedSequence, 3);
  assert.equal(retried!.statusReason, "failed-reason");
  assert.deepEqual(f.rows("message"), beforeMessages);
});

test("full promotion without a ledger row still commits its message and parts", async (t) => {
  const f = await inputFixture(t);
  await f.promote("missing-input");
  assert.equal(await f.store.getSessionInputById("missing-input"), null);
  assert.equal(f.rows("session_input").length, 0);
  assert.deepEqual(
    f.rows("message").map((row) => row.id),
    ["input-message"],
  );
  assert.deepEqual(
    f.rows("part").map((row) => row.id),
    ["input-part"],
  );
  assert.equal(f.rows("session").find((row) => row.id === session)!.time_updated, now);
});

test("promotion preserves independent transcript and ledger session identities", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.promote("input", message("other-message", { boundary: "kept" }, otherSession), [
    part("other-part", "other-message", otherSession),
  ]);
  const ledger = await f.store.getSessionInputById("input");
  assert.equal(ledger!.sessionID, session);
  assert.equal(ledger!.status, "promoted");
  assert.equal(ledger!.promotedMessageID, "other-message");
  assert.deepEqual(await f.store.messages({ sessionID: session }), []);
  const transcript = await f.store.messages({ sessionID: otherSession });
  assert.equal(transcript[0]!.info.id, "other-message");
  assert.equal(transcript[0]!.parts[0]!.id, "other-part");
  assert.equal(f.rows("session").find((row) => row.id === session)!.time_updated, 2);
  assert.equal(f.rows("session").find((row) => row.id === otherSession)!.time_updated, now);
});

test("promotion's ledger match remains session-scoped even when the global input ID exists", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  const ledger = await f.store.getSessionInputById("input");
  await f.store.promoteSessionInput({
    id: "input",
    sessionID: otherSession,
    message: message("other-message", undefined, otherSession),
    parts: [part("other-part", "other-message", otherSession)],
  });
  assert.deepEqual(await f.store.getSessionInputById("input"), ledger);
  assert.equal((await f.store.messages({ sessionID: otherSession })).length, 1);
  assert.equal(f.db.isTransaction, false);
});

test("message write failure rolls promotion back without changing any existing row", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  await f.store.saveMessage(message("existing-message"));
  const before = f.snapshot();
  f.db.exec(`CREATE TRIGGER reject_promoted_message BEFORE INSERT ON message
    WHEN NEW.id = 'input-message' BEGIN SELECT RAISE(ABORT, 'message fault'); END`);
  await assert.rejects(f.promote(), /message fault/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("a later part failure restores message, earlier part, ledger and session touch together", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  const before = f.snapshot();
  f.db.exec(`CREATE TRIGGER reject_second_part BEFORE INSERT ON part
    WHEN NEW.id = 'rejected-part' BEGIN SELECT RAISE(ABORT, 'second part fault'); END`);
  await assert.rejects(
    f.promote("input", message(), [part("accepted-part"), part("rejected-part")]),
    /second part fault/,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("message encoding failure rejects promotion and releases its transaction", async (t) => {
  const f = await inputFixture(t);
  await f.add();
  const before = f.snapshot();
  const metadata: Record<string, unknown> = {};
  metadata.circular = metadata;
  await assert.rejects(f.promote("input", message("input-message", metadata)), TypeError);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});
