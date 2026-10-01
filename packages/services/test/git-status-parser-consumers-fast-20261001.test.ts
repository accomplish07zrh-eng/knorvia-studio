import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ordinary,
  statusParserFixture,
  result,
  workspace,
  revOutput,
  deferred,
} from "./git-status-parser-fixture-fast-20261001.js";
const f = await statusParserFixture();
const stdout = [
  "# branch.head owned",
  "# branch.upstream remote/main",
  "# branch.ab +2 -3",
  ordinary("1", "A.", "sub/staged.txt"),
  ordinary("2", ".R", "sub/renamed.txt"),
  "sub/old.txt",
  ordinary("u", "UU", "sub/conflict.txt"),
  "? sub/dir/",
  "",
].join("\0");
const run = (c: { args: string[] }) =>
  result({
    stdout:
      c.args[0] === "rev-parse"
        ? revOutput
        : c.args[0] === "status"
          ? stdout
          : c.args.includes("--cached")
            ? "4\t1\tsub/staged.txt\0"
            : "2\t3\tsub/renamed.txt\0",
  });
test("actual getStatus entry/header decoding, stats and exact argv", async () => {
  const s = f.fixture({ run }),
    v = await s.repo.getStatus(workspace);
  assert.deepEqual(v.entries, f.legacy(stdout).entries);
  assert.equal(v.summary.branchName, "owned");
  assert.equal(v.summary.ahead, 2);
  assert.equal(v.summary.behind, 3);
  assert.deepEqual(
    s.commands.slice(1).map((c) => c.args),
    [
      ["status", "--porcelain=v2", "--branch", "--untracked-files=all", "-z"],
      ["diff", "--cached", "--numstat", "-z", "--find-renames", "--"],
      ["diff", "--numstat", "-z", "--find-renames", "--"],
    ],
  );
  assert.ok(s.commands.slice(1).every((c) => c.timeoutMs === 15000 && c.maxOutputBytes === 524288));
  assert.deepEqual(v.untrackedStats.get("sub/dir/"), { added: 0, removed: 0 });
});
for (const transport of ["service", "RPC"] as const)
  test(`actual refresh ${transport} status projection, directory and rename scope`, async (t) => {
    const s = f.fixture({ run }),
      api = transport === "RPC" ? f.remote(t, s.api) : s.api;
    const v = await api.refresh({
      workspacePath: workspace,
      includeIdentity: false,
      includeBranchComparison: false,
    });
    assert.equal(v.summary.branchName, "owned");
    assert.equal(v.summary.isDirty, true);
    assert.deepEqual(
      v.stagedChanges.map((x) => [x.workspaceRelativePath, x.section, x.added, x.removed]),
      [["staged.txt", "staged", 4, 1]],
    );
    assert.deepEqual(
      v.unstagedChanges.map((x) => [x.workspaceRelativePath, x.section, x.added, x.removed]),
      [
        ["renamed.txt", "unstaged", 2, 3],
        ["conflict.txt", "conflicted", 0, 0],
        ["dir/", "untracked", 0, 0],
      ],
    );
    assert.equal(s.commands.filter((c) => c.args[0] === "status").length, 1);
  });
for (const failed of ["status", "cached", "unstaged"])
  test(`actual status error prose/retirement ${failed}`, async () => {
    let fail = true;
    const s = f.fixture({
      run: (c) =>
        (failed === "status"
          ? c.args[0] === "status"
          : failed === "cached"
            ? c.args.includes("--cached")
            : c.args[0] === "diff" && !c.args.includes("--cached")) && fail
          ? result({ exitCode: 128, stderr: "owned failure" })
          : run(c),
    });
    const label =
      failed === "status"
        ? "git status"
        : failed === "cached"
          ? "git diff --cached --numstat"
          : "git diff --numstat";
    await assert.rejects(s.repo.getStatus(workspace), {
      message: `${label} failed: owned failure`,
    });
    fail = false;
    assert.deepEqual((await s.repo.getStatus(workspace)).entries, f.legacy(stdout).entries);
    assert.equal(s.commands.filter((c) => c.args[0] === "status").length, 2);
  });
test("actual same-key queued and reentrant requests share one status effect", async () => {
  const gate = deferred<ReturnType<typeof result>>(),
    ready = deferred<void>();
  let queued!: Promise<unknown>,
    s!: ReturnType<typeof f.fixture>,
    armed = false;
  s = f.fixture({
    run: (c) => {
      if (c.args[0] === "status") {
        if (!armed) {
          armed = true;
          queued = s.repo.getStatus(workspace);
          ready.resolve();
        }
        return gate.promise;
      }
      return run(c);
    },
  });
  const first = s.repo.getStatus(workspace);
  await ready.promise;
  const next = Promise.resolve().then(() => s.repo.getStatus(workspace));
  gate.resolve(result({ stdout }));
  await Promise.all([first, queued, next]);
  assert.equal(s.commands.filter((c) => c.args[0] === "status").length, 1);
});
for (const rejected of [false, true])
  test(`actual invalidation/late status result rejected=${rejected}`, async () => {
    const old = deferred<ReturnType<typeof result>>(),
      next = deferred<ReturnType<typeof result>>(),
      oldReady = deferred<void>(),
      nextReady = deferred<void>();
    let count = 0;
    const s = f.fixture({
      run: (c) => {
        if (c.args[0] !== "status") return run(c);
        if (++count === 1) {
          oldReady.resolve();
          return old.promise;
        }
        nextReady.resolve();
        return next.promise;
      },
    });
    const a = s.repo.getStatus(workspace).then(
      (v) => v.entries,
      (e) => e.message,
    );
    await oldReady.promise;
    s.repo.invalidate(workspace);
    const b = s.repo.getStatus(workspace);
    await nextReady.promise;
    if (rejected) old.reject(new Error("owned late"));
    else old.resolve(result({ stdout }));
    await a;
    const shared = s.repo.getStatus(workspace);
    next.resolve(result({ stdout }));
    assert.equal((await b).entries.length, 4);
    assert.equal((await shared).entries.length, 4);
    assert.equal(count, 2);
  });
