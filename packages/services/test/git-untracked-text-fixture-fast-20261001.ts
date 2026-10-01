// Owned fake reads; copied baseline declarations are a disclosed test oracle.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { diffReadFixture } from "./git-diff-read-fixture-fast-20261001.js";

export async function untrackedTextFixture() {
  const f = await diffReadFixture();
  const helpers = await import(f.url("git/repo/gitCliHelpers"));
  const source = readFileSync(new URL(f.url("git/repo/gitCliHelpers")), "utf8");
  const sf = ts.createSourceFile("owned-helper.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = sf.statements.find(
    (n): n is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(n) && n.name?.text === "splitUntrackedText",
  );
  assert.ok(declaration);
  const oracle = JSON.parse(
    readFileSync(
      new URL("./git-untracked-text-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(oracle.commit, "73321fd442d9474685cde06afd1af6d11201872b");
  assert.equal(oracle.copiedExposedTestOnly, true);
  assert.deepEqual(
    oracle.spans.map((s: { name: string }) => s.name),
    ["splitUntrackedText", "buildUntrackedTextDiffResult"],
  );
  for (const s of oracle.spans)
    assert.equal(createHash("sha256").update(s.text).digest("hex"), s.sha256);
  const compile = (text: string, exports: string, bindings: Record<string, unknown> = {}) => {
    const js = ts.transpileModule(text.replace(/^export /gm, ""), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    return new Function(...Object.keys(bindings), js + `;return {${exports}};`)(
      ...Object.values(bindings),
    );
  };
  const currentSplit = compile(declaration.getText(sf), "splitUntrackedText").splitUntrackedText;
  const legacy = compile(
    oracle.spans.map((s: { text: string }) => s.text).join("\n"),
    "splitUntrackedText,buildUntrackedTextDiffResult",
    { readFile: f.fs.readFile, normalizeGitPath: f.config.normalizeGitPath },
  );
  return { ...f, helpers, currentSplit, legacy };
}
