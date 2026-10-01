// Exposed baseline oracle; all product ports reuse the owned resolution fixture.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { resolutionFixture } from "./git-repository-resolution-fixture-fast-20261001.js";
export {
  result,
  deferred,
  workspace,
  revArgs,
} from "./git-repository-resolution-fixture-fast-20261001.js";
export async function commandResultFixture() {
  const f = await resolutionFixture(),
    helpers = await import(f.url("git/repo/gitCliHelpers")),
    oracle = JSON.parse(
      readFileSync(
        new URL("./git-command-result-legacy-fast-20261001.json", import.meta.url),
        "utf8",
      ),
    );
  assert.equal(oracle.commit, "61ee435296989cc4cbf4a2913ec22264af1ece6c");
  assert.equal(oracle.copiedExposedTestOnly, true);
  assert.deepEqual(
    oracle.spans.map((s: { name: string }) => s.name),
    ["toResultMessage", "ensureGitCommandSucceeded"],
  );
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const compiled = ts.transpileModule(
    oracle.spans.map((s: { text: string }) => s.text.replace(/^export /, "")).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const legacyEnsure = new Function(
    compiled + ";return ensureGitCommandSucceeded;",
  )() as typeof helpers.ensureGitCommandSucceeded;
  return { ...f, helpers, ensure: helpers.ensureGitCommandSucceeded, legacyEnsure };
}
