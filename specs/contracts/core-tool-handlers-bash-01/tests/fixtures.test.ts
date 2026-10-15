// SPDX-License-Identifier: Apache-2.0
// core-tool-handlers-bash-01 contract tests: fixture-driven extended read-only baseline (选择 9).
// Data lives in fixtures/read-only-baseline.json; the oracle must reproduce every recorded judgment.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { isRuntimeReadOnlyBashCommand } from "../../../../apps/cli/packages/core/src/tool/handlers/bash-semantics.js";

const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(
  readFileSync(join(here, "..", "fixtures", "read-only-baseline.json"), "utf8"),
) as { cases: { command: string; readOnly: boolean }[] };

test("B-ro-18 extended fixture baseline reproduces every recorded read-only judgment", () => {
  assert.ok(baseline.cases.length >= 24);
  for (const { command, readOnly } of baseline.cases) {
    assert.equal(
      isRuntimeReadOnlyBashCommand(command),
      readOnly,
      `readonly judgment for ${JSON.stringify(command)}`,
    );
  }
});
