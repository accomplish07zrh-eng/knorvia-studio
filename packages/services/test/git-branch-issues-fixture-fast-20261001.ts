// Three exact exposed oracle declarations; existing owned fake ports stay immutable.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import {
  diffReadFixture,
  result,
  deferred,
  answer,
  workspace,
  root,
  revOutput,
} from "./git-diff-read-fixture-fast-20261001.js";
export { result, deferred, workspace, root, revOutput };
export const tracked =
  "Your local changes to the following files would be overwritten by checkout:";
export const untracked =
  "The following untracked working tree files would be overwritten by switch:";
export async function branchIssuesFixture() {
  const f = await diffReadFixture(),
    helpers = await import(f.url("git/repo/gitCliHelpers"));
  const config = await import(f.url("git/config"));
  const oracle = JSON.parse(
    readFileSync(new URL("./git-branch-issues-legacy-fast-20261001.json", import.meta.url), "utf8"),
  );
  assert.equal(oracle.commit, "3168a3826201250fa6f43c909c05f0be5f608799");
  assert.equal(oracle.spans.length, 3);
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const code = ts.transpileModule(
    oracle.spans.map((s: { text: string }) => s.text.replace(/^export /, "")).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const legacy = new Function("normalizeGitPath", code + ";return parseGitBranchMutationIssues;")(
    config.normalizeGitPath,
  ) as typeof helpers.parseGitBranchMutationIssues;
  function fixture(failure: ReturnType<typeof result> | (() => unknown)) {
    return f.fixture({
      run: (c) => {
        if (c.args[0] === "switch") return typeof failure === "function" ? failure() : failure;
        if (c.args[0] === "rev-parse" && c.args.includes("--git-path"))
          return result({ stdout: "" });
        if (c.args[0] === "check-ref-format") return result({ stdout: "" });
        return answer(c);
      },
    });
  }
  return { ...f, fixture, parse: helpers.parseGitBranchMutationIssues, legacy };
}
