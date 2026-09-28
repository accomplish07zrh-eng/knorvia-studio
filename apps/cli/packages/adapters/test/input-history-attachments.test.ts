// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import test from "node:test";
import type { InputHistoryAttachment } from "@knorvia/contracts";
import { historyFixture } from "./input-history-fixture.js";

test("attachment projection keeps four kinds, order and duplicates while excluding inline data content", async (t) => {
  const f = historyFixture(t);
  const attachments = [
    { content: " value ", type: "file", path: " file.txt ", extra: true },
    { type: "image", path: " image.png ", content: " data:image/png;base64,fixture " },
    { type: "pdf", content: " DATA:visible " },
    { type: "url", path: " data:path-is-kept ", content: " https://example.invalid/item " },
    { type: "file", path: " file.txt ", content: " value " },
    { type: "FILE", path: "ignored" },
    { type: "image", content: "data:excluded" },
    { type: "file", path: 4, content: " " },
    { type: "unknown", path: "ignored" },
  ] as unknown as InputHistoryAttachment[];
  const before = structuredClone(attachments);
  const expected = [
    { type: "file", path: "file.txt", content: "value" },
    { type: "image", path: "image.png" },
    { type: "pdf", content: "DATA:visible" },
    { type: "url", path: "data:path-is-kept", content: "https://example.invalid/item" },
    { type: "file", path: "file.txt", content: "value" },
  ];
  const result = await f.record({ attachments });
  assert.deepEqual(result?.attachments, expected);
  assert.equal(f.rows()[0].attachments, JSON.stringify(expected));
  assert.deepEqual(attachments, before);
});

test("empty or invalid-type attachment projection is absent, including sparse arrays", async (t) => {
  const f = historyFixture(t);
  const attachments: InputHistoryAttachment[] = [];
  attachments.length = 2;
  attachments.push({ type: "image", content: " data:removed " });
  const result = await f.record({ attachments });
  assert.equal(Object.hasOwn(result!, "attachments"), false);
  assert.equal(f.rows()[0].attachments, null);
  assert.equal(await f.record({ attachments: [] }), null);
});

test("attachment dedup ignores object key order and discarded fields but preserves array order", async (t) => {
  const f = historyFixture(t);
  const a: InputHistoryAttachment = { type: "file", path: "a" };
  const b: InputHistoryAttachment = { type: "url", content: "b" };
  assert.ok(await f.record({ attachments: [a, b], time: { created: 1 } }));
  const matching = [
    { path: " a ", type: "file", unknown: "discard" },
    { content: " b ", type: "url" },
  ] as InputHistoryAttachment[];
  assert.equal(await f.record({ attachments: matching }), null);
  assert.ok(await f.record({ attachments: [b, a], time: { created: 2 } }));
  assert.equal(f.rows().length, 2);
});

for (const encoded of [null, "", "null", "[]"]) {
  test(`recall treats ${String(encoded)} as absent attachments without rewriting row`, async (t) => {
    const f = historyFixture(t);
    f.seed("old", { attachments: encoded, text: " Stored ", kind: "legacy-kind", sessionID: "" });
    const before = f.rows();
    const value = await f.recall();
    assert.equal(Object.hasOwn(value!, "attachments"), false);
    assert.equal(value?.text, " Stored ");
    assert.equal(value?.kind, "legacy-kind");
    assert.equal(value?.sessionID, undefined);
    assert.deepEqual(f.rows(), before);
  });
}

for (const encoded of ["invalid", "{}", "[null]", '"text"']) {
  test(`recall rejects unsupported stored attachment content ${encoded}`, async (t) => {
    const f = historyFixture(t);
    f.seed("bad", { attachments: encoded });
    const before = f.rows();
    await assert.rejects(f.recall(), encoded === "invalid" ? SyntaxError : TypeError);
    assert.deepEqual(f.rows(), before);
  });
}

test("nonempty input retains native attachment errors and recall allocates detached objects", async (t) => {
  const f = historyFixture(t);
  await assert.rejects(
    f.record({ attachments: [null] as unknown as InputHistoryAttachment[] }),
    TypeError,
  );
  assert.equal(f.rows().length, 0);
  await f.record({ attachments: [{ type: "file", path: "stored" }] });
  const first = await f.recall();
  first!.attachments![0].path = "modified local result";
  assert.equal((await f.recall())?.attachments?.[0].path, "stored");
});
