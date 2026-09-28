// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { constants } from "node:sqlite";
import test from "node:test";
import type { MessageId, MessagePart, ModelId, ModelProviderId, PartId } from "@knorvia/contracts";
import {
  assistant,
  messageFixture,
  messageID,
  other,
  otherMessageID,
  owner,
  part,
  partID,
  user,
} from "./message-storage-fixture.js";

const selection = {
  providerId: "fixture" as ModelProviderId,
  modelId: "model" as ModelId,
  options: { reasoningLevel: "high" },
  label: "Fixture model",
};

test("message documents preserve current input while writing minimal legacy reader fields", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage({ ...user(), modelSelection: selection, metadata: { own: true } });
  const value = f.data("message", messageID);
  assert.deepEqual(value.model, { providerID: "fixture", modelID: "model", variant: "high" });
  assert.deepEqual(value.modelSelection, selection);
  assert.deepEqual(value.metadata, { own: true });
  assert.equal(Object.hasOwn(value, "id"), false);
  assert.equal(Object.hasOwn(value, "sessionID"), false);
  await f.store.saveMessage(user(otherMessageID));
  assert.deepEqual(f.data("message", otherMessageID).model, {});
  await f.store.saveMessage(assistant());
  assert.equal(Object.hasOwn(f.data("message", assistant().id), "model"), false);
});

test("message times keep zero completion, creation identity and synchronous persistence", async (t) => {
  const f = await messageFixture(t);
  t.mock.method(Date, "now", () => 70);
  const pending = f.store.saveMessage(assistant());
  assert.equal(f.row("message", assistant().id).time_updated, 70);
  await pending;
  const initial = f.row("message", assistant().id);
  await f.store.saveMessage({ ...assistant(), time: { created: 99, completed: 0 } });
  const updated = f.row("message", assistant().id);
  assert.deepEqual(
    [updated.rowid, updated.time_created, updated.time_updated],
    [initial.rowid, 30, 0],
  );
  assert.equal((await f.store.getSession(owner))?.time.updated, 70);
});

test("same-scope message updates retain only legacy snapshots and never reorder NULL sequence", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  const initial = f.row("message", messageID);
  f.db.prepare("UPDATE message SET data=?,sequence=NULL WHERE id=?").run(
    JSON.stringify({
      model: { old: true },
      providerID: null,
      modelID: false,
      variant: "old",
      metadata: { stale: true },
      oldOnly: true,
    }),
    messageID,
  );
  await f.store.saveMessage({
    ...user(),
    modelSelection: selection,
    metadata: {},
    time: { created: 100 },
  });
  const value = f.data("message", messageID);
  assert.deepEqual(value.model, { old: true });
  assert.equal(value.providerID, null);
  assert.equal(value.modelID, 0);
  assert.equal(value.variant, "old");
  assert.deepEqual(value.metadata, {});
  assert.equal(Object.hasOwn(value, "oldOnly"), false);
  const updated = f.row("message", messageID);
  assert.deepEqual(
    [updated.rowid, updated.time_created, updated.sequence],
    [initial.rowid, 20, null],
  );
});

test("message rebinding uses target queue tail and does not parse damaged prior scope", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  await f.store.saveMessage(user(otherMessageID, other));
  f.db.prepare("UPDATE message SET data='invalid',sequence=20 WHERE id=?").run(messageID);
  await f.store.saveMessage({ ...user(messageID, other), time: { created: 80 } });
  const row = f.row("message", messageID);
  assert.deepEqual([row.session_id, row.sequence, row.time_created], [other, 1, 20]);
  assert.deepEqual(f.data("message", messageID).model, {});
});

