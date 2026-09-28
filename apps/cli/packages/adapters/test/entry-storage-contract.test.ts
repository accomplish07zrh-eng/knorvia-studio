// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { SESSION_ENTRY_MODEL_SELECTION } from "@knorvia/contracts";
import { entry, other, owner, storageFixture } from "./entry-todo-fixture.js";

test("entry upsert keeps creation and row identity while updating mutable fields", async (t) => {
  const f = await storageFixture(t);
  await f.store.saveSessionEntry(entry());
  const before = f.rawEntry();
  await f.store.saveSessionEntry({
    ...entry("entry", { changed: true }),
    time: { created: 99, updated: 12 },
  });
  const after = f.rawEntry();
  assert.equal(after?.rowid, before?.rowid);
  assert.equal(after?.time_created, 20);
  assert.equal(after?.time_updated, 12);
  assert.deepEqual(JSON.parse(String(after?.data)), { changed: true });
  assert.equal((await f.store.getSession(owner))?.time.updated, 30);
});

test("entry ID can move to another session/type without replacing its row", async (t) => {
  const f = await storageFixture(t);
  await f.store.saveSessionEntry(entry());
  const before = f.rawEntry();
  await f.store.saveSessionEntry({
    ...entry("entry", false),
    sessionID: other,
    type: "fixture/moved",
    time: { created: 0, updated: 50 },
  });
  const after = f.rawEntry();
  assert.equal(after?.rowid, before?.rowid);
  assert.equal(after?.time_created, 20);
  assert.equal(after?.type, "fixture/moved");
  assert.equal(after?.session_id, other);
  assert.equal(after?.data, "false");
  assert.deepEqual(await f.store.sessionEntries({ sessionID: owner }), []);
  assert.equal((await f.store.getSession(other))?.time.updated, 50);
});

test("model selection updates retain legacy/unknown fields only within the same stored scope", async (t) => {
  const f = await storageFixture(t),
    selection = { providerId: "fixture", modelId: "model" };
  const input = { ...entry("selection", selection), type: SESSION_ENTRY_MODEL_SELECTION };
  await f.store.saveSessionEntry(input);
  const retained = {
    legacy: { keep: true },
    providerID: "old",
    modelSelection: null,
    unknown: [1],
  };
  f.db
    .prepare("UPDATE session_entry SET data=? WHERE id=?")
    .run(JSON.stringify(retained), input.id);
  await f.store.saveSessionEntry(input);
  assert.deepEqual(JSON.parse(String(f.rawEntry(input.id)?.data)), {
    ...retained,
    modelSelection: selection,
  });
  await f.store.saveSessionEntry({ ...input, data: null });
  assert.deepEqual(JSON.parse(String(f.rawEntry(input.id)?.data)), {
    ...retained,
    modelSelection: null,
  });
  await f.store.saveSessionEntry({ ...input, sessionID: other });
  assert.deepEqual(JSON.parse(String(f.rawEntry(input.id)?.data)), { modelSelection: selection });
});

test("model selection conflicts reject damaged matching JSON but a new type replaces it", async (t) => {
  const f = await storageFixture(t),
    input = { ...entry(), type: SESSION_ENTRY_MODEL_SELECTION };
  await f.store.saveSessionEntry(input);
  f.db.prepare("UPDATE session_entry SET data='{' WHERE id=?").run(input.id);
  const before = f.snapshot();
  await assert.rejects(f.store.saveSessionEntry(input), /malformed JSON/i);
  assert.deepEqual(f.snapshot(), before);
  await f.store.saveSessionEntry(entry("entry", { repairedByNewType: true }));
  assert.deepEqual(JSON.parse(String(f.rawEntry()?.data)), { repairedByNewType: true });
});

