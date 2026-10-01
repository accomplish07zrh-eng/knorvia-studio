// Opt-in Linux Git acceptance; only self-created temporary repositories are mutated for setup.
// Product service calls are read-only, with no remote or real user repository.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
assert.equal(process.platform, "linux");
const mode = process.argv[2] ?? "source";
assert.ok(["source", "dist"].includes(mode));
const owned = mkdtempSync(join(tmpdir(), "knorvia-git-native-"));
try {
  const repo = join(owned, "repo"),
    home = join(owned, "home");
  for (const p of [repo, home, join(repo, "inside"), join(repo, "outside")])
    mkdirSync(p, { recursive: true });
  process.env = {
    PATH: "/usr/bin:/bin",
    HOME: home,
    SHELL: "/bin/sh",
    LANG: "C.UTF-8",
    GIT_CONFIG_NOSYSTEM: "1",
    TSX_TSCONFIG_PATH: join(root, "packages/ui/tsconfig.json"),
  };
  const git = (...args) =>
    execFileSync("/usr/bin/git", ["-C", repo, ...args], {
      env: process.env,
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const put = (p, text) => writeFileSync(join(repo, p), text);
  git("init", "-b", "main");
  put("inside/change.txt", "one\n");
  put("inside/rename-old.txt", "rename payload\n");
  put("inside/cross-old.txt", "cross scope payload\n");
  put("outside/ignore.txt", "outside\n");
  git("add", ".");
  git(
    "-c",
    "user.name=Owned Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "owned base",
  );
  git("switch", "-c", "feature");
  put("inside/branch.txt", "branch\n");
  put("outside/branch.txt", "outside branch\n");
  git("add", ".");
  git(
    "-c",
    "user.name=Owned Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-m",
    "owned branch",
  );
  git("branch", "--set-upstream-to=main", "feature");
  put("inside/change.txt", "one\ntwo\n");
  put("outside/ignore.txt", "outside\nmodified\n");
  put("inside/staged.txt", "staged\n");
  git("add", "inside/staged.txt");
  git("mv", "inside/rename-old.txt", "inside/renamed.txt");
  git("mv", "inside/cross-old.txt", "outside/cross-new.txt");
  put("inside/untracked.txt", "new content\n");
  put("inside/empty.txt", "");
  const before = {
    head: git("rev-parse", "HEAD"),
    status: git("status", "--porcelain=v2", "-z"),
    files: [
      "inside/change.txt",
      "outside/ignore.txt",
      "inside/staged.txt",
      "inside/renamed.txt",
      "inside/untracked.txt",
      "inside/empty.txt",
      "outside/cross-new.txt",
    ].map((p) => [p, readFileSync(join(repo, p), "utf8")]),
  };
  const { createGitService } = await import(
    pathToFileURL(
      join(
        root,
        "packages/services",
        mode === "dist" ? "dist" : "src",
        `git/gitService.${mode === "source" ? "ts" : "js"}`,
      ),
    ).href
  );
  const { ProxyChannel } = await import(
    pathToFileURL(join(root, "packages/rpc", mode === "dist" ? "dist/index.js" : "src/index.ts"))
      .href
  );
  const service = createGitService(),
    workspacePath = join(repo, "inside");
  const unstaged = await service.getChanges({ workspacePath, sourceId: "unstaged" }),
    staged = await service.getChanges({ workspacePath, sourceId: "staged" }),
    branch = await service.getBranchComparison({ workspacePath });
  const paths = (rows) => rows.map((r) => r.repoRelativePath).sort();
  assert.deepEqual(paths(unstaged), ["inside/change.txt", "inside/untracked.txt"]);
  assert.deepEqual(paths(staged), [
    "inside/renamed.txt",
    "inside/staged.txt",
    "outside/cross-new.txt",
  ]);
  assert.deepEqual(paths(branch.changes), ["inside/branch.txt"]);
  assert.equal(branch.baseRef, "main");
  assert.equal(branch.headRef, "feature");
  for (const row of [...unstaged, ...staged, ...branch.changes]) {
    if (row.repoRelativePath === "outside/cross-new.txt") {
      // Retained config returns repo-relative fallback for rename destinations outside workspace.
      assert.equal(row.workspaceRelativePath, "outside/cross-new.txt");
    } else {
      assert.equal(row.workspaceRelativePath, relative(workspacePath, row.path));
      assert.ok(row.path.startsWith(workspacePath + "/"));
    }
  }
  const channel = ProxyChannel.fromService(service);
  const remote = ProxyChannel.toService({
    call: (command, args) => channel.call("owned native Git RPC", command, args),
    listen: (event, args) => channel.listen("owned native Git RPC", event, args),
  });
  const refresh = await remote.refresh({
    workspacePath,
    includeIdentity: false,
    includeBranchComparison: true,
  });
  assert.deepEqual(refresh.unstagedChanges, unstaged);
  assert.deepEqual(refresh.stagedChanges, staged);
  assert.deepEqual(refresh.branchComparison, branch);
  assert.equal(refresh.identity, null);
  assert.equal(refresh.summary.isGitAvailable, true);
  assert.equal(refresh.summary.isRepository, true);
  assert.equal(refresh.summary.workspaceInRepoPath, "inside");
  const diff = await remote.getDiff({
    workspacePath,
    path: join(repo, "inside/change.txt"),
    sourceId: "unstaged",
  });
  assert.match(diff.patch, /\+two/);
  assert.equal(git("rev-parse", "HEAD"), before.head);
  assert.equal(git("status", "--porcelain=v2", "-z"), before.status);
  for (const [p, text] of before.files) assert.equal(readFileSync(join(repo, p), "utf8"), text);
  console.log(
    JSON.stringify({
      mode,
      gitVersion: git("--version").trim(),
      unstaged: paths(unstaged),
      staged: paths(staged),
      branch: paths(branch.changes),
      unrelatedOutsideExcluded: true,
      originalPathRenameScopeRetained: true,
      emptyUntrackedSuppressed: true,
      renameRetained: true,
      inProcessRpcRefresh: true,
      nativeDiff: true,
      headStatusAndFixtureBytesUnchanged: true,
    }),
  );
} finally {
  rmSync(owned, { recursive: true, force: true });
}
