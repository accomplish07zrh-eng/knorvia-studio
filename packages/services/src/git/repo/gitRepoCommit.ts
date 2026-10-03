import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { getKnorviaDataRootDir } from "#src/paths.js";
import type { GitCliRepo } from "./gitCliTypes.js";
import { normalizeGitPath } from "../config.js";
import {
  ensureGitCommandSucceeded,
  ensureRepositoryAvailable,
  normalizeInputPath,
  parseStatusPorcelain,
} from "./gitCliHelpers.js";
import { OUTPUT_BYTES, runAt, type RepoOwner } from "./gitRepoOwner.js";

interface IndexEntry {
  mode: string;
  objectHash: string;
  stage: string;
  path: string;
}

function indexEntries(stdout: string): IndexEntry[] {
  return stdout
    .split("\0")
    .filter(Boolean)
    .map((record) => {
      const tab = record.indexOf("\t");
      if (tab < 0) throw new Error("Failed to parse staged Git index entry.");
      const [mode, objectHash, stage] = record.slice(0, tab).trim().split(/\s+/);
      const path = normalizeGitPath(record.slice(tab + 1));
      if (!mode || !objectHash || !stage || !path)
        throw new Error("Failed to parse staged Git index entry.");
      return { mode, objectHash, stage, path };
    });
}

export function createCommitMethods(owner: RepoOwner): Pick<GitCliRepo, "commit"> {
  return {
    async commit(this: GitCliRepo, workspacePath, message, paths, options) {
      const resolution = await this.resolveRepository(workspacePath);
      ensureRepositoryAvailable(resolution, "commit changes");
      const trimmed = message.trim();
      if (!trimmed) throw new Error("Commit message cannot be empty");
      const normalized = paths?.length
        ? await Promise.all(paths.map((path) => normalizeInputPath(resolution, path)))
        : [];
      const repoPaths = [...new Set(normalized)];
      if (options?.stagedOnly && repoPaths.length) {
        const statusResult = await runAt(
          owner,
          resolution,
          ["status", "--porcelain=v2", "-z", "--", ...repoPaths],
          { maxOutputBytes: OUTPUT_BYTES },
        );
        ensureGitCommandSucceeded("git status selected paths", statusResult);
        const originalPaths = parseStatusPorcelain(statusResult.stdout)
          .entries.filter((entry) => repoPaths.includes(entry.path))
          .map((entry) => entry.originalPath)
          .filter((path): path is string => Boolean(path));
        const cleanupPaths = [...new Set([...repoPaths, ...originalPaths])];
        const entriesResult = await runAt(
          owner,
          resolution,
          ["ls-files", "--stage", "-z", "--", ...repoPaths],
          { maxOutputBytes: OUTPUT_BYTES },
        );
        ensureGitCommandSucceeded("git ls-files selected staged entries", entriesResult);
        const entries = indexEntries(entriesResult.stdout);
        if (entries.some((entry) => entry.stage !== "0"))
          throw new Error("Cannot commit selected staged paths while index conflicts exist.");
        const head = await runAt(owner, resolution, ["rev-parse", "--verify", "HEAD"]);
        const parentHash = head.exitCode === 0 ? head.stdout.trim() : null;
        const tempRoot = join(getKnorviaDataRootDir(), "tmp");
        await mkdir(tempRoot, { recursive: true });
        const tempDir = await mkdtemp(join(tempRoot, "git-index-"));
        const env = { GIT_INDEX_FILE: join(tempDir, "index") };
        try {
          const base = await runAt(
            owner,
            resolution,
            parentHash ? ["read-tree", parentHash] : ["read-tree", "--empty"],
            { env },
          );
          ensureGitCommandSucceeded("git read-tree selected commit base", base);
          if (cleanupPaths.length) {
            const remove = await runAt(
              owner,
              resolution,
              ["update-index", "--force-remove", "--", ...cleanupPaths],
              { env },
            );
            ensureGitCommandSucceeded("git update-index remove selected paths", remove);
          }
          for (const entry of entries) {
            const add = await runAt(
              owner,
              resolution,
              ["update-index", "--add", "--cacheinfo", entry.mode, entry.objectHash, entry.path],
              { env },
            );
            ensureGitCommandSucceeded("git update-index add selected paths", add);
          }
          const commit = await runAt(owner, resolution, ["commit", "-m", trimmed], {
            env,
            maxOutputBytes: OUTPUT_BYTES,
          });
          ensureGitCommandSucceeded("git commit selected staged paths", commit);
          const committedHead = await runAt(owner, resolution, ["rev-parse", "HEAD"]);
          ensureGitCommandSucceeded("git rev-parse selected commit HEAD", committedHead);
          const commitHash = committedHead.stdout.trim();
          const reset = await runAt(owner, resolution, [
            "reset",
            "--quiet",
            "HEAD",
            "--",
            ...cleanupPaths,
          ]);
          ensureGitCommandSucceeded("git reset selected committed paths", reset);
          owner.invalidate(workspacePath);
          return { commitHash };
        } finally {
          await rm(tempDir, { recursive: true, force: true });
        }
      }
      const args = repoPaths.length
        ? ["commit", "-m", trimmed, "--", ...repoPaths]
        : ["commit", "-m", trimmed];
      const result = await runAt(owner, resolution, args, { maxOutputBytes: OUTPUT_BYTES });
      ensureGitCommandSucceeded("git commit", result);
      owner.invalidate(workspacePath);
      const head = await runAt(owner, resolution, ["rev-parse", "HEAD"]);
      ensureGitCommandSucceeded("git rev-parse HEAD", head);
      return { commitHash: head.stdout.trim() };
    },
  };
}
