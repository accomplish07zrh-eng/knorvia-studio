// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { RecordInputHistoryInput, SessionId } from "@knorvia/contracts";
import {
  fixtureUuid,
  history,
  historyFixture,
  historyInput,
  otherProject,
  project,
  session,
} from "./input-history-fixture.js";

test("record trims only outer whitespace and retains exact returned field presence", async (t) => {
  const f = historyFixture(t);
  const saved = await f.record({ text: " \n  one  two\nthree \t" });
  assert.ok(saved);
  assert.equal(saved.text, "one  two\nthree");
  assert.equal(Object.hasOwn(saved, "sessionID"), true);
  assert.equal(saved.sessionID, undefined);
  assert.equal(Object.hasOwn(saved, "attachments"), false);
  assert.equal(f.rows()[0].attachments, null);
  assert.equal(f.rows()[0].text, saved.text);
  assert.match(saved.id, /^input_[0-9a-z]+_[0-9a-f-]{36}$/);
});

test("empty input does not touch attachments, SQL, IDs or time, including inside caller transaction", async (t) => {
  const f = historyFixture(t);
  f.db.exec("BEGIN IMMEDIATE");
  const untouched = () => {
    throw new Error("Empty input must stop before this side effect");
  };
  t.mock.method(f.db, "prepare", untouched);
  t.mock.method(f.db, "exec", untouched);
  t.mock.method(Date, "now", untouched);
  t.mock.method(crypto, "randomUUID", untouched);
  const input = historyInput({ text: " \r\n\t " });
  Object.defineProperty(input, "attachments", { get: untouched });
  assert.equal(await history.recordInputHistory(f.db, input), null);
  assert.equal(f.db.isTransaction, true);
});

test("deduplication ignores kind and session, and only compares the project's newest item", async (t) => {
  const f = historyFixture(t);
  assert.ok(await f.record({ text: "same", sessionID: session, time: { created: 10 } }));
  assert.equal(
    await f.record({
      text: " same ",
      kind: "slash_command",
      sessionID: "other-session" as SessionId,
    }),
    null,
  );
  assert.ok(await f.record({ text: "same", projectID: otherProject, time: { created: 11 } }));
  assert.ok(await f.record({ text: "different", time: { created: 12 } }));
  assert.ok(await f.record({ text: "same", time: { created: 13 } }));
  assert.equal(f.rows().length, 4);
  assert.equal((await f.recall())?.text, "same");
});

test("deduplication reads stored text and ordering, not last invocation or normalized old text", async (t) => {
  const f = historyFixture(t);
  f.seed("recent", { text: "recent", created: 100 });
  assert.ok(await f.record({ text: "older", time: { created: 1 } }));
  assert.ok(await f.record({ text: "older", time: { created: 2 } }));
  assert.equal((await f.recall())?.text, "recent");
  f.seed("legacy-text", { text: " recent ", created: 200 });
  assert.ok(await f.record({ text: " recent ", time: { created: 201 } }));
  assert.equal(f.rows().length, 5);
});

test("duplicate exits before UUID, clocks and retention work", async (t) => {
  const f = historyFixture(t);
  f.seed("latest", { text: "same" });
  const before = f.rows();
  const forbidden = () => {
    throw new Error("No write preparation for duplicate");
  };
  t.mock.method(crypto, "randomUUID", forbidden);
  t.mock.method(Date, "now", forbidden);
  t.mock.method(f.db, "exec", forbidden);
  assert.equal(await f.record({ text: "same", kind: "steered_input" }), null);
  assert.deepEqual(f.rows(), before);
});

test("ID clock and stored creation time remain independent; explicit zero is retained", async (t) => {
  const f = historyFixture(t);
  const clocks = [35, 90, 36];
  t.mock.method(Date, "now", () => {
    const value = clocks.shift();
    assert.notEqual(value, undefined);
    return value!;
  });
  t.mock.method(crypto, "randomUUID", () => fixtureUuid);
  const first = await f.record();
  assert.equal(first?.id, `input_z_${fixtureUuid}`);
  assert.equal(first?.time.created, 90);
  const second = await f.record({ text: "second", time: { created: 0 } });
  assert.equal(second?.id, `input_10_${fixtureUuid}`);
  assert.equal(second?.time.created, 0);
  assert.deepEqual(clocks, []);
});

