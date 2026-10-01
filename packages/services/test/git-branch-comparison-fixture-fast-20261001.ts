// Exact copied method is test-only; reuse existing owned fake ports and status owner.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  localBranchesFixture,
  workspace,
  root,
  result,
  revOutput,
  statusOutput,
  deferred,
} from "./git-local-branches-fixture-fast-20261001.js";
export { workspace, root, result, revOutput, statusOutput, deferred };
export const comparisonOutput = "3\t0\tsub/owned.txt\0";
export const isComparison = (args: string[]) =>
  args[0] === "diff" && args.some((a) => a.endsWith("...HEAD"));
export async function branchComparisonFixture() {
  const f = await localBranchesFixture();
  const oracle = JSON.parse(
    readFileSync(
      new URL("./git-branch-comparison-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(oracle.commit, "af419c933205d68f31c3a56c2d259ebed65dc632");
  assert.equal(oracle.spans.length, 1);
  const span = oracle.spans[0];
  assert.equal(createHash("sha256").update(span.text).digest("hex"), span.sha256);
  const code = ts.transpileModule(
    `function frozen(commandProvider){return {${span.text}}.getBranchComparison;}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const helpers = await import(f.url("git/repo/gitCliHelpers")),
    config = await import(f.url("git/config"));
  const frozen = new Function(
    "ensureGitCommandSucceeded",
    "parseNumstat",
    "inferKindFromNumstat",
    "DEFAULT_GIT_COMMAND_TIMEOUT_MS",
    "DEFAULT_GIT_OUTPUT_BYTES",
    code + ";return frozen;",
  )(
    helpers.ensureGitCommandSucceeded,
    helpers.parseNumstat,
    helpers.inferKindFromNumstat,
    config.DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    config.DEFAULT_GIT_OUTPUT_BYTES,
  );
  function fixture(options: Parameters<typeof f.fixture>[0] = {}, legacy = false) {
    const s = f.fixture({
      ...options,
      run:
        options.run ??
        ((c) =>
          result({
            stdout:
              c.args[0] === "rev-parse"
                ? revOutput
                : c.args[0] === "status"
                  ? statusOutput
                  : isComparison(c.args)
                    ? comparisonOutput
                    : "",
          })),
    });
    if (legacy) s.repo.getBranchComparison = frozen(s.provider);
    return s;
  }
  function status() {
    const s = f.status();
    s.resolution.workspaceInRepoPath = "sub";
    s.summary.workspaceInRepoPath = "sub";
    s.summary.trackingBranchName = "owned-remote/main";
    return s;
  }
  return { ...f, fixture, status };
}
