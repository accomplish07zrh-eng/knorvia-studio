// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import assert from "node:assert/strict";
import test from "node:test";
import { runContractTarget } from "./plugin-storage-contract/harness/runner.mjs";
import { contractSchema } from "./plugin-storage-contract/harness/build-world.mjs";

function verifyAccepted(
  result: Awaited<ReturnType<typeof runContractTarget>>,
  target: "source" | "dist",
) {
  assert.equal(result.target, target);
  assert.equal(result.total, contractSchema.caseCounts.executable);
  assert.equal(result.passed, contractSchema.caseCounts.executable);
  assert.equal(
    result.failed,
    0,
    `${target} failed cases: ${result.failedIds.join(", ")}; evidence: ${result.outputRoot}`,
  );
  assert.equal(result.graphBoundaryViolations, 0);
  assert.equal(result.runtimeModules, contractSchema.runtimeModules.length);
  assert.equal(result.status, "accepted");
}

test(
  "plugin storage source contract (249 cases)",
  {
    timeout: contractSchema.timeoutsMs.targetOuter,
  },
  async (context) => {
    const result = await runContractTarget({ target: "source", signal: context.signal });
    verifyAccepted(result, "source");
  },
);

test(
  "plugin storage CLI dist contract (249 cases)",
  {
    timeout: contractSchema.timeoutsMs.targetOuter,
  },
  async (context) => {
    const result = await runContractTarget({ target: "dist", signal: context.signal });
    verifyAccepted(result, "dist");
  },
);
