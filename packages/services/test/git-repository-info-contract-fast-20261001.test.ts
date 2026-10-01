import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  entry,
  resolutionFixture,
  result,
  root,
  workspace,
} from "./git-repository-resolution-fixture-fast-20261001.js";
const f = await resolutionFixture();
const info = (kind: string, available = true) => ({
  workspacePath: workspace,
  kind,
  isGitAvailable: available,
});
const fail = new Error("owned metadata failure");
test("directory wins over file and never reads; output/property order", async () => {
  const trace: unknown[] = [];
  const s = f.fixture({ stat: () => entry(true, true, trace) });
  const value = await s.repo.getWorkspaceRepositoryInfo(workspace);
  assert.deepEqual(value, info("main-tree"));
  assert.deepEqual(Object.keys(value), ["workspacePath", "kind", "isGitAvailable"]);
  assert.deepEqual(trace, ["directory"]);
  assert.deepEqual(s.trace, ["binary", ["run", workspace], ["stat", resolve(root, ".git")]]);
});
for (const binary of [null, ""])
  test(`unavailable ${String(binary)} skips metadata`, async () => {
    const s = f.fixture({ binary: () => binary, stat: () => assert.fail("stat must be absent") });
    assert.deepEqual(
      await s.repo.getWorkspaceRepositoryInfo(workspace),
      info("not-repository", false),
    );
  });
test("nonrepo skips metadata with Git available", async () => {
  assert.deepEqual(
    await f
      .fixture({
        run: () => result({ exitCode: 128, stderr: "not a git repository" }),
        stat: () => assert.fail("stat must be absent"),
      })
      .repo.getWorkspaceRepositoryInfo(workspace),
    info("not-repository"),
  );
});
const cases: [string, string][] = [
  ["gitdir: /owned/.git/worktrees/one\n", "linked-worktree"],
  [" gitdir: ../.git/worktrees/one \r\nignored\r\n", "linked-worktree"],
  ["gitdir: C:\\owned\\.git\\worktrees\\one\r\n", "linked-worktree"],
  ["gitdir: /owned/.git/worktrees/", "linked-worktree"],
  ["gitdir: /owned/.git/worktrees", "main-tree"],
  ["gitdir: /owned/.git/WORKTREES/one", "main-tree"],
  ["gitdir: /owned/.git/modules/one", "main-tree"],
  ["gitdir: /owned/separate-dir", "main-tree"],
  ["gitdir: .git/worktrees/one", "linked-worktree"],
  ["gitdir: ", "main-tree"],
  ["gitdir:", "main-tree"],
  ["Gitdir: /owned/.git/worktrees/one", "main-tree"],
  ["GITDIR: /owned/.git/worktrees/one", "main-tree"],
  ["gitdir : /owned/.git/worktrees/one", "main-tree"],
  ["\ngitdir: /owned/.git/worktrees/one", "main-tree"],
  ["owned first\ngitdir: /owned/.git/worktrees/one", "main-tree"],
  ["gitdir: /owned/.git/worktrees/中文🚀\0literal", "linked-worktree"],
  ["gitdir: /owned/.git/worktrees/one\rignored", "linked-worktree"],
];
for (const [content, kind] of cases)
  test(`first-line metadata ${JSON.stringify(content)}`, async () => {
    const calls: unknown[] = [];
    const s = f.fixture({
      stat: () => entry(false, true, calls),
      read: (path, encoding) => {
        assert.equal(path, resolve(root, ".git"));
        assert.equal(encoding, "utf-8");
        return content;
      },
    });
    assert.deepEqual(await s.repo.getWorkspaceRepositoryInfo(workspace), info(kind));
    assert.deepEqual(calls, ["directory", "file"]);
    assert.deepEqual(s.trace.slice(2), [
      ["stat", resolve(root, ".git")],
      ["read", resolve(root, ".git"), "utf-8"],
    ]);
  });
