// Exact exposed legacy oracle and owned lexical path adapters; no filesystem IO ports.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript";
import { projectionFixture } from "./git-read-projection-fixture-fast-20261001.js";
export { entry, snapshot, workspace, root } from "./git-read-projection-fixture-fast-20261001.js";
export { deferred } from "./git-repository-resolution-fixture-fast-20261001.js";

export async function scopeFixture() {
  const f = await projectionFixture();
  const target = f.url("git/commitMessageFileScope");
  const current = await import(target);
  const config = await import(f.url("git/config"));
  const oracle = JSON.parse(
    readFileSync(
      new URL("./commit-message-file-scope-legacy-fast-20261001.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(oracle.commit, "9cacedbe01156417db17ca2925f0a5c705dde4d9");
  assert.equal(oracle.copiedExposedTestOnly, true);
  assert.equal(createHash("sha256").update(oracle.source).digest("hex"), oracle.sha256);
  function load(source: string, paths: Pick<typeof path, "isAbsolute" | "relative">) {
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: any = {};
    new Function("exports", "require", js)(exports, (name: string) => {
      if (name === "node:path") return paths;
      if (name === "./config.js") return config;
      assert.fail(`unowned scope dependency: ${name}`);
    });
    return exports.filterCommitMessageFilesByCurrentSession as typeof current.filterCommitMessageFilesByCurrentSession;
  }
  return {
    ...f,
    current: current.filterCommitMessageFilesByCurrentSession,
    legacy: load(oracle.source, path),
    dialect(name: "posix" | "win32", legacy = false) {
      return load(legacy ? oracle.source : readFileSync(new URL(target), "utf8"), path[name]);
    },
  };
}