test("timeline model change and subtask persist modern selections with minimal legacy projection", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  const timeline = {
    ...part(),
    type: "timeline",
    timelineType: "model_change",
    fromModel: selection,
    toModel: selection,
  } as unknown as MessagePart;
  await f.store.savePart(timeline);
  const value = f.data("part", partID);
  assert.deepEqual(value.toModel, {
    providerID: "fixture",
    modelID: "model",
    variant: "high",
    label: "Fixture model",
  });
  assert.deepEqual(value.fromModelSelection, selection);
  assert.deepEqual(value.toModelSelection, selection);
  assert.equal(Object.hasOwn(value, "fromModel"), false);
  for (const key of ["id", "messageID", "sessionID"])
    assert.equal(Object.hasOwn(value, key), false);
  const subtask = {
    ...part("subtask" as PartId),
    type: "subtask",
    model: selection,
    prompt: "Fixture",
    description: "Fixture",
    agent: "fixture",
  } as MessagePart;
  await f.store.savePart(subtask);
  assert.deepEqual(f.data("part", subtask.id).modelSelection, selection);
  assert.equal(Object.hasOwn(f.data("part", subtask.id), "model"), false);
  const decoded = (await f.store.messageWithParts({ sessionID: owner, messageID }))!.parts;
  assert.equal((decoded.find((p) => p.id === subtask.id) as typeof subtask).type, "subtask");
});

test("part update keeps row identity, snapshots and NULL ordering while replacing metadata", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  t.mock.method(Date, "now", () => 50);
  const pending = f.store.savePart(part());
  assert.equal(f.row("part", partID).time_updated, 50);
  await pending;
  const before = f.row("part", partID);
  f.db.prepare("UPDATE part SET data=?,sequence=NULL WHERE id=?").run(
    JSON.stringify({
      fromModel: null,
      toModel: { old: 1 },
      model: false,
      metadata: { stale: true },
    }),
    partID,
  );
  await f.store.savePart({ ...part(), time: { start: 90 }, metadata: {} });
  const after = f.row("part", partID);
  assert.deepEqual([after.rowid, after.time_created, after.sequence], [before.rowid, 25, null]);
  assert.deepEqual(f.data("part", partID), {
    type: "text",
    text: "Fixture",
    time: { start: 90 },
    metadata: {},
    fromModel: null,
    toModel: { old: 1 },
    model: 0,
  });
});

test("timeline projection keeps deterministic legacy and modern field insertion order", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  await f.store.savePart({
    ...part(),
    type: "timeline",
    timelineType: "model_change",
    fromModel: selection,
    toModel: selection,
  } as unknown as MessagePart);
  assert.deepEqual(
    Object.keys(f.data("part", partID)).filter((key) =>
      ["toModel", "fromModelSelection", "toModelSelection"].includes(key),
    ),
    ["toModel", "fromModelSelection", "toModelSelection"],
  );
});

test("part scope rebind takes target message tail and replaces damaged old document", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  await f.store.saveMessage(user(otherMessageID, other));
  await f.store.savePart(part());
  await f.store.savePart(part("other-part" as PartId, otherMessageID, other));
  f.db.prepare("UPDATE part SET data='invalid',sequence=20 WHERE id=?").run(partID);
  await f.store.savePart({ ...part(partID, otherMessageID, other), time: { start: 90 } });
  const row = f.row("part", partID);
  assert.deepEqual(
    [row.session_id, row.message_id, row.sequence, row.time_created],
    [other, otherMessageID, 1, 25],
  );
  assert.equal(f.data("part", partID).text, "Fixture");
});

test("same-scope malformed target remains an error while all writes and touches stay unchanged", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  await f.store.savePart(part());
  for (const [table, id, write] of [
    ["message", messageID, () => f.store.saveMessage(user())],
    ["part", partID, () => f.store.savePart(part())],
  ] as const) {
    f.db.prepare(`UPDATE ${table} SET data='invalid' WHERE id=?`).run(id);
    const before = f.snapshot();
    await assert.rejects(write(), { code: "ERR_SQLITE_ERROR" });
    assert.deepEqual(f.snapshot(), before);
  }
});

test("failed document serialization never invents a fallback document or commits a touch", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  const before = f.snapshot();
  await assert.rejects(
    f.store.saveMessage(Object.assign(user(), { toJSON: () => undefined })),
    TypeError,
  );
  await assert.rejects(
    f.store.savePart(Object.assign(part(), { toJSON: () => undefined })),
    TypeError,
  );
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.db.isTransaction, false);
});

