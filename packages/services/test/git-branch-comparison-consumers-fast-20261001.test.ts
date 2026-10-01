import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  branchComparisonFixture,
  result,
  workspace,
  root,
  revOutput,
  statusOutput,
  isComparison,
} from "./git-branch-comparison-fixture-fast-20261001.js";
import { resolve } from "node:path";
const f = await branchComparisonFixture();
const stdout = [
  "2\t0\tsub/b",
  "0\t1\tsub/a",
  "9\t9\toutside/file",
  "1\t1\t",
  "outside/old",
  "sub/new",
  "",
].join("\0");
function datasetBuilder(url: string) {
  assert.match(url, /\/(?:src|dist)\/hooks\/useGitRepository\.(?:ts|js)$/);
  const source = readFileSync(new URL(url), "utf8"),
    sf = ts.createSourceFile(url, source, ts.ScriptTarget.Latest, true),
    functions = new Map<string, string>();
  let order: string | undefined;
  function visit(n: ts.Node) {
    if (
      ts.isFunctionDeclaration(n) &&
      n.name &&
      ["toPaneFileChange", "buildSectionsForSource", "buildRepositoryDatasets"].includes(
        n.name.text,
      )
    )
      functions.set(n.name.text, n.getText(sf));
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "SECTION_ORDER_BY_SOURCE")
      order = n.getText(sf);
    ts.forEachChild(n, visit);
  }
  visit(sf);
  assert.equal(functions.size, 3);
  assert.ok(order);
  const code = ts.transpileModule(
    `const ${order};${[...functions.values()].join("\n")}buildRepositoryDatasets;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  return runInNewContext(code, { Map, Set }, { filename: url }) as (options: unknown) => {
    branch: {
      readonly: boolean;
      comparisonLabel: unknown;
      sections: { changes: { path: string; workspaceRelativePath: string; diff: unknown }[] }[];
    };
  };
}
for (const transport of ["service", "RPC"] as const)
  for (const outcome of ["changes", "unavailable", "rejected"] as const)
    test(`actual comparison ${transport} ${outcome}`, async (t) => {
      const s = f.fixture({
        binary: () => (outcome === "unavailable" ? null : "owned"),
        run: (c) =>
          result({
            stdout:
              c.args[0] === "rev-parse"
                ? revOutput
                : c.args[0] === "status"
                  ? statusOutput
                  : isComparison(c.args)
                    ? stdout
                    : "",
            exitCode: isComparison(c.args) && outcome === "rejected" ? 128 : 0,
            stderr: "owned comparison failure",
          }),
      });
      const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      if (outcome === "rejected")
        await assert.rejects(api.getBranchComparison({ workspacePath: workspace }), {
          message: "git diff --numstat upstream...HEAD failed: owned comparison failure",
        });
      else {
        const value = await api.getBranchComparison({ workspacePath: workspace });
        if (outcome === "unavailable") assert.deepEqual(value.changes, []);
        else {
          assert.deepEqual(
            value.changes.map((x) => x.workspaceRelativePath),
            ["b", "a", "new"],
          );
          assert.deepEqual(
            value.changes.map((x) => x.path),
            [resolve(root, "sub/b"), resolve(root, "sub/a"), resolve(root, "sub/new")],
          );
          assert.equal(value.changes[2]!.kind, "renamed");
        }
      }
    });
for (const transport of ["service", "RPC"] as const)
  for (const include of [false, true])
    test(`actual refresh/dataset ${transport} branch=${include}`, async (t) => {
      const s = f.fixture({
        run: (c) =>
          result({
            stdout:
              c.args[0] === "rev-parse"
                ? revOutput
                : c.args[0] === "status"
                  ? statusOutput
                  : isComparison(c.args)
                    ? stdout
                    : "",
          }),
      });
      const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      const value = await api.refresh({
        workspacePath: workspace,
        includeIdentity: false,
        includeBranchComparison: include,
      });
      assert.equal(s.commands.filter((c) => c.args[0] === "status").length, 1);
      assert.equal(s.commands.filter((c) => isComparison(c.args)).length, include ? 1 : 0);
      assert.equal(value.identity, null);
      if (include) {
        assert.ok(value.branchComparison);
        const builder = datasetBuilder(f.uiUrl("hooks/useGitRepository")),
          datasets = builder({
            unstagedChanges: value.unstagedChanges,
            stagedChanges: value.stagedChanges,
            branchComparison: value.branchComparison,
          });
        assert.equal(datasets.branch.readonly, true);
        assert.equal(datasets.branch.comparisonLabel, "owned-main -> owned-remote/main");
        assert.deepEqual(
          Array.from(datasets.branch.sections[0]!.changes, (x) => x.workspaceRelativePath),
          ["a", "b", "new"],
        );
        assert.ok(datasets.branch.sections[0]!.changes.every((x) => x.diff === null));
        assert.equal(value.branchComparison.changes[0]!.workspaceRelativePath, "b");
      } else assert.equal(value.branchComparison, null);
    });
test("actual comparison service getter/receiver forwarding", async () => {
  const s = f.fixture(),
    trace: unknown[] = [];
  s.repo.getBranchComparison = async function (w) {
    assert.equal(this, s.repo);
    trace.push(w);
    return {
      resolution: f.status().resolution,
      baseRef: null,
      headRef: "HEAD",
      comparisonLabel: null,
      changes: [],
    };
  };
  const p = new Proxy(
    { workspacePath: workspace },
    {
      get(t, k) {
        trace.push(k);
        return Reflect.get(t, k);
      },
    },
  );
  assert.deepEqual((await s.api.getBranchComparison(p)).changes, []);
  assert.deepEqual(trace, ["workspacePath", workspace]);
});