test("entries retain creation/row order, truthy filters and whole-read JSON errors", async (t) => {
  const f = await storageFixture(t);
  for (const [id, type, created] of [
    ["z", "fixture/z", 20],
    ["a", "fixture/a", 20],
    ["first", "fixture/z", 1],
  ] as const)
    await f.store.saveSessionEntry({
      ...entry(id),
      type,
      time: { created, updated: 30 },
      touchSession: false,
    });
  const read = (type?: string) => f.store.sessionEntries({ sessionID: owner, type });
  assert.deepEqual(
    (await read()).map((value) => value.id),
    ["first", "z", "a"],
  );
  assert.deepEqual(
    (await read("")).map((value) => value.id),
    ["first", "z", "a"],
  );
  assert.deepEqual(
    (await read("fixture/z")).map((value) => value.id),
    ["first", "z"],
  );
  f.db.prepare("UPDATE session_entry SET data='{' WHERE id='a'").run();
  await assert.rejects(read(), SyntaxError);
  assert.equal((await read("fixture/z")).length, 2);
});

test("entry touch opt-out and older timestamps keep session time monotonic", async (t) => {
  const f = await storageFixture(t);
  await f.store.saveSessionEntry({ ...entry(), touchSession: false });
  assert.equal((await f.store.getSession(owner))?.time.updated, 11);
  await f.store.saveSessionEntry(entry());
  assert.equal((await f.store.getSession(owner))?.time.updated, 30);
  await f.store.saveSessionEntry({ ...entry(), time: { created: 0, updated: 0 } });
  assert.equal((await f.store.getSession(owner))?.time.updated, 30);
});

test("ordinary entry data accepts JSON roots but rejects missing encodings before writes", async (t) => {
  const f = await storageFixture(t);
  for (const value of [false, 0, "", [], {}]) {
    await f.store.saveSessionEntry(entry("entry", value));
    assert.deepEqual(JSON.parse(String(f.rawEntry()?.data)), value);
  }
  const before = f.snapshot();
  for (const value of [null, undefined, () => 1, Symbol("fixture")])
    await assert.rejects(
      f.store.saveSessionEntry({ ...entry(), data: value }),
      /must be JSON-serializable/,
    );
  assert.deepEqual(f.snapshot(), before);
  const reason = new Error("serialization failure"),
    exec = t.mock.method(f.db, "exec", () => {
      throw new Error("SQL must not be reached");
    });
  await assert.rejects(
    f.store.saveSessionEntry(
      entry("entry", {
        toJSON() {
          throw reason;
        },
      }),
    ),
    (error) => error === reason,
  );
  assert.equal(exec.mock.callCount(), 0);
});

test("standalone entry and session touch roll back together after a touch failure", async (t) => {
  const f = await storageFixture(t),
    before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER fail_entry_touch BEFORE UPDATE OF time_updated ON session BEGIN SELECT RAISE(ABORT,'touch-original-failure'); END",
  );
  await assert.rejects(f.store.saveSessionEntry(entry()), /touch-original-failure/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("entry success borrows an existing transaction without committing it", async (t) => {
  const f = await storageFixture(t),
    before = f.snapshot();
  f.db.exec("BEGIN IMMEDIATE");
  await f.store.saveSessionEntry(entry());
  assert.equal(f.db.isTransaction, true);
  assert.ok(f.rawEntry());
  f.db.exec("ROLLBACK");
  assert.deepEqual(f.snapshot(), before);
});

test("entry failure in an outer transaction leaves that owner to roll back", async (t) => {
  const f = await storageFixture(t),
    before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER fail_borrowed_touch BEFORE UPDATE OF time_updated ON session BEGIN SELECT RAISE(ABORT,'borrowed-touch-failure'); END",
  );
  f.db.exec("BEGIN IMMEDIATE");
  await assert.rejects(f.store.saveSessionEntry(entry()), /borrowed-touch-failure/);
  assert.equal(f.db.isTransaction, true);
  assert.ok(f.rawEntry());
  f.db.exec("ROLLBACK");
  assert.deepEqual(f.snapshot(), before);
});

test("entry insert automatic rollback preserves its original failure", async (t) => {
  const f = await storageFixture(t),
    before = f.snapshot();
  f.db.exec(
    "CREATE TRIGGER fail_entry_insert BEFORE INSERT ON session_entry BEGIN SELECT RAISE(ROLLBACK,'entry-original-failure'); END",
  );
  await assert.rejects(f.store.saveSessionEntry(entry()), /entry-original-failure/);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});
