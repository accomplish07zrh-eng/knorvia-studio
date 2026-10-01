import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  localBranchesFixture,
  result,
  workspace,
  revOutput,
  statusOutput,
  branchOutput,
  deferred,
} from "./git-local-branches-fixture-fast-20261001.js";
const f = await localBranchesFixture();
function callback(url: string, closure: Record<string, unknown>) {
  assert.match(url, /\/(?:src|dist)\/hooks\/useGitBranchSwitcher\.(?:ts|js)$/);
  const text = readFileSync(new URL(url), "utf8"),
    sf = ts.createSourceFile(url, text, ts.ScriptTarget.Latest, true);
  let expression: string | undefined;
  function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "loadBranches") {
      assert.ok(n.initializer && ts.isCallExpression(n.initializer));
      assert.equal(n.initializer.expression.getText(sf), "useCallback");
      expression = n.initializer.arguments[0]!.getText(sf);
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  assert.ok(expression);
  const compiled = ts.transpileModule(`const callback=${expression};callback;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(compiled, closure, { filename: url }) as () => Promise<void>;
}
for (const transport of ["service", "RPC"] as const)
  for (const outcome of ["records", "unavailable", "rejected"] as const)
    test(`actual local branch ${transport} ${outcome}`, async (t) => {
      const s = f.fixture({
        binary: () => (outcome === "unavailable" ? null : "owned"),
        run: (c) =>
          result({
            stdout:
              c.args[0] === "rev-parse"
                ? revOutput
                : c.args[0] === "status"
                  ? statusOutput
                  : c.args[0] === "for-each-ref"
                    ? branchOutput
                    : "",
            exitCode: c.args[0] === "for-each-ref" && outcome === "rejected" ? 1 : 0,
            stderr: "owned branch failure",
          }),
      });
      const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      if (outcome === "rejected")
        await assert.rejects(api.getLocalBranches({ workspacePath: workspace }), {
          message: "git for-each-ref refs/heads failed: owned branch failure",
        });
      else {
        const value = await api.getLocalBranches({ workspacePath: workspace });
        assert.equal(value.branches.length, outcome === "unavailable" ? 0 : 1);
        if (outcome === "records") assert.equal(value.branches[0]!.isCurrent, true);
      }
    });
test("actual service receiver and getter order", async () => {
  const s = f.fixture(),
    trace: unknown[] = [];
  s.repo.listLocalBranches = async function (w) {
    assert.equal(this, s.repo);
    trace.push(w);
    return { branches: [], headRefType: "unknown", currentBranchName: null };
  };
  await s.api.getLocalBranches(
    new Proxy(
      { workspacePath: workspace },
      {
        get(t, k) {
          trace.push(k);
          return Reflect.get(t, k);
        },
      },
    ),
  );
  assert.deepEqual(trace, ["workspacePath", workspace]);
});
for (const transport of ["service", "RPC"] as const)
  for (const rejected of [false, true])
    test(`actual branch hook ${transport} delayed/rejected=${rejected}`, async (t) => {
      const gate = deferred<ReturnType<typeof result>>(),
        start = deferred<void>();
      const s = f.fixture({
        run: (c) => {
          if (c.args[0] === "for-each-ref") {
            start.resolve();
            return gate.promise;
          }
          return result({
            stdout:
              c.args[0] === "rev-parse" ? revOutput : c.args[0] === "status" ? statusOutput : "",
          });
        },
      });
      const api = transport === "RPC" ? f.remote(t, s.api) : s.api,
        events: unknown[] = [];
      const load = callback(f.uiUrl("hooks/useGitBranchSwitcher"), {
        workspacePath: workspace,
        gitService: api,
        setLoadingBranches: (v: boolean) => events.push(["loading", v]),
        setBranchesResult: (v: unknown) => events.push(["result", v]),
        getErrorMessage: (e: Error) => e.message,
        logger: { warn: (...args: unknown[]) => events.push(["warn", ...args]) },
        toast: (v: unknown) => events.push(["toast", v]),
        intl: { formatMessage: (id: unknown, values: unknown) => [id, values] },
      });
      const pending = load();
      await start.promise;
      assert.deepEqual(events, [["loading", true]]);
      gate.resolve(
        result({
          stdout: branchOutput,
          exitCode: rejected ? 128 : 0,
          stderr: "owned hook failure",
        }),
      );
      await pending;
      assert.deepEqual(events.at(-1), ["loading", false]);
      if (rejected) {
        const value = JSON.parse(JSON.stringify(events));
        assert.deepEqual(value[1], [
          "warn",
          "[GitBranchSwitcher] 读取本地分支失败",
          {
            workspacePath: workspace,
            error: "git for-each-ref refs/heads failed: owned hook failure",
          },
        ]);
        assert.deepEqual(value[2], [
          "toast",
          [
            { id: "git.branchSwitcher.error.requestFailed" },
            { error: "git for-each-ref refs/heads failed: owned hook failure" },
          ],
        ]);
      } else assert.equal((events[1] as [string, { branches: unknown[] }])[1].branches.length, 1);
    });
