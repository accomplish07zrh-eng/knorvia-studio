// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { identityInputs, observeIdentity } from "./identity-cases.mjs";
import { nativeIdentityObservation } from "./fixture.mjs";
const loaded = await target();
const frozen = JSON.parse(
  await readFile(new URL("./identity-observations.json", import.meta.url), "utf8"),
);
after(() => loaded.dispose());
assert.equal(identityInputs.length, 33);
assert.equal(frozen.records.length, 33);
for (const [index, input] of identityInputs.entries())
  test(`identity frozen ${index}: ${input.lock ?? input.base ?? "state"}`, async () =>
    assert.deepEqual(
      await observeIdentity(loaded, input, index),
      nativeIdentityObservation(frozen.records[index]),
    ));
