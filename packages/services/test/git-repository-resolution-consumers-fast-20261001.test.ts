import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deferred,
  entry,
  resolutionFixture,
  result,
  revArgs,
  root,
  workspace,
} from "./git-repository-resolution-fixture-fast-20261001.js";
const f = await resolutionFixture();
for (const transport of ["service", "RPC"] as const)
  for (const kind of ["main-tree", "linked-worktree", "not-repository"] as const)
    test(`actual ${transport} info ${kind}`, async (t) => {
      const s = f.fixture({
        binary: () => (kind === "not-repository" ? null : "owned"),
        stat: () => entry(false, true),
        read: () =>
          kind === "linked-worktree"
            ? "gitdir: /owned/.git/worktrees/one"
            : "gitdir: /owned/separate",
      });
      const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
      assert.deepEqual(
        await api.getWorkspaceRepositoryInfo({
          workspacePath: workspace,
          workspaceIdentity: "owned identity",
        } as never),
        { workspacePath: workspace, kind, isGitAvailable: kind !== "not-repository" },
      );
      assert.equal(s.commands.length, kind === "not-repository" ? 0 : 1);
    });
for (const transport of ["service", "RPC"] as const)
  test(`actual ${transport} info propagates resolver failure prose and retry`, async (t) => {
    let n = 0;
    const s = f.fixture({
      run: () =>
        n++ === 0 ? result({ exitCode: 128, stderr: "owned command failure" }) : result(),
    });
    const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
    await assert.rejects(api.getWorkspaceRepositoryInfo({ workspacePath: workspace }), {
      message: "git rev-parse failed: owned command failure",
    });
    assert.equal(
      (await api.getWorkspaceRepositoryInfo({ workspacePath: workspace })).kind,
      "main-tree",
    );
    assert.equal(n, 2);
  });
for (const transport of ["service", "RPC"] as const)
  test(`actual ${transport} summary/identity/info concurrent unavailable admission`, async (t) => {
    const gate = deferred<string | null>(),
      s = f.fixture({ binary: () => gate.promise });
    const api = transport === "RPC" ? f.remote(t, s.api) : s.api;
    const a = api.getRepositorySummary({ workspacePath: workspace }),
      b = api.getIdentity({ workspacePath: workspace }),
      c = api.getWorkspaceRepositoryInfo({ workspacePath: workspace });
    // RPC delivery uses owned microtasks. A fourth direct request shares admission.
    const d = s.repo.resolveRepository(workspace);
    gate.resolve(null);
    const [summary, identity, info, resolution] = await Promise.all([a, b, c, d]);
    assert.equal(summary.isRepository, false);
    assert.equal(summary.repoRoot, workspace);
    assert.deepEqual(identity, {
      userName: null,
      userEmail: null,
      nameSource: null,
      emailSource: null,
      scopeLabel: null,
    });
    assert.equal(info.kind, "not-repository");
    assert.equal(resolution.isGitAvailable, false);
    assert.equal(s.commands.length, 0);
  });
const readResult = (args: string[]) => {
  if (args[0] === "rev-parse") return result();
  if (args[0] === "status") return result({ stdout: "# branch.head owned-main\n" });
  if (args[0] === "diff") return result({ stdout: "" });
  if (args[0] === "config")
    return result({
      stdout: `local\tfile:owned-config\t${args.at(-1) === "user.name" ? "Owned author" : "owned@example.invalid"}\n`,
    });
  assert.fail(`unowned command ${args.join(" ")}`);
};
for (const transport of ["service", "RPC"] as const)
  test(`actual ${transport} refresh resolution and identity effects/output`, async (t) => {
    const s = f.fixture({ run: (c) => readResult(c.args) }),
      api = transport === "RPC" ? f.remote(t, s.api) : s.api;
    const value = await api.refresh({
      workspacePath: workspace,
      includeIdentity: true,
      includeBranchComparison: false,
    });
    assert.equal(value.summary.repoRoot, root);
    assert.equal(value.summary.workspaceInRepoPath, "subdir");
    assert.equal(value.identity?.userName, "Owned author");
    assert.equal(value.identity?.userEmail, "owned@example.invalid");
    assert.deepEqual(value.stagedChanges, []);
    assert.deepEqual(value.unstagedChanges, []);
    assert.equal(value.branchComparison, null);
    assert.equal(s.commands.filter((c) => c.args[0] === "rev-parse").length, 1);
    assert.deepEqual(s.commands[0], { cwd: workspace, args: revArgs, timeoutMs: 15000 });
    assert.ok(s.commands.slice(1).every((c) => c.cwd === root));
    assert.ok(s.trace.every((v) => !Array.isArray(v) || !["stat", "read"].includes(String(v[0]))));
  });
test("actual service forwarding keeps receiver and workspace getter/error order", async () => {
  const s = f.fixture(),
    trace: string[] = [];
  s.repo.getWorkspaceRepositoryInfo = async function (path) {
    assert.equal(this, s.repo);
    trace.push(path);
    return { workspacePath: path, kind: "main-tree", isGitAvailable: true };
  };
  const request = new Proxy(
    { workspacePath: workspace },
    {
      get(t, k) {
        trace.push(String(k));
        return Reflect.get(t, k);
      },
    },
  );
  assert.equal((await s.api.getWorkspaceRepositoryInfo(request)).workspacePath, workspace);
  assert.deepEqual(trace, ["workspacePath", workspace]);
});
test("actual UI branch assist reads staged/unstaged and identity through supported service", async () => {
  const { buildGitBranchSwitchAssistState } = await import(
    f.uiUrl("git-branch-switcher/switchAssist")
  );
  const s = f.fixture({ run: (c) => readResult(c.args) });
  const value = await buildGitBranchSwitchAssistState({
    gitService: s.api,
    workspacePath: workspace,
    result: {
      action: "switch",
      status: "blocked",
      branchName: "owned-next",
      summary: { branchName: "owned-main" },
      issues: [
        { code: "tracked-changes-would-be-overwritten", message: "owned blocked", paths: [] },
      ],
    },
  } as never);
  assert.ok(value);
  assert.equal(value.identity?.userName, "Owned author");
  assert.deepEqual(value.commitFiles, []);
  assert.equal(s.commands.filter((c) => c.args[0] === "rev-parse").length, 1);
});