for (const port of ["stat", "read"] as const)
  for (const mode of ["throw", "reject", "thenable"] as const)
    test(`fail-open ${port} ${mode}`, async () => {
      const bad = () => {
        if (mode === "throw") throw fail;
        if (mode === "reject") return Promise.reject(fail);
        return {
          then(_yes: unknown, no: (e: unknown) => void) {
            no(fail);
          },
        };
      };
      const s = f.fixture({ stat: () => entry(false, true), [port]: bad });
      assert.deepEqual(await s.repo.getWorkspaceRepositoryInfo(workspace), info("main-tree"));
      assert.equal(s.commands.length, 1);
    });
for (const stage of [
  "directory getter",
  "directory call",
  "file getter",
  "file call",
  "null stat",
  "content replace",
])
  test(`fail-open malformed metadata ${stage}`, async () => {
    let value: unknown = entry(false, true);
    if (stage === "null stat") value = null;
    if (stage.includes("getter"))
      Object.defineProperty(value, stage.startsWith("directory") ? "isDirectory" : "isFile", {
        get() {
          throw fail;
        },
      });
    if (stage.includes("call"))
      Object.assign(value as object, {
        [stage.startsWith("directory") ? "isDirectory" : "isFile"]: () => {
          throw fail;
        },
      });
    const s = f.fixture({
      stat: () => value,
      read: () => ({
        replace() {
          throw fail;
        },
      }),
    });
    assert.deepEqual(await s.repo.getWorkspaceRepositoryInfo(workspace), info("main-tree"));
  });
test("special stat type avoids content read and falls open", async () => {
  const s = f.fixture({
    stat: () => entry(false, false),
    read: () => assert.fail("read forbidden"),
  });
  assert.deepEqual(await s.repo.getWorkspaceRepositoryInfo(workspace), info("main-tree"));
});
for (const port of ["resolution", "availability", "repository", "root"])
  test(`outside metadata catch ${port} remains rejection`, async () => {
    const s = f.fixture();
    s.repo.resolveRepository = async function (path) {
      assert.equal(this, s.repo);
      assert.equal(path, workspace);
      if (port === "resolution") throw fail;
      const r = {
        workspacePath: workspace,
        repoRoot: root,
        workspaceInRepoPath: ".",
        autoRefreshWatchPaths: [],
        isGitAvailable: true,
        isRepository: true,
      };
      Object.defineProperty(
        r,
        port === "availability"
          ? "isGitAvailable"
          : port === "repository"
            ? "isRepository"
            : "repoRoot",
        {
          get() {
            throw fail;
          },
        },
      );
      return r;
    };
    await assert.rejects(s.repo.getWorkspaceRepositoryInfo(workspace), (e) => e === fail);
    assert.deepEqual(s.trace, []);
  });
test("resolution getter short-circuit/repeated availability order is retained", async () => {
  const s = f.fixture();
  const trace: string[] = [];
  s.repo.resolveRepository = async function () {
    assert.equal(this, s.repo);
    return new Proxy(
      { isGitAvailable: false, isRepository: true },
      {
        get(t, k) {
          trace.push(String(k));
          return Reflect.get(t, k);
        },
      },
    ) as never;
  };
  assert.deepEqual(
    await s.repo.getWorkspaceRepositoryInfo(workspace),
    info("not-repository", false),
  );
  assert.deepEqual(trace, ["then", "isGitAvailable", "isGitAvailable"]);
});
test("live resolution getter order occurs before stat; stat methods keep receiver", async () => {
  const s = f.fixture();
  const trace: string[] = [];
  s.repo.resolveRepository = async function () {
    return new Proxy(
      { isGitAvailable: true, isRepository: true, repoRoot: root },
      {
        get(t, k) {
          trace.push(String(k));
          return Reflect.get(t, k);
        },
      },
    ) as never;
  };
  assert.deepEqual(await s.repo.getWorkspaceRepositoryInfo(workspace), info("main-tree"));
  assert.deepEqual(trace, ["then", "isGitAvailable", "isRepository", "repoRoot"]);
});
