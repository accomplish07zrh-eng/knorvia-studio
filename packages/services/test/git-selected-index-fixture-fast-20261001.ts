// Two exposed frozen expressions and actual private source/emitted projections.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";
import { diffReadFixture } from "./git-diff-read-fixture-fast-20261001.js";
export {
  result,
  answer,
  root,
  workspace,
  deferred,
} from "./git-diff-read-fixture-fast-20261001.js";

export async function selectedIndexFixture() {
  const f = await diffReadFixture();
  const target = f.url("git/repo/gitCliRepo");
  const text = readFileSync(new URL(target), "utf8");
  const sf = ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true);
  const functions = new Map<string, string>();
  let cleanup = "";
  function visit(n: ts.Node) {
    if (ts.isFunctionDeclaration(n) && n.name) functions.set(n.name.text, n.getText(sf));
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "cleanupRepoPaths")
      cleanup = n.initializer!.getText(sf);
    ts.forEachChild(n, visit);
  }
  visit(sf);
  const oracle = JSON.parse(
    readFileSync(
      new URL("./git-selected-index-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(oracle.commit, "55dd11383bb14e892a2be38993bd26c57249fc51");
  assert.equal(oracle.copiedExposedTestOnly, true);
  for (const p of Object.values(oracle.pieces) as { text: string; sha256: string }[])
    assert.equal(createHash("sha256").update(p.text).digest("hex"), p.sha256);
  function compile(source: string, name: string) {
    const js = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function("normalizeGitPath", js + `;return ${name};`)(
      f.config.normalizeGitPath,
    ) as any;
  }
  const cleanupFunction = (expression: string) =>
    `function collect(repoPaths,readEntries){const scopedStatusResult={stdout:"owned literal status"};const parseStatusPorcelain=()=>({entries:readEntries()});return ${expression};}`;
  return {
    ...f,
    parse: compile(functions.get("parseGitIndexEntries")!, "parseGitIndexEntries"),
    legacyParse: compile(oracle.pieces.parser.text, "parseGitIndexEntries"),
    cleanup: functions.has("collectSelectedCommitPaths")
      ? compile(functions.get("collectSelectedCommitPaths")!, "collectSelectedCommitPaths")
      : compile(cleanupFunction(cleanup), "collect"),
    legacyCleanup: compile(cleanupFunction(oracle.pieces.cleanup.text), "collect"),
  };
}
