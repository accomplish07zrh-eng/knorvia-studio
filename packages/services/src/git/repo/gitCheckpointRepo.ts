import { copyFile, lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  GitCheckpointConflict,
  GitCheckpointConflictReason,
  GitCheckpointDiff,
  GitCheckpointMeta,
  GitCheckpointRestoreResult,
} from "@knorvia/shared";
import { getGitCheckpointIndexRootDir } from "../../paths.js";
import { toWorkspaceRelativeGitPath } from "../config.js";
import {
  createGitCommandProvider,
  type GitCommandProvider,
} from "../providers/gitCommandProvider.js";
import { createGitCliRepo, type GitCliRepo, type GitResolvedRepository } from "./gitCliRepo.js";
import { ensureGitCommandSucceeded } from "./gitCliHelpers.js";
import {
  buildAffectedRepoPaths,
  buildCheckpointEnv,
  getCheckpointRefName,
  getWorkspacePathspec,
  mergeCheckpointDiff,
  normalizeAffectedRepoPath,
  parseLsTree,
  parseNameStatus,
  parseNumstat,
  removeFileIfExists,
  toAbsolutePath,
} from "./gitCheckpointHelpers.js";

export interface GitCheckpointRepo {
  createCheckpoint(params: {
    workspacePath: string;
    checkpointId: string;
  }): Promise<GitCheckpointMeta>;
  diffCheckpoints(params: {
    workspacePath: string;
    from: GitCheckpointMeta;
    to: GitCheckpointMeta;
  }): Promise<GitCheckpointDiff>;
  restoreBetweenCheckpoints(params: {
    workspacePath: string;
    from: GitCheckpointMeta;
    to: GitCheckpointMeta;
    force?: boolean;
  }): Promise<GitCheckpointRestoreResult>;
  deleteCheckpoint(params: { workspacePath: string; checkpoint: GitCheckpointMeta }): Promise<void>;
}

