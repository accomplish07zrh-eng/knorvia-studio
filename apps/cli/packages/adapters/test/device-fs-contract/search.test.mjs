// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { searchInputs, observeSearch } from "./search-cases.mjs";
const loaded = await target();
const frozen = JSON.parse(
  await readFile(new URL("./search-observations.json", import.meta.url), "utf8"),
);
after(() => loaded.dispose());
assert.equal(searchInputs.length, 106);
assert.equal(frozen.records.length, 106);
for (const [index, input] of searchInputs.entries())
  test(`search frozen ${index}: ${input.op ?? input.engine ?? "javascript"}`, async () =>
    assert.deepEqual(await observeSearch(loaded, input), frozen.records[index]));
