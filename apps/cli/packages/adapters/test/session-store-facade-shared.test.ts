// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import {
  child,
  fixture,
  other,
  provenance,
  session,
  shared,
  transition,
  user,
  type ImportBundle,
} from "./session-store-facade.fixture.js";

test("shared import commits message, parts and provenance together then replays existing session", async (t) => {
  const f = await fixture(t);
  const input = shared();
  assert.equal((await f.store.commitSharedContextImportBundle(input)).id, child);
  const messages = await f.store.messages({ sessionID: child });
  assert.equal(messages.length, 1);
  assert.equal(messages[0]!.parts.length, 1);
  assert.deepEqual(
    (await f.store.sessionEntries({ sessionID: child }))[0]!.data,
    input.provenance.data,
  );
  const before = f.snapshot();
  input.session.title = "replay must not rewrite";
  assert.equal((await f.store.commitSharedContextImportBundle(input)).title, child);
  assert.deepEqual(f.snapshot(), before);
});

test("shared identity requires local owners, namespaced provenance and synthetic user visibility/source", async (t) => {
  const f = await fixture(t);
  const before = f.snapshot();
  const invalid: ImportBundle[] = Array.from({ length: 6 }, () => shared());
  invalid[0]!.contextMessage.info.sessionID = other;
  invalid[1]!.provenance.sessionID = other;
  invalid[2]!.provenance.id = "without-session-namespace";
  invalid[3]!.contextMessage.info = {
    ...invalid[3]!.contextMessage.info,
    role: "assistant",
  } as ImportBundle["contextMessage"]["info"];
  Object.assign(invalid[4]!.contextMessage.info, { visibility: undefined });
  Object.assign(invalid[5]!.contextMessage.info, { source: undefined });
  for (const input of invalid) {
    await assert.rejects(f.store.commitSharedContextImportBundle(input), {
      message: "Shared context import bundle identity is invalid",
    });
    assert.deepEqual(f.snapshot(), before);
  }
});

test("existing import requires same provenance type and id, not only an existing session", async (t) => {
  const f = await fixture(t);
  await f.store.createSession(session());
  await assert.rejects(f.store.commitSharedContextImportBundle(shared()), {
    message: "Shared context import session is incomplete",
  });
  await f.store.saveSessionEntry({ ...provenance(), type: "other-type" });
  await assert.rejects(f.store.commitSharedContextImportBundle(shared()), {
    message: "Shared context import session is incomplete",
  });
  await f.store.saveSessionEntry(provenance());
  assert.equal((await f.store.commitSharedContextImportBundle(shared())).id, child);
  assert.equal((await f.store.messages({ sessionID: child })).length, 0);
});

test("shared import native part failure leaves no partial child, context or provenance", async (t) => {
  const f = await fixture(t);
  const before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER reject_import BEFORE INSERT ON part BEGIN SELECT RAISE(ABORT,'shared part failure'); END",
  );
  await assert.rejects(f.store.commitSharedContextImportBundle(shared()), /shared part failure/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

for (const scenario of ["missing", "status-mismatch"] as const) {
  test(`transition ${scenario} returns false via one ROLLBACK without update clock or writes`, async (t) => {
    const f = await fixture(t);
    await f.store.commitSharedContextImportBundle(shared());
    const before = f.snapshot();
    const exec = f.db.exec.bind(f.db);
    const statements: string[] = [];
    t.mock.method(f.db, "exec", (sql: string) => {
      statements.push(sql.trim().toUpperCase());
      return exec(sql);
    });
    t.mock.method(Date, "now", () => {
      throw new Error("false transition must not read the update clock");
    });
    const input = transition();
    const result = await f.store.transitionSharedContextImport(
      scenario === "missing"
        ? { ...input, contextId: "missing" }
        : { ...input, expectedStatus: "attached" },
    );
    assert.equal(result, false);
    assert.deepEqual(statements, ["BEGIN IMMEDIATE", "ROLLBACK"]);
    assert.deepEqual(f.snapshot(), before);
  });
}

test("transition preserves entry fields, uses millisecond clock and updates only first matching message", async (t) => {
  const f = await fixture(t);
  await f.store.commitSharedContextImportBundle(shared());
  const second = {
    ...user("second-message" as ReturnType<typeof user>["id"]),
    time: { created: 99 },
    metadata: { contextId: "context", sharedContextStatus: "pending" },
  };
  await f.store.saveMessage(second);
  t.mock.method(Date, "now", () => 123456789);
  assert.equal(
    await f.store.transitionSharedContextImport({
      ...transition(),
      expectedStatus: ["reserved", "pending"],
      sourceId: "new-source",
    }),
    true,
  );
  const entry = (await f.store.sessionEntries({ sessionID: child }))[0]!;
  assert.deepEqual(entry.time, { created: 4, updated: 123456789 });
  assert.deepEqual(entry.data, {
    contextId: "context",
    status: "reserved",
    preserve: 9,
    sourceId: "new-source",
  });
  const messages = await f.store.messages({ sessionID: child });
  assert.deepEqual(messages[0]!.info.metadata, {
    contextId: "context",
    sharedContextStatus: "reserved",
    preserve: 7,
  });
  assert.equal(messages[1]!.info.metadata?.sharedContextStatus, "pending");
});

test("transition uses first matching entry even when a later entry has an eligible status", async (t) => {
  const f = await fixture(t);
  await f.store.createSession(session());
  await f.store.saveSessionEntry(provenance("first", "attached"));
  await f.store.saveSessionEntry({ ...provenance("second"), time: { created: 5, updated: 5 } });
  const before = f.snapshot();
  assert.equal(await f.store.transitionSharedContextImport(transition()), false);
  assert.deepEqual(f.snapshot(), before);
});

test("transition skips null/array/primitive provenance and allows a matching entry without a message", async (t) => {
  const f = await fixture(t);
  await f.store.createSession(session());
  for (const [index, data] of [null, [], "context", 7].entries()) {
    await f.store.saveSessionEntry({ ...provenance(`ignored-${index}`), data: {} });
    // Existing malformed documents are reader inputs, not accepted admission payloads.
    f.db
      .prepare("UPDATE session_entry SET data=? WHERE id=?")
      .run(JSON.stringify(data), `ignored-${index}`);
  }
  await f.store.saveSessionEntry(provenance("valid"));
  assert.equal(
    await f.store.transitionSharedContextImport({ ...transition(), sourceId: "" }),
    true,
  );
  const entries = await f.store.sessionEntries({ sessionID: child });
  assert.deepEqual(entries.at(-1)!.data, {
    contextId: "context",
    status: "reserved",
    preserve: 9,
    sourceId: "old-source",
  });
  assert.equal((await f.store.messages({ sessionID: child })).length, 0);
});
