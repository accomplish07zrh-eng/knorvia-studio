// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { rangeInputs, observeRange } from "./range-cases.mjs";

const loaded = await target();
const frozen = JSON.parse(
  await readFile(new URL("./range-observations.json", import.meta.url), "utf8"),
);
after(() => loaded.dispose());
assert.equal(rangeInputs.length, 73);
assert.equal(frozen.records.length, 73);
for (const [index, input] of rangeInputs.entries())
  test(`range frozen ${index}: ${input.stream ? "stream" : "fast"}`, async () =>
    assert.deepEqual(await observeRange(loaded, input), frozen.records[index]));
