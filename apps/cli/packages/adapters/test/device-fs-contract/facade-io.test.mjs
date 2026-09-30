// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import { target } from "./subject.mjs";
import { facadeInputs, observeFacade } from "./facade-io-cases.mjs";
import { portable } from "./fixture.mjs";
const loaded = await target();
const frozen = JSON.parse(
  await readFile(new URL("./facade-io-observations.json", import.meta.url), "utf8"),
);
after(() => loaded.dispose());
assert.equal(facadeInputs.length, 50);
assert.equal(frozen.records.length, 50);
for (const [index, input] of facadeInputs.entries())
  test(`facade I/O frozen ${index}: ${input.op}`, async () =>
    assert.deepEqual(
      { input: portable(input), ...(await observeFacade(loaded, input)) },
      frozen.records[index],
    ));