test("list and single-message reads keep numeric-first sequence, legacy ties and scope boundaries", async (t) => {
  const f = await messageFixture(t);
  for (const id of ["b", "a", "null-b", "null-a"]) await f.store.saveMessage(user(id as MessageId));
  f.db.prepare("UPDATE message SET sequence=NULL WHERE id LIKE 'null-%'").run();
  f.db.prepare("UPDATE message SET sequence=0 WHERE id IN ('a','b')").run();
  for (const id of ["z", "y", "x", "w"])
    await f.store.savePart(part(id as PartId, "b" as MessageId));
  f.db.prepare("UPDATE part SET sequence=NULL WHERE id IN ('x','w')").run();
  f.db.prepare("UPDATE part SET sequence=0 WHERE id IN ('y','z')").run();
  const values = await f.store.messages({ sessionID: owner });
  assert.deepEqual(
    values.map((v) => v.info.id),
    ["b", "a", "null-b", "null-a"],
  );
  assert.deepEqual(
    values[0].parts.map((p) => p.id),
    ["y", "z", "w", "x"],
  );
  assert.deepEqual(
    await f.store.messageWithParts({ sessionID: owner, messageID: "b" as MessageId }),
    values[0],
  );
  assert.equal(
    await f.store.messageWithParts({ sessionID: other, messageID: "b" as MessageId }),
    null,
  );
  assert.deepEqual(await f.store.messages({ sessionID: other }), []);
});

test("deletion is precisely scoped, uses existing message cascade and does not touch session", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  await f.store.saveMessage(user(otherMessageID));
  await f.store.savePart(part());
  const time = (await f.store.getSession(owner))?.time.updated;
  await f.store.removeMessage({ sessionID: other, messageID });
  await f.store.removePart({ sessionID: owner, messageID: otherMessageID, partID });
  assert.equal(f.rows("part").length, 1);
  await f.store.removePart({ sessionID: owner, messageID, partID });
  assert.equal(f.rows("part").length, 0);
  await f.store.savePart(part());
  const before = (await f.store.getSession(owner))?.time.updated;
  await f.store.removeMessage({ sessionID: owner, messageID });
  assert.equal(f.rows("part").length, 0);
  assert.deepEqual(
    (await f.store.messages({ sessionID: owner })).map((v) => v.info.id),
    [otherMessageID],
  );
  assert.ok((before ?? 0) >= (time ?? 0));
  assert.equal((await f.store.getSession(owner))?.time.updated, before);
});

test("orphan parts are decoded by list but a missing single message returns before reading parts", async (t) => {
  const f = await messageFixture(t);
  f.db.exec("PRAGMA foreign_keys=OFF");
  f.db
    .prepare(
      "INSERT INTO part(id,session_id,message_id,time_created,time_updated,data) VALUES(?,?,?,?,?,?)",
    )
    .run(partID, owner, messageID, 1, 1, "invalid");
  assert.equal(await f.store.messageWithParts({ sessionID: owner, messageID }), null);
  await assert.rejects(f.store.messages({ sessionID: owner }), SyntaxError);
  f.db.prepare("UPDATE part SET data=?").run(JSON.stringify({ type: "text", text: "orphan" }));
  assert.deepEqual(await f.store.messages({ sessionID: owner }), []);
});

test("single read completes the part query before decoding its stored message", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  f.db.prepare("UPDATE message SET data='invalid' WHERE id=?").run(messageID);
  f.db.setAuthorizer((action, table) =>
    action === constants.SQLITE_READ && table === "part"
      ? constants.SQLITE_DENY
      : constants.SQLITE_OK,
  );
  await assert.rejects(f.store.messageWithParts({ sessionID: owner, messageID }), {
    code: "ERR_SQLITE_ERROR",
  });
  f.db.setAuthorizer(null);
  await assert.rejects(f.store.messageWithParts({ sessionID: owner, messageID }), SyntaxError);
});
