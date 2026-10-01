import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  diffResultFixture,
  result,
  workspace,
  root,
  revOutput,
  deferred,
} from "./git-diff-result-fixture-fast-20261001.js";
import { resolve } from "node:path";
const f = await diffResultFixture();
test("actual reentrant diff request retains both independent effects", async () => {
  let nested!: Promise<unknown>,
    armed = false;
  let s!: ReturnType<typeof f.fixture>;
  s = f.fixture({
    run: (c) => {
      if (c.args[0] === "rev-parse") return result({ stdout: revOutput });
      if (c.args[0] === "diff" && !armed) {
        armed = true;
        nested = s.api.getDiff({ workspacePath: workspace, path: "owned.txt", sourceId: "staged" });
      }
      return result({ stdout: "owned patch" });
    },
  });
  const outer = await s.api.getDiff({
    workspacePath: workspace,
    path: "owned.txt",
    sourceId: "staged",
  });
  assert.deepEqual(await nested, outer);
  assert.equal(s.commands.filter((c) => c.args[0] === "diff").length, 2);
  assert.equal(s.commands.filter((c) => c.args[0] === "show").length, 4);
});
for (const transport of ["service", "RPC"] as const)
  for (const outcome of ["timeout", "truncated", "failure", "empty", "binary", "patch"])
    test(`actual staged diff ${transport}/${outcome}`, async (t) => {
      const r = result({
        stdout:
          outcome === "empty" ? "" : outcome === "binary" ? "GIT binary patch" : "owned patch",
        timedOut: outcome === "timeout",
        outputTruncated: outcome === "truncated",
        exitCode: outcome === "failure" ? 2 : 0,
        stderr: "owned failure",
      });
      const s = f.fixture({
          run: (c) =>
            c.args[0] === "rev-parse"
              ? result({ stdout: revOutput })
              : c.args[0] === "show"
                ? result({ stdout: "owned content" })
                : r,
        }),
        api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      const value = await api.getDiff({
          workspacePath: workspace,
          path: "--owned 文.txt",
          sourceId: "staged",
        }),
        path = resolve(workspace, "--owned 文.txt"),
        expected = f.legacyDiff(path, r, {
          emptySummary: "No Git diff is available for this file.",
        });
      if (expected.availability === "patch") {
        expected.beforeContent = "owned content";
        expected.afterContent = "owned content";
      }
      assert.deepEqual(value, expected);
      assert.deepEqual(s.commands[1]!.args, [
        "diff",
        "--cached",
        "--no-ext-diff",
        "--no-color",
        "--binary",
        "--",
        "sub/--owned 文.txt",
      ]);
      assert.equal(s.commands[1]!.cwd, root);
      assert.equal(s.commands[1]!.timeoutMs, 20000);
      assert.equal(s.commands[1]!.maxOutputBytes, 1048576);
      assert.equal(s.commands.filter((c) => c.args[0] === "show").length, 2);
    });
function loadCallback(url: string, ports: Record<string, unknown>) {
  const text = readFileSync(new URL(url), "utf8"),
    sf = ts.createSourceFile(url, text, ts.ScriptTarget.Latest, true);
  let callback: string | undefined;
  function visit(n: ts.Node) {
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "loadDiffForChange") {
      assert.ok(n.initializer && ts.isCallExpression(n.initializer));
      callback = n.initializer.arguments[0]!.getText(sf);
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
  assert.ok(callback);
  return runInNewContext(
    ts.transpileModule(`(${callback})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } })
      .outputText,
    ports,
  ) as (change: unknown, source: string) => void;
}
for (const stale of [false, true])
  for (const reject of [false, true])
    test(`actual GitPane callback late=${stale} rejection=${reject}`, async (t) => {
      const uiHelpers = await import(f.uiUrl("GitPane/helpers"));
      const gate = deferred<ReturnType<typeof result>>(),
        started = deferred<void>();
      const s = f.fixture({
          run: (c) => {
            if (c.args[0] === "rev-parse") return result({ stdout: revOutput });
            if (c.args[0] === "show") return result({ stdout: "owned content" });
            started.resolve();
            return gate.promise;
          },
        }),
        api = f.remote(t, s.api);
      const pending = { current: new Set<string>() },
        generation = { current: 7 },
        logs: unknown[][] = [],
        requests: Promise<unknown>[] = [];
      let state: Record<string, { loading: boolean; diff: unknown }> = {};
      const callback = loadCallback(f.uiUrl("GitPane"), {
        gitService: {
          getDiff: (p: Parameters<typeof api.getDiff>[0]) => {
            const v = api.getDiff(p);
            requests.push(v);
            return v;
          },
        },
        workspacePath: workspace,
        pendingDiffKeysRef: pending,
        diffGenerationRef: generation,
        diffStateByKey: state,
        getDiffCacheKey: uiHelpers.getDiffCacheKey,
        getErrorMessage: uiHelpers.getErrorMessage,
        logger: {
          debug: (...x: unknown[]) => logs.push(x),
          warn: (...x: unknown[]) => logs.push(x),
        },
        setDiffStateByKey: (update: (s: typeof state) => typeof state) => {
          state = update(state);
        },
      });
      const change = { path: resolve(workspace, "owned.txt"), diff: null };
      callback(change, "last-turn");
      assert.equal(requests.length, 0);
      callback(change, "staged");
      callback(change, "staged");
      await started.promise;
      assert.equal(requests.length, 1);
      assert.equal(pending.current.size, 1);
      if (stale) generation.current++;
      if (reject) gate.reject(new Error("owned rejected diff"));
      else gate.resolve(result({ stdout: "owned patch" }));
      await Promise.allSettled(requests);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      assert.equal(pending.current.size, 0);
      const value = Object.values(state)[0]!;
      assert.equal(value.loading, stale);
      assert.equal(logs.length, stale ? 0 : 1);
      if (!stale)
        assert.equal(
          (value.diff as { availability: string }).availability,
          reject ? "unavailable" : "patch",
        );
    });