test("UUID failures and ID collisions propagate without retries or partial changes", async (t) => {
  const f = historyFixture(t);
  const failure = new Error("fixture UUID failure");
  const random = t.mock.method(crypto, "randomUUID", () => {
    throw failure;
  });
  await assert.rejects(f.record(), (error) => error === failure);
  assert.equal(f.rows().length, 0);
  random.mock.restore();
  let calls = 0;
  t.mock.method(crypto, "randomUUID", () => {
    calls++;
    return fixtureUuid;
  });
  t.mock.method(Date, "now", () => 1);
  f.seed(`input_1_${fixtureUuid}`, { text: "old" });
  const before = f.rows();
  await assert.rejects(f.record({ text: "new" }), /UNIQUE constraint failed/);
  assert.equal(calls, 1);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.db.isTransaction, false);
});

test("record returns its input projection after commit while recall reads persisted values", async (t) => {
  const f = historyFixture(t);
  f.db.exec(
    "CREATE TRIGGER change_history AFTER INSERT ON input_history BEGIN UPDATE input_history SET text='Stored' WHERE id=NEW.id; END",
  );
  const saved = await f.record({ text: " Entered ", sessionID: "" as SessionId });
  assert.equal(saved?.text, "Entered");
  assert.equal(saved?.sessionID, "");
  assert.equal(f.db.isTransaction, false);
  const recalled = await f.recall();
  assert.equal(recalled?.text, "Stored");
  assert.equal(recalled?.sessionID, undefined);
  assert.equal(f.rows()[0].session_id, "");
});

test("runtime null session is returned as supplied but stored and recalled with their own rules", async (t) => {
  const f = historyFixture(t);
  const result = await f.record({ sessionID: null as unknown as SessionId });
  assert.ok(result);
  assert.equal(Object.hasOwn(result, "sessionID"), true);
  assert.equal(result.sessionID, null);
  assert.equal(f.rows()[0].session_id, null);
  assert.equal((await f.recall())?.sessionID, undefined);
});

test("recall respects project, time then ID order and native offset validation", async (t) => {
  const f = historyFixture(t);
  for (const key of ["a", "c", "b"]) f.seed(key);
  f.seed("recent-other", { projectID: otherProject, created: 100 });
  for (const skip of [undefined, -1, 0]) assert.equal((await f.recall(skip))?.id, "c");
  assert.equal((await f.recall(1))?.id, "b");
  assert.equal((await f.recall(2))?.id, "a");
  assert.equal(await f.recall(3), null);
  for (const skip of [0.5, NaN, Infinity])
    await assert.rejects(f.recall(skip), /datatype mismatch/);
  assert.equal(
    await history.recallPreviousInputHistory(f.db, { projectID: "missing" as typeof project }),
    null,
  );
});

test("bad most recent attachment JSON rejects even when incoming text would differ", async (t) => {
  const f = historyFixture(t);
  f.seed("broken", { text: "different", attachments: "invalid" });
  const before = f.rows();
  await assert.rejects(f.record({ text: "new" }), SyntaxError);
  assert.deepEqual(f.rows(), before);
  assert.equal(f.db.isTransaction, false);
});

test("ordinary input projection leaves frozen inputs unchanged", async (t) => {
  const f = historyFixture(t);
  const attachments = Object.freeze([Object.freeze({ type: "file" as const, path: " file.txt " })]);
  const input = Object.freeze(
    historyInput({
      text: " frozen ",
      attachments: attachments as unknown as RecordInputHistoryInput["attachments"],
    }),
  );
  const result = await history.recordInputHistory(f.db, input);
  assert.deepEqual(result?.attachments, [{ type: "file", path: "file.txt" }]);
  assert.equal(input.text, " frozen ");
  assert.equal(attachments[0].path, " file.txt ");
});