export function createGitCheckpointRepo(options?: {
  commandProvider?: GitCommandProvider;
  gitRepo?: Pick<GitCliRepo, "resolveRepository">;
}): GitCheckpointRepo {
  const commandProvider = options?.commandProvider ?? createGitCommandProvider();
  const gitRepo = options?.gitRepo ?? createGitCliRepo({ commandProvider });

  async function ensureRepository(workspacePath: string): Promise<GitResolvedRepository> {
    const resolution = await gitRepo.resolveRepository(workspacePath);
    if (!resolution.isGitAvailable) {
      throw new Error("Git binary is not available in the current environment.");
    }
    if (!resolution.isRepository) {
      throw new Error("Workspace is not inside a Git repository.");
    }
    return resolution;
  }

  async function computeDiff(params: {
    workspacePath: string;
    from: GitCheckpointMeta;
    to: GitCheckpointMeta;
  }): Promise<GitCheckpointDiff> {
    const resolution = await ensureRepository(params.workspacePath);
    const pathspec = getWorkspacePathspec(resolution.workspaceInRepoPath);
    const [names, counts] = await Promise.all([
      commandProvider.run({
        cwd: resolution.repoRoot,
        args: [
          "diff",
          "--name-status",
          "--find-renames",
          "-z",
          params.from.commitOid,
          params.to.commitOid,
          "--",
          pathspec,
        ],
      }),
      commandProvider.run({
        cwd: resolution.repoRoot,
        args: [
          "diff",
          "--numstat",
          "--find-renames",
          "-z",
          params.from.commitOid,
          params.to.commitOid,
          "--",
          pathspec,
        ],
      }),
    ]);
    ensureGitCommandSucceeded("git diff --name-status checkpoint", names);
    ensureGitCommandSucceeded("git diff --numstat checkpoint", counts);
    return mergeCheckpointDiff({
      repoRoot: resolution.repoRoot,
      workspaceInRepoPath: resolution.workspaceInRepoPath,
      fromCheckpointId: params.from.checkpointId,
      toCheckpointId: params.to.checkpointId,
      nameStatusEntries: parseNameStatus(names.stdout),
      numstat: parseNumstat(counts.stdout),
    });
  }

  async function pathExists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch {
      return false;
    }
  }

  async function collectConflicts(
    repoRoot: string,
    workspaceInRepoPath: string,
    checkpoint: GitCheckpointMeta,
    affectedPaths: string[],
  ): Promise<GitCheckpointConflict[]> {
    if (affectedPaths.length === 0) return [];
    const treeResult = await commandProvider.run({
      cwd: repoRoot,
      args: ["ls-tree", "-r", "-z", checkpoint.commitOid, "--", ...affectedPaths],
    });
    ensureGitCommandSucceeded("git ls-tree checkpoint paths", treeResult);
    const tree = parseLsTree(treeResult.stdout);
    const conflicts = new Map<string, GitCheckpointConflict>();
    function recordConflict(
      repoRelativePath: string,
      path: string,
      reason: GitCheckpointConflictReason,
    ): void {
      conflicts.set(repoRelativePath, {
        path,
        repoRelativePath,
        workspaceRelativePath: toWorkspaceRelativeGitPath(repoRelativePath, workspaceInRepoPath),
        reason,
      });
    }

    for (const repoRelativePath of affectedPaths) {
      const path = toAbsolutePath(repoRoot, repoRelativePath);
      const expected = tree.get(repoRelativePath);
      if (!expected) {
        if (await pathExists(path)) {
          recordConflict(repoRelativePath, path, "unexpected-file-in-worktree");
        }
        continue;
      }
      let stats;
      try {
        stats = await lstat(path);
      } catch {
        recordConflict(repoRelativePath, path, "missing-in-worktree");
        continue;
      }
      if (stats.isDirectory() || (expected.mode === "120000" && !stats.isSymbolicLink())) {
        recordConflict(repoRelativePath, path, "type-mismatch");
      } else {
        const hashResult = await commandProvider.run({
          cwd: repoRoot,
          args: ["hash-object", "--no-filters", path],
        });
        ensureGitCommandSucceeded("git hash-object checkpoint verify", hashResult);
        if (hashResult.stdout.trim() !== expected.objectId) {
          recordConflict(repoRelativePath, path, "content-mismatch");
        }
      }
    }
    return [...conflicts.values()];
  }

  return {
    async createCheckpoint(params) {
      const resolution = await ensureRepository(params.workspacePath);
      const refName = getCheckpointRefName(params.workspacePath, params.checkpointId);
      const indexRoot = getGitCheckpointIndexRootDir();
      await mkdir(indexRoot, { recursive: true });
      const tempDirectory = await mkdtemp(resolve(indexRoot, "index-"));
      const tempIndex = resolve(tempDirectory, "index");
      const env = buildCheckpointEnv(tempIndex);
      const pathspec = getWorkspacePathspec(resolution.workspaceInRepoPath);

      try {
        const currentIndex = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: ["rev-parse", "--git-path", "index"],
        });
        let primed = false;
        if (currentIndex.exitCode === 0) {
          const currentIndexPath = currentIndex.stdout.trim();
          if (currentIndexPath) {
            try {
              await copyFile(resolve(resolution.repoRoot, currentIndexPath), tempIndex);
              primed = true;
            } catch {
              // A missing or unreadable index falls back to the HEAD tree.
            }
          }
        }
        if (!primed) {
          const headTree = await commandProvider.run({
            cwd: resolution.repoRoot,
            args: ["read-tree", "HEAD"],
            env,
          });
          primed = headTree.exitCode === 0;
        }

        const staged = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: ["add", "-A", "--", pathspec],
          env,
        });
        ensureGitCommandSucceeded("git add checkpoint", staged);
        const tree = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: ["write-tree"],
          env,
        });
        ensureGitCommandSucceeded("git write-tree checkpoint", tree);
        const commit = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: [
            "commit-tree",
            tree.stdout.trim(),
            "-m",
            `knorvia checkpoint ${params.checkpointId}`,
          ],
          env,
        });
        ensureGitCommandSucceeded("git commit-tree checkpoint", commit);
        const commitOid = commit.stdout.trim();
        const ref = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: ["update-ref", refName, commitOid],
        });
        ensureGitCommandSucceeded("git update-ref checkpoint", ref);
        return {
          checkpointId: params.checkpointId,
          workspacePath: params.workspacePath,
          repoRoot: resolution.repoRoot,
          workspaceInRepoPath: resolution.workspaceInRepoPath,
          createdAt: Date.now(),
          refName,
          commitOid,
          scope: "workspace",
        };
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    },

    async diffCheckpoints(params) {
      return await computeDiff(params);
    },

    async restoreBetweenCheckpoints(params) {
      const resolution = await ensureRepository(params.workspacePath);
      const diff = await computeDiff({
        workspacePath: params.workspacePath,
        from: params.from,
        to: params.to,
      });
      const affectedPaths = buildAffectedRepoPaths(diff.files).map((path) =>
        normalizeAffectedRepoPath(resolution.repoRoot, path),
      );
      if (affectedPaths.length === 0) return { success: true, restoredPaths: [] };
      const conflicts = await collectConflicts(
        resolution.repoRoot,
        resolution.workspaceInRepoPath,
        params.from,
        affectedPaths,
      );
      if (conflicts.length > 0 && params.force !== true) {
        return { success: false, conflicts };
      }

      const restorePaths = diff.files
        .filter((file) => file.kind !== "deleted")
        .map((file) => file.repoRelativePath);
      if (restorePaths.length > 0) {
        const restored = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: ["restore", `--source=${params.to.commitOid}`, "--worktree", "--", ...restorePaths],
        });
        ensureGitCommandSucceeded("git restore checkpoint", restored);
      }
      const deletePaths = new Set<string>();
      for (const file of diff.files) {
        if (file.kind === "deleted") {
          deletePaths.add(file.path);
          continue;
        }
        if (file.kind === "renamed" && file.originalPath) {
          deletePaths.add(file.originalPath);
        }
      }
      for (const path of deletePaths) await removeFileIfExists(path);
      const remainingConflicts = await collectConflicts(
        resolution.repoRoot,
        resolution.workspaceInRepoPath,
        params.to,
        affectedPaths,
      );
      if (remainingConflicts.length > 0) {
        throw new Error("Checkpoint restore verification failed.");
      }
      return { success: true, restoredPaths: diff.files.map((file) => file.path) };
    },

    async deleteCheckpoint(params) {
      const resolution = await ensureRepository(params.workspacePath);
      const deleted = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: ["update-ref", "-d", params.checkpoint.refName],
      });
      ensureGitCommandSucceeded("git update-ref -d checkpoint", deleted, [0, 1]);
    },
  };
}
