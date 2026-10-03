import type { GitCliRepo } from "./gitCliTypes.js";
import {
  ensureGitCommandSucceeded,
  ensureRepositoryAvailable,
  normalizeInputPath,
} from "./gitCliHelpers.js";
import { runAt, type RepoOwner } from "./gitRepoOwner.js";
import { createCommitMethods } from "./gitRepoCommit.js";

type WriteMethods = Pick<GitCliRepo, "stage" | "unstage" | "discard" | "commit">;

export function createWriteMethods(owner: RepoOwner): WriteMethods {
  return {
    async stage(this: GitCliRepo, workspacePath, paths) {
      const resolution = await this.resolveRepository(workspacePath);
      ensureRepositoryAvailable(resolution, "stage paths");
      const normalized = await Promise.all(
        paths.map((path) => normalizeInputPath(resolution, path)),
      );
      const repoPaths = [...new Set(normalized)];
      if (!repoPaths.length) return;
      const result = await runAt(owner, resolution, ["add", "--", ...repoPaths]);
      ensureGitCommandSucceeded("git add", result);
      owner.invalidate(workspacePath);
    },
    async unstage(this: GitCliRepo, workspacePath, paths) {
      const resolution = await this.resolveRepository(workspacePath);
      ensureRepositoryAvailable(resolution, "unstage paths");
      const normalized = await Promise.all(
        paths.map((path) => normalizeInputPath(resolution, path)),
      );
      const repoPaths = [...new Set(normalized)];
      if (!repoPaths.length) return;
      const result = await runAt(owner, resolution, ["restore", "--staged", "--", ...repoPaths]);
      ensureGitCommandSucceeded("git restore --staged", result);
      owner.invalidate(workspacePath);
    },
    async discard(this: GitCliRepo, workspacePath, paths, staged) {
      const resolution = await this.resolveRepository(workspacePath);
      ensureRepositoryAvailable(resolution, "discard paths");
      const normalized = await Promise.all(
        paths.map((path) => normalizeInputPath(resolution, path)),
      );
      const repoPaths = [...new Set(normalized)];
      if (!repoPaths.length) return;
      const args = staged
        ? ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...repoPaths]
        : ["restore", "--worktree", "--", ...repoPaths];
      const result = await runAt(owner, resolution, args);
      ensureGitCommandSucceeded("git restore", result);
      owner.invalidate(workspacePath);
    },
    ...createCommitMethods(owner),
  };
}
