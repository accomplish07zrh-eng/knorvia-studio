import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { GitCliRepo, GitResolvedRepository } from "./gitCliTypes.js";
import { normalizeWorkspaceInRepoPath } from "../config.js";
import {
  ensureGitCommandSucceeded,
  isMissingWorkingDirectoryResult,
  isNotRepositoryResult,
} from "./gitCliHelpers.js";
import { COMMAND_TIMEOUT, inFlight, type RepoOwner } from "./gitRepoOwner.js";

type ResolutionMethods = Pick<GitCliRepo, "resolveRepository" | "getWorkspaceRepositoryInfo">;

function absent(workspacePath: string, isGitAvailable: boolean): GitResolvedRepository {
  return {
    workspacePath,
    repoRoot: workspacePath,
    workspaceInRepoPath: ".",
    autoRefreshWatchPaths: [],
    isGitAvailable,
    isRepository: false,
  };
}

function watches(
  workspacePath: string,
  gitDir: string,
  commonDir: string,
): GitResolvedRepository["autoRefreshWatchPaths"] {
  const result: GitResolvedRepository["autoRefreshWatchPaths"] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const trimmed = value.trim();
    const path =
      trimmed === "/" || /^[A-Za-z]:[\\/]?$/.test(trimmed)
        ? trimmed
        : trimmed.replace(/[\\/]+$/, "");
    if (!path || seen.has(path)) return;
    seen.add(path);
    result.push({ path, recursive: true });
  };
  add(gitDir);
  add(commonDir ? (isAbsolute(commonDir) ? commonDir : resolve(workspacePath, commonDir)) : gitDir);
  return result;
}

export function createResolutionMethods(owner: RepoOwner): ResolutionMethods {
  const resolutions = new Map<string, Promise<GitResolvedRepository>>();
  const infos = new Map<string, ReturnType<GitCliRepo["getWorkspaceRepositoryInfo"]>>();
  const previousInvalidate = owner.invalidate;
  owner.invalidate = (path) => {
    previousInvalidate(path);
    resolutions.delete(path);
    infos.delete(path);
  };
  return {
    async resolveRepository(workspacePath) {
      return await inFlight(resolutions, workspacePath, async () => {
        if (!(await owner.provider.resolveGitBinary())) return absent(workspacePath, false);
        const result = await owner.provider.run({
          cwd: workspacePath,
          args: [
            "rev-parse",
            "--show-toplevel",
            "--show-prefix",
            "--absolute-git-dir",
            "--git-common-dir",
          ],
          timeoutMs: COMMAND_TIMEOUT,
        });
        if (result.exitCode !== 0) {
          if (isMissingWorkingDirectoryResult(result) || isNotRepositoryResult(result))
            return absent(workspacePath, true);
          ensureGitCommandSucceeded("git rev-parse", result);
        }
        const lines = result.stdout.replace(/\r\n/g, "\n").split("\n");
        const repoRoot = lines[0]?.trim() ?? "";
        if (!repoRoot) throw new Error("Failed to resolve Git repository root");
        const gitDir = lines[2]?.trim() ?? "";
        const commonDir = lines[3]?.trim() ?? "";
        return {
          workspacePath,
          repoRoot,
          workspaceInRepoPath: normalizeWorkspaceInRepoPath(lines[1] ?? ""),
          autoRefreshWatchPaths: watches(workspacePath, gitDir, commonDir),
          isGitAvailable: true,
          isRepository: true,
        };
      });
    },
    async getWorkspaceRepositoryInfo(workspacePath) {
      return await inFlight(infos, workspacePath, async () => {
        const resolution = await this.resolveRepository(workspacePath);
        if (!resolution.isGitAvailable || !resolution.isRepository)
          return {
            workspacePath,
            kind: "not-repository" as const,
            isGitAvailable: resolution.isGitAvailable,
          };
        let kind: "main-tree" | "linked-worktree" = "main-tree";
        try {
          const marker = resolve(resolution.repoRoot, ".git");
          const info = await stat(marker);
          if (info.isDirectory())
            return { workspacePath, kind: "main-tree" as const, isGitAvailable: true };
          if (info.isFile()) {
            const first =
              (await readFile(marker, "utf-8")).replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
            if (first.startsWith("gitdir:")) {
              const raw = first.slice("gitdir:".length).trim();
              const directory = raw
                ? isAbsolute(raw)
                  ? raw
                  : resolve(resolution.repoRoot, raw)
                : "";
              if (directory.replace(/\\/g, "/").includes("/.git/worktrees/"))
                kind = "linked-worktree";
            }
          }
        } catch {
          // 文件布局探测仅用于迁移提示，读取失败时保留主工作树分类。
        }
        return { workspacePath, kind, isGitAvailable: true };
      });
    },
  };
}
