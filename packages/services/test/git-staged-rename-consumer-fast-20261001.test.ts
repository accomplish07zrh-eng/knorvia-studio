// Requested future commit consumer gap: every mutation/temp IO port is fake.
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  diffReadFixture,
  answer,
  result,
  root,
  workspace,
} from "./git-diff-read-fixture-fast-20261001.js";
const f = await diffReadFixture();
test("actual service staged-only selected rename retains original cleanup path with fake mutation ports", async () => {
  const selected = "sub/--renamed 文.txt",
    original = "sub/--original 文.txt";
  const s = f.fixture({
    commitFixture: true,
    run: (c) => {
      if (c.args[0] === "status")
        return result({
          stdout: `2 R. ${Array(7).fill("owned").join(" ")} ${selected}\0${original}\0`,
        });
      if (c.args[0] === "ls-files")
        return result({ stdout: `100644 owned-object 0\t${selected}\0` });
      if (c.args[0] === "rev-parse" && c.args[1] === "--verify")
        return result({ stdout: "owned-parent\n" });
      if (c.args[0] === "rev-parse" && c.args[1] === "HEAD")
        return result({ stdout: "owned-committed-hash\n" });
      return answer(c);
    },
  });
  const output = await s.api.commit({
    workspacePath: workspace,
    message: "  feat: owned rename  ",
    paths: ["--renamed 文.txt"],
    stagedOnly: true,
  });
  assert.deepEqual(output, {
    commitHash: "owned-committed-hash",
    summary: {
      workspacePath: workspace,
      repoRoot: root,
      workspaceInRepoPath: "sub",
      autoRefreshWatchPaths: [{ path: resolve(root, ".git"), recursive: true }],
      branchName: null,
      trackingBranchName: null,
      headRefType: "branch",
      ahead: 0,
      behind: 0,
      isDirty: true,
      isGitAvailable: true,
      isRepository: true,
    },
  });
  assert.deepEqual(
    s.commands.map((c) => c.args),
    [
      ["rev-parse", "--show-toplevel", "--show-prefix", "--absolute-git-dir", "--git-common-dir"],
      ["status", "--porcelain=v2", "-z", "--", selected],
      ["ls-files", "--stage", "-z", "--", selected],
      ["rev-parse", "--verify", "HEAD"],
      ["read-tree", "owned-parent"],
      ["update-index", "--force-remove", "--", selected, original],
      ["update-index", "--add", "--cacheinfo", "100644", "owned-object", selected],
      ["commit", "-m", "feat: owned rename"],
      ["rev-parse", "HEAD"],
      ["reset", "--quiet", "HEAD", "--", selected, original],
      ["rev-parse", "--show-toplevel", "--show-prefix", "--absolute-git-dir", "--git-common-dir"],
      ["status", "--porcelain=v2", "--branch", "--untracked-files=all", "-z"],
      ["diff", "--cached", "--numstat", "-z", "--find-renames", "--"],
      ["diff", "--numstat", "-z", "--find-renames", "--"],
    ],
  );
  for (const c of s.commands.filter((c) =>
    ["read-tree", "update-index", "commit"].includes(c.args[0]!),
  ))
    assert.deepEqual(c.env, { GIT_INDEX_FILE: resolve(root, "owned-temp-index", "index") });
  assert.equal(s.commands.find((c) => c.args[0] === "reset")?.env, undefined);
  assert.ok(
    s.trace.some(
      (x) => Array.isArray(x) && x[0] === "rm" && x[1] === resolve(root, "owned-temp-index"),
    ),
  );
  assert.equal(
    s.commands.some((c) => c.args[0] === "add" || c.args.includes("--all")),
    false,
  );
});
