// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import test from "node:test";
import { exactBytes, fixture, ready, uri } from "./artifact-store.fixture.js";

for (const [label, rejection] of [
  ["Error", Object.assign(new Error("owned permission fault"), { code: "EACCES" })],
  ["object", { code: "EIO", marker: "owned fixture" }],
  ["string", "owned rejection"],
  ["number", 13],
  ["null", null],
  ["undefined", undefined],
] as const) {
  test(`regular-file stat keeps ${label} rejection semantics at the native port`, async (t) => {
    const { store, root } = await fixture(t);
    let calls = 0;
    const mocked = t.mock.method(fsPromises, "stat", async (path: unknown) => {
      assert.ok(String(path).startsWith(root));
      calls++;
      throw rejection;
    });
    syncBuiltinESMExports();
    t.after(() => {
      mocked.mock.restore();
      syncBuiltinESMExports();
    });
    await assert.rejects(
      store.primeMediaAttachmentPath({
        uri: uri(),
        mediaType: "image/png",
        bytes: new Uint8Array([1]),
      }),
      (error: unknown) => {
        if (rejection == null) assert.ok(error instanceof TypeError);
        else assert.equal(error, rejection);
        return true;
      },
    );
    assert.equal(
      calls,
      1,
      "The replacement must use the native stat boundary exercised by this test",
    );
  });
}

test("non-Error ENOENT stat rejection is treated as missing and permits publication", async (t) => {
  const { store, root } = await fixture(t);
  let calls = 0;
  const mocked = t.mock.method(fsPromises, "stat", async (path: unknown) => {
    assert.ok(String(path).startsWith(root));
    calls++;
    throw { code: "ENOENT" };
  });
  syncBuiltinESMExports();
  t.after(() => {
    mocked.mock.restore();
    syncBuiltinESMExports();
  });
  const result = await store.primeMediaAttachmentPath({
    uri: uri(),
    mediaType: "image/png",
    bytes: new Uint8Array([1, 2]),
  });
  assert.equal(calls, 1);
  await exactBytes(ready(result), new Uint8Array([1, 2]));
});
