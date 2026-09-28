// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import { SESSION_ENTRY_MODEL_SELECTION } from "@knorvia/contracts";
import {
  decodeMessageRow,
  decodePartRow,
  decodeSessionEntryRow,
} from "../src/storage/session-store/codecs.js";
import {
  entryRow,
  messageRow,
  partRow,
  rawSelection,
  selectedModel,
} from "./storage-codec-fixture.js";

test("user projections normalize new selections, discard legacy snapshots and preserve unknown data", () => {
  const row = messageRow({
    id: "old",
    role: "user",
    model: { providerID: "legacy" },
    modelSelection: rawSelection,
    unknown: { keep: true },
    sessionID: "old",
  });
  const before = { ...row },
    result = decodeMessageRow(row);
  assert.deepEqual(result, {
    id: row.id,
    role: "user",
    unknown: { keep: true },
    sessionID: row.session_id,
    modelSelection: selectedModel,
  });
  assert.deepEqual(Object.keys(result), ["id", "role", "unknown", "sessionID", "modelSelection"]);
  assert.deepEqual(row, before);
});

test("invalid user selections are absent and never filled using old snapshots", () => {
  for (const modelSelection of [
    undefined,
    null,
    false,
    {},
    { ...rawSelection, extra: 1 },
    { providerId: "", modelId: "model" },
    { ...rawSelection, options: { extra: 1 } },
  ]) {
    const result = decodeMessageRow(
      messageRow({
        role: "user",
        modelSelection,
        model: { providerID: "legacy", modelID: "legacy" },
        body: "kept",
      }),
    );
    assert.equal(Object.hasOwn(result, "modelSelection"), false);
    assert.equal(Object.hasOwn(result, "model"), false);
    assert.equal(Reflect.get(result, "body"), "kept");
  }
});

test("assistant removes only its legacy fields while unknown roles preserve them", () => {
  for (const role of ["assistant", "future"]) {
    const data = {
      role,
      providerID: "legacy",
      modelID: "legacy",
      variant: "old",
      modelSelection: null,
      unknown: [1],
    };
    const result = decodeMessageRow(messageRow(data));
    assert.equal(Object.hasOwn(result, "providerID"), role === "future");
    assert.equal(Object.hasOwn(result, "modelID"), role === "future");
    assert.equal(Object.hasOwn(result, "variant"), role === "future");
    assert.equal(Reflect.get(result, "modelSelection"), null);
    assert.deepEqual(Reflect.get(result, "unknown"), [1]);
  }
});

test("non-object message and part roots produce SQL identities only", () => {
  for (const value of [null, true, 5, "text", []]) {
    assert.deepEqual(decodeMessageRow(messageRow(value)), {
      id: "message-codec",
      sessionID: "session-codec",
    });
    assert.deepEqual(decodePartRow(partRow(value)), {
      id: "part-codec",
      sessionID: "session-codec",
      messageID: "message-codec",
    });
  }
});

test("document identities overwrite existing keys without moving them or losing __proto__", () => {
  const data = JSON.parse(
    '{"sessionID":"old","__proto__":{"safe":true},"id":"old","messageID":"old","type":"future"}',
  );
  const result = decodePartRow(partRow(data));
  assert.deepEqual(Object.keys(result), Object.keys(data));
  assert.equal(result.id, "part-codec");
  assert.equal(result.sessionID, "session-codec");
  assert.equal(result.messageID, "message-codec");
  assert.equal(Object.getPrototypeOf(result), Object.prototype);
  assert.equal(Object.hasOwn(result, "__proto__"), true);
  assert.deepEqual(Reflect.get(result, "__proto__"), { safe: true });
});

test("bad document JSON fails before reading SQL identities", () => {
  for (const [decode, row] of [
    [decodeMessageRow, messageRow({})],
    [decodePartRow, partRow({})],
    [decodeSessionEntryRow, entryRow({})],
  ] as const) {
    row.data = "{";
    Object.defineProperty(row, "id", {
      get() {
        throw new Error("identity must not be read");
      },
    });
    assert.throws(() => (decode as (input: unknown) => unknown)(row), SyntaxError);
  }
});

