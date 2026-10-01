import assert from "node:assert/strict";
import { test } from "node:test";
import {
  scopeFixture,
  entry,
  snapshot,
  workspace,
  root,
  deferred,
} from "./commit-message-file-scope-fixture-fast-20261001.js";
import { resolve } from "node:path";
const f = await scopeFixture();

for (const includeUnstaged of [false, true])
  test(`actual service/RPC filters before first-eight diff window: unstaged=${includeUnstaged}`, async (t) => {
    const status = snapshot(Array.from({ length: 12 }, (_, i) => entry({ path: `work/${i}.txt` })));
    const diffs = Array.from({ length: 8 }, () => deferred<any>()),
      trace: string[] = [],
      queries: any[] = [],
      generated: any[] = [],
      admitted = deferred<void>();
    const result = { message: "fix: owned scoped change", providerId: "owned", model: "owned" };
    const generator = {
      generate(params: any) {
        assert.equal(this, generator);
        trace.push("generate");
        generated.push(params);
        return Promise.resolve(result);
      },
    };
    const s = f.service({
      status,
      generator: generator as any,
      ports: {
        getDiff(query) {
          trace.push(`diff:${queries.length}`);
          queries.push(query);
          if (queries.length === 8) admitted.resolve();
          return diffs[queries.length - 1]!.promise;
        },
      },
    });
    // All eight fake requests must be acquired before any settlement can publish.
    const remote = f.remote(t, s.api);
    const completion = remote.generateCommitMessage({
      workspacePath: workspace,
      workspaceIdentity: "owned-scope-identity",
      locale: "en-US",
      includeUnstaged,
      currentSessionFilePaths: Array.from({ length: 10 }, (_, i) => `${11 - i}.txt`),
    });
    await admitted.promise;
    assert.deepEqual(
      queries,
      Array.from({ length: 8 }, (_, i) => ({
        workspacePath: workspace,
        path: resolve(root, "work", `${i + 2}.txt`),
        sourceId: includeUnstaged ? "unstaged" : "staged",
      })),
    );
    assert.equal(generated.length, 0);
    diffs[7]!.resolve({ path: "owned-last", patch: "owned late patch", summary: null });
    for (let i = 6; i >= 1; i--)
      diffs[i]!.resolve({
        path: `owned-${i}`,
        patch: i === 3 ? "owned patch" : null,
        summary: i === 4 ? "owned summary" : null,
      });
    diffs[0]!.reject(new Error("owned rejected diff"));
    assert.deepEqual(await completion, result);
    assert.deepEqual(trace, [...Array.from({ length: 8 }, (_, i) => `diff:${i}`), "generate"]);
    assert.equal(generated.length, 1);
    assert.deepEqual(
      generated[0].files.map((v: any) => [v.workspaceRelativePath, v.section]),
      [
        ...(includeUnstaged
          ? Array.from({ length: 10 }, (_, i) => [`${i + 2}.txt`, "unstaged"])
          : []),
        ...Array.from({ length: 10 }, (_, i) => [`${i + 2}.txt`, "staged"]),
      ],
    );
    assert.deepEqual(
      generated[0].diffs.map((v: any) => v.path),
      ["owned-3", "owned-4", "owned-last"],
    );
    assert.equal(generated[0].workspaceIdentity, "owned-scope-identity");
    assert.equal(generated[0].locale, "en-US");
  });

test("actual service excludes unmatched files before any diff/generator effect", async () => {
  const s = f.service({
    generator: { generate: async () => assert.fail("no unmatched generation") } as any,
    ports: {
      getDiff: async () => assert.fail("no unmatched diff"),
    },
  });
  await assert.rejects(
    s.api.generateCommitMessage({
      workspacePath: workspace,
      currentSessionFilePaths: ["outside-owned.txt"],
    }),
    { message: "There are no changes available to commit." },
  );
  assert.deepEqual(s.trace, ["status"]);
});
