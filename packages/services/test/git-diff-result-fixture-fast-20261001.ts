// Exposed exact inherited oracle; owned ports reuse prior lane conventions.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { statusParserFixture } from "./git-status-parser-fixture-fast-20261001.js";
export {
  result,
  deferred,
  root,
  workspace,
  revOutput,
} from "./git-status-parser-fixture-fast-20261001.js";
export async function diffResultFixture() {
  const dist = process.env.KNORVIA_GIT_RESOLUTION_TARGET === "dist";
  const f = await statusParserFixture();
  const url = (name: string) =>
    new URL(`../${dist ? "dist" : "src"}/${name}.${dist ? "js" : "ts"}`, import.meta.url).href;
  const uiUrl = (name: string) =>
    new URL(
      `../../ui/${dist ? "dist" : "src"}/${name}.${dist ? "js" : name === "GitPane" ? "tsx" : "ts"}`,
      import.meta.url,
    ).href;
  const helpers = await import(url("git/repo/gitCliHelpers"));
  const x = JSON.parse(
    readFileSync(new URL("./git-diff-result-legacy-fast-20261001.json", import.meta.url), "utf8"),
  );
  assert.equal(x.commit, "78df1ba980fbb6e903a34407498daba40f164b8c");
  assert.equal(x.spans.length, 3);
  for (const s of x.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const code = ts.transpileModule(
    x.spans.map((s: { text: string }) => s.text.replace(/^export /, "")).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const legacy = new Function(code + ";return toDiffResult;")() as typeof helpers.toDiffResult;
  return { ...f, url, uiUrl, toDiff: helpers.toDiffResult, legacyDiff: legacy };
}
