import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type {
  GitCommandExecutionOptions,
  GitCommandExecutionResult,
} from "../src/git/providers/gitCommandProvider.js";
import type { GitResolvedRepository, GitStatusSnapshot } from "../src/git/repo/gitCliTypes.js";
import { fakeFsPath } from "./fake-native-paths-20261003.js";

test("synthetic CLI writes preserve argv, private-index scope and permission failures", async () => {
  const denied = Object.assign(new Error("owned FS denied"), { code: "EACCES" });
  const cleanupDenied = Object.assign(new Error("owned cleanup denied"), { code: "EPERM" });
  const fsTrace: unknown[][] = [];
  let denyMkdir = false;
  let denyCleanup = false;
  const forbidden = () => assert.fail("unapproved real Git or file port");
  mock.module("node:fs/promises", {
    namedExports: {
      access: async () => {
        throw denied;
      },
      open: forbidden,
      readFile: forbidden,
      realpath: async (p: string) => p,
      stat: async () => {
        throw denied;
      },
      mkdir: async (...args: unknown[]) => {
        fsTrace.push(["mkdir", ...args]);
        if (denyMkdir) throw denied;
      },
      mkdtemp: async (p: string) => {
        fsTrace.push(["mkdtemp", p]);
        return fakeFsPath("/owned data/tmp/git-index-synthetic");
      },
      rm: async (...args: unknown[]) => {
        fsTrace.push(["rm", ...args]);
        if (denyCleanup) throw cleanupDenied;
      },
    },
  });
  mock.module(new URL("../src/paths.ts", import.meta.url).href, {
    namedExports: { getKnorviaDataRootDir: () => fakeFsPath("/owned data") },
  });
  mock.module(new URL("../src/logger/serviceLogger.ts", import.meta.url).href, {
    namedExports: { createServiceLogger: () => ({ warn: forbidden }) },
  });
  mock.module(new URL("../src/git/providers/gitCommandProvider.ts", import.meta.url).href, {
    namedExports: { createGitCommandProvider: forbidden },
  });
  mock.module(new URL("../src/git/config.ts", import.meta.url).href, {
    namedExports: {
      DEFAULT_GIT_COMMAND_TIMEOUT_MS: 15000,
      DEFAULT_GIT_DIFF_TIMEOUT_MS: 20000,
      DEFAULT_GIT_PUSH_TIMEOUT_MS: 600000,
      DEFAULT_GIT_OUTPUT_BYTES: 524288,
      DEFAULT_GIT_DIFF_BYTES: 1048576,
      DEFAULT_GIT_PUSH_OUTPUT_BYTES: 8388608,
      GIT_UNTRACKED_STAT_CHUNK_BYTES: 65536,
      GIT_UNTRACKED_STAT_CONCURRENCY: 4,
      GIT_UNTRACKED_STAT_MAX_BYTES: 1048576,
      getGitNullDevicePath: () => "/dev/null",
      normalizeGitPath: (p: string) => p.replace(/\\/g, "/"),
      normalizeWorkspaceInRepoPath: (p: string) =>
        p.replace(/^\.?\//, "").replace(/\/+$/, "") || ".",
    },
  });
  const { createGitCliRepo } = await import("../src/git/repo/gitCliRepo.js");
  const resolution: GitResolvedRepository = {
    workspacePath: fakeFsPath("/owned root/sub"),
    repoRoot: fakeFsPath("/owned root"),
    workspaceInRepoPath: "sub",
    autoRefreshWatchPaths: [],
    isGitAvailable: true,
    isRepository: true,
  };
  const commands: GitCommandExecutionOptions[] = [];
  let failCommand: string | null = null;
  let rejectCommand: Error | null = null;
  let remoteListing = "";
  const provider = {
    async resolveGitBinary() {
      return "owned fake git";
    },
    async run(command: GitCommandExecutionOptions): Promise<GitCommandExecutionResult> {
      commands.push(command);
      if (rejectCommand) throw rejectCommand;
      let stdout = "";
      if (command.args[0] === "status")
        stdout = "2 R. N... 100644 100644 100644 a b R100 sub/quote ' file\0sub/old path\0";
      if (command.args[0] === "ls-files") stdout = "100644 abc 0\tsub/quote ' file\0";
      if (command.args[0] === "rev-parse")
        stdout = command.args.includes("--verify") ? "parent\n" : "new-hash\n";
      if (command.args[0] === "remote") stdout = remoteListing;
      return {
        binaryPath: "owned fake git",
        cwd: command.cwd,
        args: command.args,
        stdout,
        stderr: failCommand === command.args[0] ? "owned command permission denied" : "",
        exitCode: failCommand === command.args[0] ? 1 : 0,
        signal: null,
        durationMs: 1,
        timedOut: false,
        outputTruncated: false,
      };
    },
  };
  const repo = createGitCliRepo({ commandProvider: provider });
  assert.deepEqual(Object.keys(repo), [
    "invalidate",
    "resolveRepository",
    "getWorkspaceRepositoryInfo",
    "getStatus",
    "getIgnoredPaths",
    "listLocalBranches",
    "getCommitGraph",
    "switchBranch",
    "createBranchAndSwitch",
    "getDiff",
    "getBranchComparison",
    "stage",
    "unstage",
    "discard",
    "commit",
    "push",
    "getIdentity",
  ]);
  repo.resolveRepository = async () => resolution;
  const status: GitStatusSnapshot = {
    resolution,
    summary: {
      workspacePath: resolution.workspacePath,
      repoRoot: resolution.repoRoot,
      workspaceInRepoPath: "sub",
      autoRefreshWatchPaths: [],
      branchName: "owned",
      trackingBranchName: "origin/owned",
      headRefType: "branch",
      ahead: 0,
      behind: 0,
      isDirty: false,
      isGitAvailable: true,
      isRepository: true,
    },
    entries: [],
    stagedStats: new Map(),
    unstagedStats: new Map(),
    untrackedStats: new Map(),
  };
  let statusReads = 0;
  repo.getStatus = async () => {
    statusReads++;
    return status;
  };
  const path = "quote ' file";
  await repo.stage(resolution.workspacePath, [path, path]);
  await repo.unstage(resolution.workspacePath, [path]);
  await repo.discard(resolution.workspacePath, [path], true);
  assert.deepEqual(
    commands.map((c) => c.args),
    [
      ["add", "--", "sub/quote ' file"],
      ["restore", "--staged", "--", "sub/quote ' file"],
      ["restore", "--source=HEAD", "--staged", "--worktree", "--", "sub/quote ' file"],
    ],
  );
  assert.ok(commands.every((c) => c.cwd === fakeFsPath("/owned root") && c.env === undefined));
  commands.length = 0;
  await assert.rejects(
    repo.stage(resolution.workspacePath, ["../../escape"]),
    /outside repository scope/,
  );
  assert.equal(commands.length, 0);
  rejectCommand = denied;
  await assert.rejects(repo.stage(resolution.workspacePath, [path]), (e) => e === denied);
  rejectCommand = null;
  commands.length = 0;

  assert.deepEqual(
    await repo.commit(resolution.workspacePath, "  owned message ' --  ", [path], {
      stagedOnly: true,
    }),
    { commitHash: "new-hash" },
  );
  assert.deepEqual(
    commands.map((c) => c.args),
    [
      ["status", "--porcelain=v2", "-z", "--", "sub/quote ' file"],
      ["ls-files", "--stage", "-z", "--", "sub/quote ' file"],
      ["rev-parse", "--verify", "HEAD"],
      ["read-tree", "parent"],
      ["update-index", "--force-remove", "--", "sub/quote ' file", "sub/old path"],
      ["update-index", "--add", "--cacheinfo", "100644", "abc", "sub/quote ' file"],
      ["commit", "-m", "owned message ' --"],
      ["rev-parse", "HEAD"],
      ["reset", "--quiet", "HEAD", "--", "sub/quote ' file", "sub/old path"],
    ],
  );
  for (const [index, command] of commands.entries()) {
    if ([3, 4, 5, 6].includes(index))
      assert.deepEqual(command.env, {
        GIT_INDEX_FILE: fakeFsPath("/owned data/tmp/git-index-synthetic/index"),
      });
    else assert.equal(command.env, undefined);
  }
  assert.deepEqual(fsTrace, [
    ["mkdir", fakeFsPath("/owned data/tmp"), { recursive: true }],
    ["mkdtemp", fakeFsPath("/owned data/tmp/git-index-")],
    ["rm", fakeFsPath("/owned data/tmp/git-index-synthetic"), { recursive: true, force: true }],
  ]);

  commands.length = 0;
  fsTrace.length = 0;
  failCommand = "commit";
  await assert.rejects(
    repo.commit(resolution.workspacePath, "owned", [path], { stagedOnly: true }),
    /git commit selected staged paths failed: owned command permission denied/,
  );
  assert.ok(!commands.some((c) => c.args[0] === "reset"));
  assert.equal(fsTrace.at(-1)?.[0], "rm");
  commands.length = 0;
  fsTrace.length = 0;
  failCommand = "reset";
  await assert.rejects(
    repo.commit(resolution.workspacePath, "owned", [path], { stagedOnly: true }),
    /git reset selected committed paths failed/,
  );
  assert.ok(commands.some((c) => c.args[0] === "commit"));
  assert.equal(fsTrace.at(-1)?.[0], "rm");
  denyCleanup = true;
  failCommand = "commit";
  await assert.rejects(
    repo.commit(resolution.workspacePath, "owned", [path], { stagedOnly: true }),
    (e) => e === cleanupDenied,
  );
  denyCleanup = false;
  failCommand = null;
  denyMkdir = true;
  commands.length = 0;
  fsTrace.length = 0;
  await assert.rejects(
    repo.commit(resolution.workspacePath, "owned", [path], { stagedOnly: true }),
    (e) => e === denied,
  );
  assert.equal(fsTrace.length, 1);
  assert.ok(!commands.some((c) => c.args[0] === "read-tree"));
  denyMkdir = false;
  commands.length = 0;
  failCommand = "switch";
  const switched = await repo.createBranchAndSwitch(
    resolution.workspacePath,
    " owned ' branch ",
    " --synthetic-start ",
  );
  assert.equal(switched.ok, false);
  assert.deepEqual(commands.at(-1)?.args, [
    "switch",
    "--no-guess",
    "-c",
    "owned ' branch",
    "--",
    "--synthetic-start",
  ]);
  assert.equal(statusReads, 1);
  commands.length = 0;
  failCommand = "push";
  await assert.rejects(repo.push(resolution.workspacePath), /git push failed/);
  assert.deepEqual(commands[0].args, ["push"]);
  assert.equal(commands[0].timeoutMs, 600000);
  assert.equal(commands[0].maxOutputBytes, 8388608);
  assert.equal(statusReads, 2);

  failCommand = null;
  status.summary.trackingBranchName = null;
  remoteListing = "  sole-owned-remote\r\n";
  commands.length = 0;
  const pushed = await repo.push(resolution.workspacePath);
  assert.equal(pushed.remoteName, "sole-owned-remote");
  assert.equal(pushed.setUpstream, true);
  assert.deepEqual(commands.at(-1)?.args, ["push", "--set-upstream", "sole-owned-remote", "owned"]);
  remoteListing = "";
  await assert.rejects(repo.push(resolution.workspacePath), /No Git remote is configured/);
  remoteListing = "first\nsecond\n";
  await assert.rejects(repo.push(resolution.workspacePath), /Multiple Git remotes are configured/);
});
