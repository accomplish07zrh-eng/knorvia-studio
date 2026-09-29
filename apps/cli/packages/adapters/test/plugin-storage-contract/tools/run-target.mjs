// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { resolve } from "node:path";
import { parseArguments } from "../harness/arguments.mjs";
import { defaultAdapterRoot, defaultRepoRoot } from "../harness/build-world.mjs";
import { runContractTarget } from "../harness/runner.mjs";

const args = parseArguments(process.argv.slice(2));
if (args.target !== "source" && args.target !== "dist") {
  throw new Error("Usage: run-target.mjs --target source|dist [--output-root ABSOLUTE_PATH]");
}

try {
  const result = await runContractTarget({
    adapterRoot:
      typeof args["adapter-root"] === "string" ? resolve(args["adapter-root"]) : defaultAdapterRoot,
    outputRoot: typeof args["output-root"] === "string" ? resolve(args["output-root"]) : undefined,
    repoRoot: typeof args["repo-root"] === "string" ? resolve(args["repo-root"]) : defaultRepoRoot,
    target: args.target,
  });
  console.log(
    JSON.stringify({
      target: result.target,
      status: result.status,
      total: result.total,
      passed: result.passed,
      failed: result.failed,
      failedIds: result.failedIds,
      graphInputs: result.graphInputs,
      graphBoundaryViolations: result.graphBoundaryViolations,
      runtimeModules: result.runtimeModules,
      summaryPath: result.summaryPath,
    }),
  );
  if (result.status !== "accepted") process.exitCode = 1;
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
