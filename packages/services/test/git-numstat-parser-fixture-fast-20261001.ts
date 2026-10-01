// Exact inherited oracle in test memory; reuse owned status/RPC fake ports.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { statusParserFixture } from "./git-status-parser-fixture-fast-20261001.js";
export {
  ordinary,
  result,
  deferred,
  root,
  workspace,
  revOutput,
} from "./git-status-parser-fixture-fast-20261001.js";
export async function numstatParserFixture() {
  const dist = process.env.KNORVIA_GIT_RESOLUTION_TARGET === "dist";
  const f = await statusParserFixture();
  const url = (name: string) =>
    new URL(`../${dist ? "dist" : "src"}/${name}.${dist ? "js" : "ts"}`, import.meta.url).href;
  const helpers = await import(url("git/repo/gitCliHelpers")),
    config = await import(url("git/config"));
  const oracle = JSON.parse(
    readFileSync(
      new URL("./git-numstat-parser-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(oracle.commit, "14f7f5a5c1b7a70d22a2e51703bed1964097134d");
  assert.equal(oracle.spans.length, 2);
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const code = ts.transpileModule(
    oracle.spans.map((s: { text: string }) => s.text.replace(/^export /, "")).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const legacy = new Function("normalizeGitPath", code + ";return parseNumstat;")(
    config.normalizeGitPath,
  ) as typeof helpers.parseNumstat;
  return {
    ...f,
    parseNumstat: helpers.parseNumstat,
    legacyNumstat: legacy,
    inferKind: helpers.inferKindFromNumstat,
  };
}
