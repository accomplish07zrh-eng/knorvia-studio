// SPDX-License-Identifier: Apache-2.0
// apps-cli-packages-01 合同测试：context/*（B60–B70）。
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { load } from "./entry.mjs";

const run = promisify(execFile);
const gitSnapshot = await load("context/git-snapshot");
const contextIndex = await load("context/index");

async function tempDir(t, prefix = "knorvia-contract-context-") {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  t.after(async () => await rm(directory, { recursive: true, force: true }));
  return directory;
}

async function git(cwd, args) {
  return await run("git", args, { cwd, windowsHide: true });
}

async function initRepo(t) {
  const root = await tempDir(t, "knorvia-contract-git-");
  await git(root, ["init"]);
  await git(root, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  await git(root, ["config", "user.name", "Knorvia Fixture"]);
  await git(root, ["config", "user.email", "fixture@example.invalid"]);
  await writeFile(join(root, "tracked.txt"), "fixture\n");
  await git(root, ["add", "."]);
  await git(root, ["-c", "commit.gpgsign=false", "commit", "-m", "fixture commit"]);
  return root;
}

test("B60 git 快照只跑只读命令且失败被吞", async (t) => {
  const root = await tempDir(t);
  const snapshot = await gitSnapshot.resolveGitSnapshot(root);
  assert.equal(snapshot.isGitRepository, false);
  assert.equal(snapshot.gitStatus, "not_repo");
  const missing = await gitSnapshot.resolveGitSnapshot(join(root, "does-not-exist"));
  assert.equal(missing.isGitRepository, false);
  const repo = await initRepo(t);
  const before = (await git(repo, ["status", "--short"])).stdout;
  const repoSnapshot = await gitSnapshot.resolveGitSnapshot(repo);
  const after = (await git(repo, ["status", "--short"])).stdout;
  assert.equal(repoSnapshot.isGitRepository, true);
  assert.equal(before, after);
});

test("B61 仓库快照字段与 dirty/clean 判定", async (t) => {
  const repo = await initRepo(t);
  const clean = await gitSnapshot.resolveGitSnapshot(repo);
  assert.equal(clean.isGitRepository, true);
  assert.equal(clean.gitBranch, "main");
  assert.equal(clean.gitStatus, "clean");
  assert.deepEqual(clean.gitStatusLines, []);
  assert.equal(clean.recentCommits.length, 1);
  assert.match(clean.recentCommits[0], /^[0-9a-f]+ fixture commit$/u);
  assert.equal(clean.gitUser, "Knorvia Fixture");
  await writeFile(join(repo, "untracked.txt"), "x\n");
  const dirty = await gitSnapshot.resolveGitSnapshot(repo);
  assert.equal(dirty.gitStatus, "dirty");
  assert.equal(
    dirty.gitStatusLines.some((line) => line.startsWith("?? ") && line.includes("untracked.txt")),
    true,
  );
});

test("B62 git status 的 2k 截断与平台提示", async (t) => {
  const repo = await initRepo(t);
  const platformTool = process.platform === "win32" ? "PowerShell" : "Bash";
  for (let index = 0; index < 160; index += 1) {
    await writeFile(join(repo, `untracked-file-${String(index).padStart(4, "0")}.txt`), "x");
  }
  const snapshot = await gitSnapshot.resolveGitSnapshot(repo);
  assert.equal(snapshot.gitStatus, "dirty");
  assert.equal(
    snapshot.gitStatusLines.some((line) => line.length === 0),
    false,
  );
  assert.equal(
    snapshot.gitStatusLines[snapshot.gitStatusLines.length - 1],
    `... (truncated because it exceeds 2k characters. If you need more information, run "git status" using ${platformTool})`,
  );
});

test("B63 主分支候选顺序：origin/HEAD → main → master → 兜底 main", async (t) => {
  const repo = await initRepo(t);
  const fallback = await gitSnapshot.resolveGitSnapshot(repo);
  assert.equal(fallback.gitMainBranch, "main");
  await git(repo, ["update-ref", "refs/remotes/origin/master", "HEAD"]);
  const master = await gitSnapshot.resolveGitSnapshot(repo);
  assert.equal(master.gitMainBranch, "master");
  await git(repo, ["update-ref", "refs/remotes/origin/trunk", "HEAD"]);
  await git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"]);
  const trunk = await gitSnapshot.resolveGitSnapshot(repo);
  assert.equal(trunk.gitMainBranch, "trunk");
});

test("B64 NodeContextSourceAdapter 的快照装配与请求覆盖", async (t) => {
  const root = await tempDir(t);
  const adapter = contextIndex.createNodeContextSourceAdapter({ env: {} });
  assert.equal(adapter instanceof contextIndex.NodeContextSourceAdapter, true);
  const envInfo = {
    cwd: root,
    platform: "fixture",
    shell: "fixture",
    osVersion: "fixture",
    nodeVersion: "fixture",
  };
  const projectContext = { type: "node" };
  const fixedDate = "2026-01-02T03:04:05.000Z";
  const result = await adapter.resolveContextSources({
    workingDirectory: root,
    envInfo,
    projectContext,
    currentDate: fixedDate,
  });
  assert.equal(result.envInfo, envInfo);
  assert.equal(result.projectContext, projectContext);
  assert.equal(result.currentDate, fixedDate);
  assert.equal(result.workingDirectory, resolve(root));
  assert.deepEqual(result.diagnostics, []);
  const generated = await contextIndex
    .createNodeContextSourceAdapter({ env: {} })
    .resolveContextSources({ workingDirectory: root });
  assert.equal(typeof generated.currentDate, "string");
  assert.equal(generated.currentDate.length >= 10, true);
});

test("B65 detectEnvInfo 的 shell 与版本字段", async (t) => {
  const root = await tempDir(t);
  const byShell = await contextIndex
    .createNodeContextSourceAdapter({ env: { SHELL: "/bin/zsh" } })
    .resolveContextSources({ workingDirectory: root });
  assert.equal(byShell.envInfo.shell, "zsh");
  assert.equal(byShell.envInfo.cwd, resolve(root));
  assert.equal(byShell.envInfo.platform, process.platform);
  assert.equal(byShell.envInfo.nodeVersion, process.version);
  assert.equal(byShell.envInfo.isGitRepository, false);
  const byDisplay = await contextIndex
    .createNodeContextSourceAdapter({ env: {} })
    .resolveContextSources({ workingDirectory: root, effectiveShellDisplayName: "knorvia-shell" });
  assert.equal(byDisplay.envInfo.shell, "knorvia-shell");
  const byComSpec = await contextIndex
    .createNodeContextSourceAdapter({ env: { ComSpec: "/bin/other-shell" } })
    .resolveContextSources({ workingDirectory: root });
  assert.equal(byComSpec.envInfo.shell, basename("/bin/other-shell"));
  const byUnknown = await contextIndex
    .createNodeContextSourceAdapter({ env: {} })
    .resolveContextSources({ workingDirectory: root });
  assert.equal(byUnknown.envInfo.shell, "unknown");
});

test("B66 用户指令发现顺序与合并", async (t) => {
  const home = await tempDir(t);
  const project = await tempDir(t, "knorvia-contract-proj-");
  await mkdir(join(project, ".git"), { recursive: true });
  await writeFile(join(project, "AGENTS.md"), "workspace instructions");
  const nested = join(project, "src", "deep");
  await mkdir(nested, { recursive: true });
  await writeFile(join(home, "AGENTS.md"), "user instructions");
  const adapter = contextIndex.createNodeContextSourceAdapter({ env: { KNORVIA_HOME: home } });
  const result = await adapter.resolveContextSources({
    workingDirectory: nested,
    userInstructions: {},
  });
  assert.equal(result.userInstructions.sources.length, 2);
  assert.equal(result.userInstructions.content, "user instructions\n\nworkspace instructions");
  assert.equal(result.userInstructions.filePath, join(project, "AGENTS.md"));
  assert.equal(result.userInstructions.sources[0].scope, "user");
  assert.equal(result.userInstructions.sources[1].scope, "workspace");
  assert.equal(result.userInstructions.truncated, false);
  const noPriorityMatch = await adapter.resolveContextSources({
    workingDirectory: nested,
    userInstructions: { priorityFiles: ["OTHER.md"] },
  });
  assert.equal(noPriorityMatch.userInstructions, undefined);
  await writeFile(join(project, "OTHER.md"), "other");
  const withOther = await adapter.resolveContextSources({
    workingDirectory: nested,
    userInstructions: { priorityFiles: ["OTHER.md"] },
  });
  assert.equal(withOther.userInstructions.filePath, join(project, "OTHER.md"));
  assert.equal(withOther.userInstructions.sources.length, 1);
});

test("B67 指令内容按字节截断", async (t) => {
  const home = await tempDir(t);
  const project = await tempDir(t, "knorvia-contract-proj-");
  await mkdir(join(project, ".git"), { recursive: true });
  await writeFile(join(project, "AGENTS.md"), "abcdefghijklmnopqrst");
  const adapter = contextIndex.createNodeContextSourceAdapter({ env: { KNORVIA_HOME: home } });
  const result = await adapter.resolveContextSources({
    workingDirectory: project,
    userInstructions: { maxBytes: 8 },
  });
  assert.equal(result.userInstructions.truncated, true);
  assert.equal(result.userInstructions.content.length, 8);
  assert.equal(result.userInstructions.bytesRead, 8);
  assert.equal(result.userInstructions.sizeBytes, 20);
});

test("B68 项目根标记与项目类型探测", async (t) => {
  const root = await tempDir(t, "knorvia-contract-proj-");
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { build: "x" } }));
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: 1\n");
  await writeFile(join(root, "Dockerfile"), "FROM scratch\n");
  const nested = join(root, "a", "b");
  await mkdir(nested, { recursive: true });
  const adapter = contextIndex.createNodeContextSourceAdapter({ env: {} });
  const result = await adapter.resolveContextSources({ workingDirectory: nested });
  assert.equal(result.projectContext.type, "node");
  assert.deepEqual(result.projectContext.scripts, { build: "x" });
  assert.equal(result.projectContext.packageManager, "pnpm");
  assert.deepEqual(result.projectContext.buildFiles, ["Dockerfile"]);
  const rustRoot = await tempDir(t, "knorvia-contract-proj-");
  await mkdir(join(rustRoot, ".git"), { recursive: true });
  await writeFile(join(rustRoot, "Cargo.toml"), "[package]\n");
  const rust = await adapter.resolveContextSources({ workingDirectory: rustRoot });
  assert.equal(rust.projectContext.type, "rust");
  assert.equal(rust.projectContext.packageManager, undefined);
  assert.equal(rust.projectContext.buildFiles, undefined);
  const emptyRoot = await tempDir(t, "knorvia-contract-proj-");
  await mkdir(join(emptyRoot, ".git"), { recursive: true });
  const empty = await adapter.resolveContextSources({ workingDirectory: emptyRoot });
  assert.equal(empty.projectContext.type, "unknown");
});

test("B69/B70 context 导出面：barrel 与 git-snapshot", async () => {
  assert.deepEqual(Object.keys(contextIndex).sort(), [
    "NodeContextSourceAdapter",
    "createNodeContextSourceAdapter",
  ]);
  assert.equal(contextIndex.resolveUserInstructions, undefined);
  assert.equal(contextIndex.detectProjectContext, undefined);
  assert.equal(contextIndex.findProjectRoot, undefined);
  assert.deepEqual(Object.keys(gitSnapshot), ["resolveGitSnapshot"]);
  const instance = contextIndex.createNodeContextSourceAdapter({ env: {} });
  assert.equal(instance instanceof contextIndex.NodeContextSourceAdapter, true);
  assert.equal(
    typeof (await gitSnapshot.resolveGitSnapshot(process.cwd())).isGitRepository,
    "boolean",
  );
});
