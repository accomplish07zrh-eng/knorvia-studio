// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import {
  messageFixture,
  messageID,
  other,
  otherMessageID,
  owner,
  part,
  partID,
  user,
} from "./message-storage-fixture.js";

test("copyFrom transfers only exact source legacy snapshots, preserving raw boolean on insert", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user(otherMessageID, other));
  f.db.prepare("UPDATE message SET data=? WHERE id=?").run(
    JSON.stringify({
      model: { origin: true },
      providerID: false,
      modelID: null,
      variant: "original",
      metadata: { wrong: true },
      modelSelection: { wrong: true },
    }),
    otherMessageID,
  );
  await f.store.saveMessage({ ...user(), metadata: {} }, { id: otherMessageID, sessionID: other });
  const data = f.data("message", messageID);
  assert.deepEqual(data.model, { origin: true });
  assert.equal(data.providerID, false);
  assert.equal(data.modelID, null);
  assert.equal(data.variant, "original");
  assert.deepEqual(data.metadata, {});
  assert.equal(Object.hasOwn(data, "modelSelection"), false);
});

test("existing target snapshots take precedence over copied source while absent keys are copied", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user(otherMessageID, other));
  await f.store.saveMessage(user());
  f.db
    .prepare("UPDATE message SET data=? WHERE id=?")
    .run(
      JSON.stringify({ model: { source: 1 }, providerID: "source", modelID: "source" }),
      otherMessageID,
    );
  f.db
    .prepare("UPDATE message SET data=? WHERE id=?")
    .run(JSON.stringify({ model: null, modelID: "target" }), messageID);
  await f.store.saveMessage(user(), { id: otherMessageID, sessionID: other });
  const data = f.data("message", messageID);
  assert.deepEqual([data.model, data.providerID, data.modelID], [null, "source", "target"]);
});

test("part copy reads only id and session source and retains source legacy structures", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user());
  await f.store.saveMessage(user(otherMessageID, other));
  await f.store.savePart(part(partID, otherMessageID, other));
  f.db.prepare("UPDATE part SET data=? WHERE id=?").run(
    JSON.stringify({
      fromModel: false,
      toModel: ["old"],
      model: null,
      metadata: { stale: true },
    }),
    partID,
  );
  const copyId = "message-contract-copy" as typeof partID;
  await f.store.savePart({ ...part(copyId), metadata: {} }, { id: partID, sessionID: other });
  const data = f.data("part", copyId);
  assert.deepEqual(
    [data.fromModel, data.toModel, data.model, data.metadata],
    [false, ["old"], null, {}],
  );
});

test("missing or malformed copy source rejects without changing destination or session", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user(otherMessageID, other));
  await f.store.saveMessage(user());
  await f.store.savePart(part(partID, otherMessageID, other));
  for (const [table, id, save] of [
    [
      "message",
      otherMessageID,
      (sessionID: typeof owner) => f.store.saveMessage(user(), { id: otherMessageID, sessionID }),
    ],
    [
      "part",
      partID,
      (sessionID: typeof owner) =>
        f.store.savePart(part("copy-part" as typeof partID), { id: partID, sessionID }),
    ],
  ] as const) {
    let before = f.snapshot();
    await assert.rejects(save(owner), new RegExp(`Storage copy source missing: ${table}/${id}`));
    assert.deepEqual(f.snapshot(), before);
    for (const [sourceData, error] of [
      ["invalid", SyntaxError],
      ["null", TypeError],
    ] as const) {
      f.db.prepare(`UPDATE ${table} SET data=? WHERE id=?`).run(sourceData, id);
      before = f.snapshot();
      await assert.rejects(save(other), error);
      assert.deepEqual(f.snapshot(), before);
      assert.equal(f.db.isTransaction, false);
    }
  }
});

test("primitive and array copy documents do not manufacture legacy keys", async (t) => {
  const f = await messageFixture(t);
  await f.store.saveMessage(user(otherMessageID, other));
  for (const data of ["[]", "7", "true", '"fixture"']) {
    f.db.prepare("UPDATE message SET data=? WHERE id=?").run(data, otherMessageID);
    await f.store.saveMessage(user(), { id: otherMessageID, sessionID: other });
    assert.deepEqual(f.data("message", messageID).model, {});
  }
});