test("timeline changes keep valid sides and string labels without legacy fallback", () => {
  const result = decodePartRow(
    partRow({
      type: "timeline",
      timelineType: "model_change",
      fromModel: { old: true },
      toModel: { old: true },
      fromModelSelection: { ...rawSelection, label: "" },
      toModelSelection: { ...rawSelection, extra: 1 },
      marker: true,
    }),
  );
  assert.deepEqual(Reflect.get(result, "fromModel"), { ...selectedModel, label: "" });
  for (const key of ["toModel", "fromModelSelection", "toModelSelection"])
    assert.equal(Object.hasOwn(result, key), false);
  assert.deepEqual(Object.keys(result), [
    "type",
    "timelineType",
    "marker",
    "fromModel",
    "id",
    "sessionID",
    "messageID",
  ]);
  const both = decodePartRow(
    partRow({
      type: "timeline",
      timelineType: "model_change",
      fromModelSelection: { ...rawSelection, label: 3 },
      toModelSelection: { ...rawSelection, label: "Shown" },
    }),
  );
  assert.deepEqual(Reflect.get(both, "fromModel"), selectedModel);
  assert.deepEqual(Reflect.get(both, "toModel"), { ...selectedModel, label: "Shown" });
});

test("subtask selection projects to model while unrelated timeline payloads stay intact", () => {
  const valid = decodePartRow(
    partRow({
      type: "subtask",
      model: { old: true },
      modelSelection: rawSelection,
      prompt: "kept",
    }),
  );
  assert.deepEqual(Reflect.get(valid, "model"), selectedModel);
  assert.equal(Object.hasOwn(valid, "modelSelection"), false);
  const invalid = decodePartRow(
    partRow({ type: "subtask", model: { old: true }, modelSelection: null }),
  );
  assert.equal(Object.hasOwn(invalid, "model"), false);
  const opaque = {
    type: "timeline",
    timelineType: "future",
    fromModel: { old: true },
    fromModelSelection: null,
  };
  const result = decodePartRow(partRow(opaque));
  assert.deepEqual(result, {
    ...opaque,
    id: "part-codec",
    sessionID: "session-codec",
    messageID: "message-codec",
  });
});

test("model-selection entries retain invalid values instead of adopting document omission rules", () => {
  assert.deepEqual(
    decodeSessionEntryRow(entryRow({ modelSelection: rawSelection }, SESSION_ENTRY_MODEL_SELECTION))
      .data,
    selectedModel,
  );
  for (const value of [null, false, 0, "", {}, { ...rawSelection, extra: 1 }]) {
    const result = decodeSessionEntryRow(
      entryRow(
        { modelSelection: value, providerID: "legacy", modelID: "legacy" },
        SESSION_ENTRY_MODEL_SELECTION,
      ),
    );
    assert.deepEqual(result.data, value);
    assert.deepEqual(Object.keys(result), ["id", "sessionID", "type", "time", "data"]);
    assert.deepEqual(result.time, { created: 0, updated: 1 });
  }
  for (const value of [null, false, [], { providerID: "legacy" }])
    assert.equal(
      decodeSessionEntryRow(entryRow(value, SESSION_ENTRY_MODEL_SELECTION)).data,
      undefined,
    );
});

test("ordinary entries retain every JSON root and unknown members", () => {
  for (const value of [null, false, [], "text", 0, { modelSelection: rawSelection, unknown: true }])
    assert.deepEqual(decodeSessionEntryRow(entryRow(value)).data, value);
});

test("required document JSON rejects empty text rather than treating it as an absent cell", () => {
  for (const data of ["", " "]) {
    assert.throws(() => decodeMessageRow({ ...messageRow({}), data }), SyntaxError);
    assert.throws(() => decodePartRow({ ...partRow({}), data }), SyntaxError);
    assert.throws(() => decodeSessionEntryRow({ ...entryRow({}), data }), SyntaxError);
  }
});
