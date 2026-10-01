// Synthetic snapshot ports; the exact old method is an exposed test-only oracle.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import type { GitCliRepo } from "../src/git/repo/gitCliTypes.js";
import {
  projectionFixture,
  snapshot,
  comparison,
  workspace,
} from "./git-read-projection-fixture-fast-20261001.js";
export { snapshot, comparison, workspace };
export { deferred } from "./git-repository-resolution-fixture-fast-20261001.js";

export async function frozenRefresh(url: (name: string) => string) {
  const oracle = JSON.parse(
    readFileSync(new URL("./git-refresh-frame-legacy-fast-20261001.json", import.meta.url), "utf8"),
  );
  assert.equal(oracle.commit, "8571700ae9a7b8c8a19b5b742a19a6220d0b14ea");
  assert.equal(oracle.copiedExposedTestOnly, true);
  assert.equal(oracle.spans.length, 1);
  assert.equal(oracle.spans[0].name, "refresh");
  assert.equal(
    createHash("sha256").update(oracle.spans[0].text).digest("hex"),
    oracle.spans[0].sha256,
  );
  const projections = await import(url("git/gitServiceReadProjection"));
  const js = ts.transpileModule(`function bind(repo){return {${oracle.spans[0].text}}.refresh;}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function("getBranchComparisonChanges", "getChangesForSource", js + ";return bind;")(
    projections.getBranchComparisonChanges,
    projections.getChangesForSource,
  ) as (repo: GitCliRepo) => (params: unknown) => Promise<unknown>;
}

export async function refreshFrameFixture() {
  const f = await projectionFixture(),
    bind = await frozenRefresh(f.url);
  const { createGitService } = await import(f.url("git/gitService"));
  function fixture(
    legacy: boolean,
    hooks: Partial<Record<"getStatus" | "getIdentity" | "getBranchComparison", () => unknown>> = {},
  ) {
    const trace: string[] = [],
      status = snapshot(),
      branch = comparison();
    const identity = {
      userName: "Owned author",
      userEmail: "owned@example.invalid",
      nameSource: "local",
      emailSource: "local",
      scopeLabel: "owned",
    };
    const defaults = { getStatus: status, getIdentity: identity, getBranchComparison: branch };
    const methods = Object.fromEntries(
      Object.keys(defaults).map((name) => [
        name,
        function (this: unknown, path: string) {
          assert.equal(this, repo);
          assert.equal(path, workspace);
          trace.push(name);
          const hook = hooks[name as keyof typeof hooks];
          return hook ? hook() : Promise.resolve(defaults[name as keyof typeof defaults]);
        },
      ]),
    );
    const repo = new Proxy(methods, {
      get(target, key) {
        if (key in target) return target[key as string];
        return () => assert.fail(`unowned refresh repo/fs/process/mutation port: ${String(key)}`);
      },
    }) as unknown as GitCliRepo;
    const api = createGitService({ repo });
    if (legacy) api.refresh = bind(repo) as typeof api.refresh;
    return { api, repo, status, branch, identity, trace };
  }
  return { ...f, fixture, bind };
}
