import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import type { GitCheckpointMeta } from "@knorvia/shared";
import type {
  GitCommandExecutionOptions,
  GitCommandExecutionResult,
} from "../src/git/providers/gitCommandProvider.js";
import { fakeFsPath } from "./fake-native-paths-20261003.js";

test("fake checkpoint repository keeps temporary index and conflict/permission admission", async (t) => {
  const repoRoot = fakeFsPath("/synthetic/repo");
  const workspacePath = join(repoRoot, "workspace");
  const temporaryRoot = fakeFsPath("/synthetic/indexes");
  const temporary = join(temporaryRoot, "index-fake");
  const file = join(workspacePath, "one 'quoted' file");
  const commands: GitCommandExecutionOptions[] = [];
  const cleanup: string[] = [];
  const copies: string[][] = [];
  let content = "old";
  let available = true;
  let deniedOperation: string | undefined;
  const denied = new Error("synthetic command permission refusal");
  t.mock.module("node:fs/promises", {
    namedExports: {
      mkdir: async () => undefined,
      mkdtemp: async () => temporary,
      copyFile: async (from: string, to: string) => {
        copies.push([from, to]);
        throw new Error("synthetic copy denied, fallback allowed");
      },
      lstat: async () => ({ isDirectory: () => false, isSymbolicLink: () => false }),
      rm: async (path: string, options: { recursive: boolean; force: boolean }) => {
        assert.deepEqual(options, { recursive: true, force: true });
        cleanup.push(path);
      },
    },
  });
  t.mock.module("../src/paths.js", {
    namedExports: {
      getGitCheckpointIndexRootDir: () => temporaryRoot,
      getWorkspaceHash: () => "synthetic-hash",
    },
  });
  t.mock.module("../src/git/config.js", {
    namedExports: {
      normalizeGitPath: (path: string) => path.replace(/\\/g, "/"),
      toWorkspaceRelativeGitPath: (path: string, scope: string) =>
        path.startsWith(`${scope}/`) ? path.slice(scope.length + 1) : path,
    },
  });
  t.mock.module("../src/git/providers/gitCommandProvider.js", {
    namedExports: {
      createGitCommandProvider: () => assert.fail("unexpected default command provider"),
    },
  });
  t.mock.module("../src/git/repo/gitCliRepo.js", {
    namedExports: { createGitCliRepo: () => assert.fail("unexpected default repository") },
  });
  t.mock.module("../src/git/repo/gitCliHelpers.js", {
    namedExports: {
      ensureGitCommandSucceeded: (
        _label: string,
        result: GitCommandExecutionResult,
        allowed = [0],
      ) => {
        if (!allowed.includes(result.exitCode!)) throw denied;
        return result;
      },
    },
  });
  const commandProvider = {
    resolveGitBinary: async () => fakeFsPath("/synthetic/git"),
    run: async (command: GitCommandExecutionOptions): Promise<GitCommandExecutionResult> => {
      commands.push(command);
      assert.equal(command.cwd, repoRoot);
      let stdout = "";
      const op = command.args[0];
      if (op === "rev-parse") stdout = ".git/index\n";
      if (op === "write-tree") stdout = "tree\n";
      if (op === "commit-tree") stdout = "checkpoint-oid\n";
      if (op === "diff")
        stdout =
          command.args[1] === "--name-status"
            ? "M\0workspace/one 'quoted' file\0"
            : "1\t1\tworkspace/one 'quoted' file\0";
      if (op === "ls-tree")
        stdout = `100644 blob ${command.args[3] === "to" ? "new" : "old"}\tworkspace/one 'quoted' file\0`;
      if (op === "hash-object") stdout = `${content}\n`;
      if (op === "restore" && op !== deniedOperation) content = "new";
      return {
        binaryPath: fakeFsPath("/synthetic/git"),
        cwd: command.cwd,
        args: command.args,
        stdout,
        stderr: "",
        exitCode: op === deniedOperation ? 1 : 0,
        signal: null,
        durationMs: 0,
        timedOut: false,
        outputTruncated: false,
      };
    },
  };
  const gitRepo = {
    resolveRepository: async () => ({
      workspacePath,
      repoRoot,
      workspaceInRepoPath: "workspace",
      autoRefreshWatchPaths: [],
      isGitAvailable: available,
      isRepository: true,
    }),
  };
  const { createGitCheckpointRepo } = await import("../src/git/repo/gitCheckpointRepo.js");
  const owner = createGitCheckpointRepo({ commandProvider, gitRepo });
  const meta = await owner.createCheckpoint({ workspacePath, checkpointId: "synthetic-id" });
  assert.equal(meta.commitOid, "checkpoint-oid");
  assert.equal(meta.refName, "refs/knorvia/checkpoints/synthetic-hash/synthetic-id");
  assert.deepEqual(
    commands.map((command) => command.args[0]),
    ["rev-parse", "read-tree", "add", "write-tree", "commit-tree", "update-ref"],
  );
  assert.deepEqual(copies, [[join(repoRoot, ".git", "index"), join(temporary, "index")]]);
  for (const command of commands.filter((command) =>
    ["read-tree", "add", "write-tree", "commit-tree"].includes(command.args[0]),
  ))
    assert.equal(command.env?.GIT_INDEX_FILE, join(temporary, "index"));
  assert.equal(commands[0].env, undefined);
  assert.equal(commands.at(-1)?.env, undefined);
  assert.deepEqual(cleanup, [temporary]);
  assert.equal(content, "old");
  commands.length = 0;
  deniedOperation = "add";
  await assert.rejects(
    owner.createCheckpoint({ workspacePath, checkpointId: "denied" }),
    (error) => error === denied,
  );
  assert.equal(
    commands.some((command) => command.args[0] === "update-ref"),
    false,
  );
  assert.equal(cleanup.length, 2);
  deniedOperation = undefined;
  const from: GitCheckpointMeta = { ...meta, checkpointId: "from", commitOid: "from" };
  const to: GitCheckpointMeta = { ...meta, checkpointId: "to", commitOid: "to" };
  content = "user-change";
  commands.length = 0;
  const refused = await owner.restoreBetweenCheckpoints({ workspacePath, from, to });
  assert.equal(refused.success, false);
  assert.equal(refused.conflicts?.[0].reason, "content-mismatch");
  assert.equal(
    commands.some((command) => command.args[0] === "restore"),
    false,
  );
  assert.equal(content, "user-change");
  content = "old";
  commands.length = 0;
  assert.deepEqual(await owner.restoreBetweenCheckpoints({ workspacePath, from, to }), {
    success: true,
    restoredPaths: [file],
  });
  const restore = commands.find((command) => command.args[0] === "restore")!;
  assert.deepEqual(restore.args, [
    "restore",
    "--source=to",
    "--worktree",
    "--",
    "workspace/one 'quoted' file",
  ]);
  assert.equal(restore.env, undefined);
  content = "user-change";
  deniedOperation = "restore";
  await assert.rejects(
    owner.restoreBetweenCheckpoints({ workspacePath, from, to, force: true }),
    (error) => error === denied,
  );
  assert.equal(content, "user-change");
  available = false;
  commands.length = 0;
  await assert.rejects(
    owner.deleteCheckpoint({ workspacePath, checkpoint: meta }),
    /Git binary is not available/,
  );
  assert.equal(commands.length, 0);
});
