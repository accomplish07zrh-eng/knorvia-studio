// Source-exposed compatibility leaves are retained; this private read program
// owns decision order only. The existing repo executes every yielded effect.
import type { GitWorkspaceRepositoryInfo, GitWorkspaceRepositoryKind } from "@knorvia/shared";
import { isAbsolute, resolve } from "node:path";
import { DEFAULT_GIT_COMMAND_TIMEOUT_MS, normalizeWorkspaceInRepoPath } from "../config.js";
import type {
  GitCommandExecutionOptions,
  GitCommandExecutionResult,
} from "../providers/gitCommandProvider.js";
import {
  ensureGitCommandSucceeded,
  isMissingWorkingDirectoryResult,
  isNotRepositoryResult,
} from "./gitCliHelpers.js";
import type { GitResolvedRepository } from "./gitCliTypes.js";

type GitRepositoryRead =
  | { kind: "discover" }
  | { kind: "command"; options: GitCommandExecutionOptions }
  | { kind: "stat"; path: string }
  | { kind: "read"; path: string; encoding: "utf-8" };
export type GitRepositoryReadProgram<T> = Generator<GitRepositoryRead, T, unknown>;
interface GitEntryStat {
  isDirectory(): boolean;
  isFile(): boolean;
}

function unavailableRepository(
  workspacePath: string,
  isGitAvailable: boolean,
): GitResolvedRepository {
  return {
    workspacePath,
    repoRoot: workspacePath,
    workspaceInRepoPath: ".",
    autoRefreshWatchPaths: [],
    isGitAvailable,
    isRepository: false,
  };
}

function metadataWatchPaths(
  workspacePath: string,
  absoluteGitDir: string,
  gitCommonDir: string,
): GitResolvedRepository["autoRefreshWatchPaths"] {
  const paths: GitResolvedRepository["autoRefreshWatchPaths"] = [],
    seen = new Set<string>();
  // 只投影 Git 元数据。相对 common-dir 必须以命令 cwd 为基准；不获取 workspace watcher。
  function* candidates() {
    yield absoluteGitDir;
    yield gitCommonDir
      ? isAbsolute(gitCommonDir)
        ? gitCommonDir
        : resolve(workspacePath, gitCommonDir)
      : absoluteGitDir;
  }
  for (const candidate of candidates()) {
    const trimmed = candidate.trim();
    const path =
      trimmed === "/" || /^[A-Za-z]:[\\/]?$/.test(trimmed)
        ? trimmed
        : trimmed.replace(/[\\/]+$/, "");
    if (path && !seen.has(path)) {
      seen.add(path);
      paths.push({ path, recursive: true });
    }
  }
  return paths;
}

export function* planGitRepositoryResolution(
  workspacePath: string,
): GitRepositoryReadProgram<GitResolvedRepository> {
  const binary = yield { kind: "discover" };
  if (!binary) return unavailableRepository(workspacePath, false);
  const result = (yield {
    kind: "command",
    options: {
      cwd: workspacePath,
      args: [
        "rev-parse",
        "--show-toplevel",
        "--show-prefix",
        "--absolute-git-dir",
        "--git-common-dir",
      ],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    },
  }) as GitCommandExecutionResult;
  if (result.exitCode !== 0) {
    // 目录缺失和非仓库先降级；保持现有谓词读取顺序及 checker 的错误优先级。
    if (isMissingWorkingDirectoryResult(result) || isNotRepositoryResult(result))
      return unavailableRepository(workspacePath, true);
    ensureGitCommandSucceeded("git rev-parse", result);
  }
  const lines = result.stdout.replace(/\r\n/g, "\n").split("\n");
  const repoRoot = lines[0]?.trim();
  if (!repoRoot) throw new Error("Failed to resolve Git repository root");
  return {
    workspacePath,
    repoRoot,
    workspaceInRepoPath: normalizeWorkspaceInRepoPath(lines[1] ?? ""),
    autoRefreshWatchPaths: metadataWatchPaths(
      workspacePath,
      lines[2]?.trim() ?? "",
      lines[3]?.trim() ?? "",
    ),
    isGitAvailable: true,
    isRepository: true,
  };
}

function workspaceInfo(
  workspacePath: string,
  kind: GitWorkspaceRepositoryKind,
  isGitAvailable: boolean,
): GitWorkspaceRepositoryInfo {
  return { workspacePath, kind, isGitAvailable };
}

export function* planGitWorkspaceRepositoryInfo(
  workspacePath: string,
  resolution: GitResolvedRepository,
): GitRepositoryReadProgram<GitWorkspaceRepositoryInfo> {
  if (!resolution.isGitAvailable || !resolution.isRepository)
    return workspaceInfo(workspacePath, "not-repository", resolution.isGitAvailable);
  const path = resolve(resolution.repoRoot, ".git");
  try {
    const entry = (yield { kind: "stat", path }) as GitEntryStat;
    if (entry.isDirectory()) return workspaceInfo(workspacePath, "main-tree", true);
    if (entry.isFile()) {
      const content = (yield { kind: "read", path, encoding: "utf-8" }) as string;
      const firstLine = content.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
      const prefix = "gitdir:";
      const pointer = firstLine.startsWith(prefix) ? firstLine.slice(prefix.length).trim() : null;
      if (pointer) {
        const directory = isAbsolute(pointer) ? pointer : resolve(resolution.repoRoot, pointer);
        if (directory.replace(/\\/g, "/").includes("/.git/worktrees/"))
          return workspaceInfo(workspacePath, "linked-worktree", true);
      }
    }
  } catch {
    // worktree 识别仅用于迁移候选过滤；元数据读取/布局异常仍 fail-open，避免误过滤。
  }
  return workspaceInfo(workspacePath, "main-tree", true);
}
