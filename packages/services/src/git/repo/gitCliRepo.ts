/* eslint-disable max-lines */
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import type {
  GitBranchMutationAction,
  GitBranchMutationIssue,
  GitBranchMutationResult,
  GitDiffQuery,
  GitDiffResult,
  GitIdentity,
  GitLocalBranchListResult,
  GitPushResult,
  GitWorkspaceRepositoryInfo,
} from "@knorvia/shared";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { getKnorviaDataRootDir } from "#src/paths.js";
import { isAbsolute, join, resolve, sep } from "node:path";
import {
  DEFAULT_GIT_COMMAND_TIMEOUT_MS,
  DEFAULT_GIT_DIFF_BYTES,
  DEFAULT_GIT_DIFF_TIMEOUT_MS,
  DEFAULT_GIT_OUTPUT_BYTES,
  DEFAULT_GIT_PUSH_OUTPUT_BYTES,
  DEFAULT_GIT_PUSH_TIMEOUT_MS,
  normalizeGitPath,
} from "../config.js";
import {
  createGitCommandProvider,
  type GitCommandProvider,
} from "../providers/gitCommandProvider.js";
import {
  buildUntrackedStats,
  ensureGitCommandSucceeded,
  ensureRepositoryAvailable,
  fileExists,
  normalizeInputPath,
  parseGitBranchMutationIssues,
  parseNumstat,
  parseStatusPorcelain,
  toInvalidBranchNameIssue,
} from "./gitCliHelpers.js";
import { emptyGitIdentity, readGitIdentity, projectGitIdentity } from "./gitIdentityRead.js";
import { planGitDiffRead } from "./gitDiffReadPlan.js";
import { planGitBranchComparison } from "./gitBranchComparisonReadPlan.js";
import { planGitCommitGraphQuery, projectGitCommitGraphQuery } from "./gitCommitGraphPlan.js";
import { planGitIgnoredPaths } from "./gitIgnoredPathReadPlan.js";
import { planGitLocalBranches } from "./gitLocalBranchReadPlan.js";
import {
  planGitRepositoryResolution,
  planGitWorkspaceRepositoryInfo,
  type GitRepositoryReadProgram,
} from "./gitRepositoryReadPlan.js";
import {
  createEmptySummary,
  type GitBranchComparisonSnapshot,
  type GitCliRepo,
  type GitCommitGraphSnapshot,
  type GitResolvedRepository,
  type GitStatusSnapshot,
} from "./gitCliTypes.js";

export type {
  GitBranchComparisonChange,
  GitBranchComparisonSnapshot,
  GitCliRepo,
  GitLineStat,
  GitResolvedRepository,
  GitStatusEntry,
  GitStatusSnapshot,
} from "./gitCliTypes.js";

function toUnavailableDiff(path: string, summary: string): GitDiffResult {
  return {
    path,
    availability: "unavailable",
    patch: null,
    beforeContent: null,
    afterContent: null,
    summary,
  };
}

interface GitDiffContents {
  beforeContent: string;
  afterContent: string;
}

function toCompleteDiffContents(
  beforeContent: string | null,
  afterContent: string | null,
): GitDiffContents | null {
  // 完整 diff 的任一侧读取失败后若被补成空字符串，UI 会把“不可读”误判成
  // “文件为空”，进而把整个文件渲染成新增或删除。完整内容对必须一起成功或一起降级。
  if (beforeContent === null || afterContent === null) {
    return null;
  }

  return { beforeContent, afterContent };
}

const GIT_OPERATION_MARKERS = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "REBASE_HEAD",
  "rebase-merge",
  "rebase-apply",
  "BISECT_LOG",
] as const;

const log = createServiceLogger("git-repo");

function isPreviewableText(content: string): boolean {
  return !content.includes("\0");
}

async function readWorkingTreePreviewContent(absolutePath: string): Promise<string | null> {
  try {
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile() || fileStat.size > DEFAULT_GIT_DIFF_BYTES) {
      return null;
    }

    const content = await readFile(absolutePath, "utf-8");
    return isPreviewableText(content) ? content : null;
  } catch {
    // 文件删除和原子保存窗口都会让 stat/readFile 失败；这里不能猜成合法空文件。
    return null;
  }
}

async function readGitBlobPreviewContent({
  commandProvider,
  repoRoot,
  ref,
  repoRelativePath,
}: {
  commandProvider: GitCommandProvider;
  repoRoot: string;
  ref: string;
  repoRelativePath: string;
}): Promise<string | null> {
  const result = await commandProvider.run({
    cwd: repoRoot,
    args: ["show", `${ref}:${repoRelativePath}`],
    timeoutMs: DEFAULT_GIT_DIFF_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_GIT_DIFF_BYTES,
  });

  if (
    result.timedOut ||
    result.outputTruncated ||
    result.exitCode !== 0 ||
    !isPreviewableText(result.stdout)
  ) {
    return null;
  }

  return result.stdout;
}

async function readBranchDiffContents({
  commandProvider,
  repoRoot,
  repoRelativePath,
  trackingBranchName,
}: {
  commandProvider: GitCommandProvider;
  repoRoot: string;
  repoRelativePath: string;
  trackingBranchName: string;
}): Promise<GitDiffContents | null> {
  const mergeBaseResult = await commandProvider.run({
    cwd: repoRoot,
    args: ["merge-base", trackingBranchName, "HEAD"],
    timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
  });
  const mergeBase = mergeBaseResult.exitCode === 0 ? mergeBaseResult.stdout.trim() : "";
  const beforeContent = await readGitBlobPreviewContent({
    commandProvider,
    repoRoot,
    ref: mergeBase || trackingBranchName,
    repoRelativePath,
  });
  const afterContent = await readGitBlobPreviewContent({
    commandProvider,
    repoRoot,
    ref: "HEAD",
    repoRelativePath,
  });

  return toCompleteDiffContents(beforeContent, afterContent);
}

async function readStagedDiffContents({
  commandProvider,
  repoRoot,
  repoRelativePath,
}: {
  commandProvider: GitCommandProvider;
  repoRoot: string;
  repoRelativePath: string;
}): Promise<GitDiffContents | null> {
  const beforeContent = await readGitBlobPreviewContent({
    commandProvider,
    repoRoot,
    ref: "HEAD",
    repoRelativePath,
  });
  const afterContent = await readGitBlobPreviewContent({
    commandProvider,
    repoRoot,
    ref: "",
    repoRelativePath,
  });

  return toCompleteDiffContents(beforeContent, afterContent);
}

async function readUnstagedDiffContents({
  absolutePath,
  commandProvider,
  repoRoot,
  repoRelativePath,
}: {
  absolutePath: string;
  commandProvider: GitCommandProvider;
  repoRoot: string;
  repoRelativePath: string;
}): Promise<GitDiffContents | null> {
  const beforeContent = await readGitBlobPreviewContent({
    commandProvider,
    repoRoot,
    ref: "",
    repoRelativePath,
  });
  const afterContent = await readWorkingTreePreviewContent(absolutePath);

  return toCompleteDiffContents(beforeContent, afterContent);
}

function withDiffContents(diff: GitDiffResult, contents: GitDiffContents | null): GitDiffResult {
  if (diff.availability !== "patch") {
    return diff;
  }

  if (!contents) {
    // Git patch 已经成功生成时，全文预览失败只应关闭 MultiFileDiff，不能把正确 patch 一并丢弃。
    return diff;
  }

  return {
    ...diff,
    beforeContent: contents.beforeContent,
    afterContent: contents.afterContent,
  };
}

function toBranchMutationFailure(params: {
  action: GitBranchMutationAction;
  branchName: string | null;
  created?: boolean;
  summary: GitStatusSnapshot["summary"];
  issues: GitBranchMutationIssue[];
}): GitBranchMutationResult {
  return {
    ok: false,
    action: params.action,
    branchName: params.branchName,
    didChange: false,
    created: params.created ?? false,
    summary: params.summary,
    issues: params.issues,
  };
}

function toBranchMutationSuccess(params: {
  action: GitBranchMutationAction;
  branchName: string;
  didChange: boolean;
  created: boolean;
  summary: GitStatusSnapshot["summary"];
}): GitBranchMutationResult {
  return {
    ok: true,
    action: params.action,
    branchName: params.branchName,
    didChange: params.didChange,
    created: params.created,
    summary: params.summary,
    issues: [],
  };
}

function parseTrackingRemoteName(trackingBranchName: string | null): string | null {
  const remoteName = trackingBranchName?.split("/")[0]?.trim() ?? "";
  return remoteName.length > 0 ? remoteName : null;
}

function parseRemoteList(stdout: string): string[] {
  return stdout
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

interface GitIndexEntry {
  mode: string;
  objectHash: string;
  stage: string;
  path: string;
}

function parseGitIndexEntries(stdout: string): GitIndexEntry[] {
  return stdout
    .split("\0")
    .filter((record) => record.length > 0)
    .map((record) => {
      const tabIndex = record.indexOf("\t");
      if (tabIndex < 0) {
        throw new Error("Failed to parse staged Git index entry.");
      }

      const [mode, objectHash, stage] = record.slice(0, tabIndex).trim().split(/\s+/);
      const path = normalizeGitPath(record.slice(tabIndex + 1));
      if (!mode || !objectHash || !stage || !path) {
        throw new Error("Failed to parse staged Git index entry.");
      }

      return { mode, objectHash, stage, path };
    });
}

export function createGitCliRepo(options?: { commandProvider?: GitCommandProvider }): GitCliRepo {
  const commandProvider = options?.commandProvider ?? createGitCommandProvider();
  const repositoryResolutionRequests = new Map<string, Promise<GitResolvedRepository>>();
  const workspaceRepositoryInfoRequests = new Map<string, Promise<GitWorkspaceRepositoryInfo>>();
  const statusRequests = new Map<string, Promise<GitStatusSnapshot>>();
  const collapsedUntrackedRepoRoots = new Set<string>();

  function* executeRepositoryReadPlan<T>(
    program: GitRepositoryReadProgram<T>,
  ): Generator<unknown, T, unknown> {
    let step = program.next();
    while (!step.done) {
      const request = step.value;
      let value: unknown;
      try {
        switch (request.kind) {
          case "discover":
            value = yield commandProvider.resolveGitBinary();
            break;
          case "command":
            value = yield commandProvider.run(request.options);
            break;
          case "stat":
            value = yield stat(request.path);
            break;
          case "read":
            value = yield readFile(request.path, request.encoding);
            break;
        }
      } catch (error) {
        step = program.throw(error);
        continue;
      }
      step = program.next(value);
    }
    return step.value;
  }

  function executeGitStatus(resolution: GitResolvedRepository, untrackedMode: "all" | "normal") {
    return commandProvider.run({
      cwd: resolution.repoRoot,
      args: ["status", "--porcelain=v2", "--branch", `--untracked-files=${untrackedMode}`, "-z"],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
    });
  }

  async function runGitStatus(resolution: GitResolvedRepository) {
    let mode: "all" | "normal" = collapsedUntrackedRepoRoots.has(resolution.repoRoot)
      ? "normal"
      : "all";
    while (true) {
      const result = await executeGitStatus(resolution, mode);
      if (mode === "normal" || !result.outputTruncated) return result;

      // 每个调用保留开始时的模式；仅 full 超限转一次 normal，先登记再警告，失败也保留标记。
      collapsedUntrackedRepoRoots.add(resolution.repoRoot);
      log.warn(
        undefined,
        `git status detailed output exceeded limit; collapsing untracked directories repoRoot=${resolution.repoRoot}`,
      );
      mode = "normal";
    }
  }

  function reuseInFlightRequest<T>(
    requests: Map<string, Promise<T>>,
    key: string,
    factory: () => Promise<T>,
  ): Promise<T> {
    const existing = requests.get(key);
    if (existing) {
      return existing;
    }

    const request = factory();
    requests.set(key, request);
    const cleanup = () => {
      if (requests.get(key) === request) {
        requests.delete(key);
      }
    };
    void request.then(cleanup, cleanup);
    return request;
  }

  function invalidate(workspacePath: string): void {
    repositoryResolutionRequests.delete(workspacePath);
    workspaceRepositoryInfoRequests.delete(workspacePath);
    statusRequests.delete(workspacePath);
  }

  async function validateBranchName(
    resolution: GitResolvedRepository,
    branchName: string,
  ): Promise<GitBranchMutationIssue | null> {
    const result = await commandProvider.run({
      cwd: resolution.repoRoot,
      args: ["check-ref-format", "--branch", branchName],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    });
    if (result.timedOut || result.outputTruncated) {
      ensureGitCommandSucceeded("git check-ref-format --branch", result);
    }

    return result.exitCode === 0 ? null : toInvalidBranchNameIssue(result.stderr);
  }

  async function hasOperationInProgress(resolution: GitResolvedRepository): Promise<boolean> {
    // 进行中的 merge / rebase / cherry-pick 在不同 Git 版本上的报错并不完全稳定，
    // 这里先通过 git-dir 标记位做一次轻量探测，让上层能拿到更稳定的阻塞原因。
    const gitPathResult = await commandProvider.run({
      cwd: resolution.repoRoot,
      args: ["rev-parse", ...GIT_OPERATION_MARKERS.flatMap((marker) => ["--git-path", marker])],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    });
    ensureGitCommandSucceeded("git rev-parse --git-path", gitPathResult);

    const candidatePaths = gitPathResult.stdout
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => (isAbsolute(line) ? line : resolve(resolution.repoRoot, line)));

    const markerExists = await Promise.all(candidatePaths.map((path) => fileExists(path)));
    return markerExists.some(Boolean);
  }

  async function readOptionalGitConfig(
    resolution: GitResolvedRepository,
    key: string,
  ): Promise<string | null> {
    const result = await commandProvider.run({
      cwd: resolution.repoRoot,
      args: ["config", "--get", key],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
    });
    if (result.timedOut || result.outputTruncated) {
      ensureGitCommandSucceeded(`git config --get ${key}`, result);
    }

    if (result.exitCode === 0) {
      const value = result.stdout.trim();
      return value.length > 0 ? value : null;
    }

    if (result.exitCode === 1) {
      return null;
    }

    ensureGitCommandSucceeded(`git config --get ${key}`, result);
    return null;
  }

  async function listRemotes(resolution: GitResolvedRepository): Promise<string[]> {
    const result = await commandProvider.run({
      cwd: resolution.repoRoot,
      args: ["remote"],
      timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
    });
    ensureGitCommandSucceeded("git remote", result);
    return parseRemoteList(result.stdout);
  }

  async function resolvePushRemote(status: GitStatusSnapshot): Promise<string> {
    const resolution = ensureRepositoryAvailable(status.resolution, "push changes");
    const branchName = status.summary.branchName?.trim() ?? "";
    if (branchName.length === 0) {
      throw new Error("Cannot resolve a Git push remote without a current branch.");
    }

    const branchRemote = await readOptionalGitConfig(resolution, `branch.${branchName}.remote`);
    if (branchRemote) {
      return branchRemote;
    }

    const pushDefaultRemote = await readOptionalGitConfig(resolution, "remote.pushDefault");
    if (pushDefaultRemote) {
      return pushDefaultRemote;
    }

    const remotes = await listRemotes(resolution);
    if (remotes.includes("origin")) {
      return "origin";
    }

    if (remotes.length === 1) {
      return remotes[0]!;
    }

    if (remotes.length === 0) {
      throw new Error("No Git remote is configured for the current repository.");
    }

    throw new Error(
      "Multiple Git remotes are configured. Configure branch.<name>.remote or remote.pushDefault first.",
    );
  }

  return {
    invalidate,

    async resolveRepository(workspacePath: string): Promise<GitResolvedRepository> {
      // 启动并发请求仍由现有 map 合并；私有只读程序不保留跨请求状态。
      return await reuseInFlightRequest(repositoryResolutionRequests, workspacePath, async () => {
        // 额外 await 编排函数会延后 map 清理并改变同键复用；冻结时序证明要求由原工厂等待效果。
        const execution = executeRepositoryReadPlan(planGitRepositoryResolution(workspacePath));
        let step = execution.next();
        while (!step.done) {
          let value: unknown;
          try {
            value = await step.value;
          } catch (error) {
            step = execution.throw(error);
            continue;
          }
          step = execution.next(value);
        }
        return step.value;
      });
    },

    async getWorkspaceRepositoryInfo(workspacePath: string): Promise<GitWorkspaceRepositoryInfo> {
      return await reuseInFlightRequest(
        workspaceRepositoryInfoRequests,
        workspacePath,
        async () => {
          const resolution = await this.resolveRepository(workspacePath);
          const execution = executeRepositoryReadPlan(
            planGitWorkspaceRepositoryInfo(workspacePath, resolution),
          );
          // 保留原 resolve/stat/read 的 await 边界，不能再等待一个异步编排结果。
          let step = execution.next();
          while (!step.done) {
            let value: unknown;
            try {
              value = await step.value;
            } catch (error) {
              step = execution.throw(error);
              continue;
            }
            step = execution.next(value);
          }
          return step.value;
        },
      );
    },

    async getStatus(workspacePath: string): Promise<GitStatusSnapshot> {
      // staged / unstaged / summary / branch 比较都依赖同一份状态快照，
      // 并发复用可以把一次渲染里的重复 `status + diff --numstat` 合并成一轮 Git CLI 调用。
      return await reuseInFlightRequest(statusRequests, workspacePath, async () => {
        const resolution = await this.resolveRepository(workspacePath);
        if (!resolution.isGitAvailable || !resolution.isRepository) {
          return {
            resolution,
            summary: createEmptySummary(resolution),
            entries: [],
            stagedStats: new Map(),
            unstagedStats: new Map(),
            untrackedStats: new Map(),
          };
        }

        const readNumstat = (staged: boolean) =>
          commandProvider.run({
            cwd: resolution.repoRoot,
            args: [
              "diff",
              ...(staged ? ["--cached"] : []),
              "--numstat",
              "-z",
              "--find-renames",
              "--",
            ],
            timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
            maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
          });
        const [statusResult, stagedStatsResult, unstagedStatsResult] = await Promise.all([
          runGitStatus(resolution),
          readNumstat(true),
          readNumstat(false),
        ]);

        for (const [label, result] of [
          ["git status", statusResult],
          ["git diff --cached --numstat", stagedStatsResult],
          ["git diff --numstat", unstagedStatsResult],
        ] as const) {
          ensureGitCommandSucceeded(label, result);
        }

        const parsedStatus = parseStatusPorcelain(statusResult.stdout);
        const untrackedStats = await buildUntrackedStats(resolution.repoRoot, parsedStatus.entries);

        return {
          resolution,
          summary: {
            workspacePath: resolution.workspacePath,
            repoRoot: resolution.repoRoot,
            workspaceInRepoPath: resolution.workspaceInRepoPath,
            autoRefreshWatchPaths: resolution.autoRefreshWatchPaths,
            branchName: parsedStatus.branchName,
            trackingBranchName: parsedStatus.trackingBranchName,
            headRefType: parsedStatus.headRefType,
            ahead: parsedStatus.ahead,
            behind: parsedStatus.behind,
            isDirty: parsedStatus.entries.length > 0,
            isGitAvailable: true,
            isRepository: true,
          },
          entries: parsedStatus.entries,
          stagedStats: parseNumstat(stagedStatsResult.stdout),
          unstagedStats: parseNumstat(unstagedStatsResult.stdout),
          untrackedStats,
        };
      });
    },

    async getIgnoredPaths(workspacePath: string, paths: string[]): Promise<string[]> {
      const program = planGitIgnoredPaths(paths);
      let step = program.next();
      while (!step.done) {
        const operation = step.value;
        switch (operation.kind) {
          case "resolve": {
            const resolution = await this.resolveRepository(workspacePath);
            step = program.next(resolution);
            break;
          }
          case "normalize": {
            const resolution = operation.resolution;
            const inputPairs = await Promise.all(
              operation.paths.map(async (path) => {
                try {
                  return {
                    absolutePath: isAbsolute(path)
                      ? path
                      : resolve(resolution.workspacePath, path.split("/").join(sep)),
                    repoRelativePath: await normalizeInputPath(resolution, path),
                  };
                } catch {
                  return null;
                }
              }),
            );
            step = program.next(inputPairs);
            break;
          }
          case "check": {
            const result = await commandProvider.run(operation.command);
            step = program.next(result);
            break;
          }
        }
      }
      return step.value;
    },

    async listLocalBranches(workspacePath: string): Promise<GitLocalBranchListResult> {
      const program = planGitLocalBranches();
      let step = program.next();
      while (!step.done) {
        const operation = step.value;
        if (operation.kind === "status") {
          const status = await this.getStatus(workspacePath);
          step = program.next(status);
        } else {
          const result = await commandProvider.run(operation.command);
          step = program.next(result);
        }
      }
      return step.value;
    },

    async getCommitGraph(
      workspacePath: string,
      maxCount?: number,
      skip?: number,
    ): Promise<GitCommitGraphSnapshot> {
      const resolution = await this.resolveRepository(workspacePath);
      if (!resolution.isGitAvailable || !resolution.isRepository) {
        return {
          resolution,
          commits: [],
          hasMore: false,
        };
      }

      const plan = planGitCommitGraphQuery(maxCount, skip);
      const result = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: plan.args,
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
        maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
      });
      return projectGitCommitGraphQuery(resolution, plan, result, ensureGitCommandSucceeded);
    },

    async switchBranch(
      workspacePath: string,
      targetBranchName: string,
    ): Promise<GitBranchMutationResult> {
      const status = await this.getStatus(workspacePath);
      const resolution = ensureRepositoryAvailable(status.resolution, "switch branches");
      const normalizedBranchName = targetBranchName.trim();
      if (normalizedBranchName.length === 0) {
        return toBranchMutationFailure({
          action: "switch",
          branchName: null,
          summary: status.summary,
          issues: [toInvalidBranchNameIssue()],
        });
      }

      if (
        status.summary.headRefType === "branch" &&
        status.summary.branchName === normalizedBranchName
      ) {
        return toBranchMutationSuccess({
          action: "switch",
          branchName: normalizedBranchName,
          didChange: false,
          created: false,
          summary: status.summary,
        });
      }

      // 这里优先返回当前仓库已知的阻塞状态，避免 UI 只能看到一条模糊的 Git 原生错误。
      if (status.entries.some((entry) => entry.isConflicted)) {
        return toBranchMutationFailure({
          action: "switch",
          branchName: normalizedBranchName,
          summary: status.summary,
          issues: [
            {
              code: "conflicts-present",
              message: "Repository still has unresolved conflicts.",
            },
          ],
        });
      }

      if (await hasOperationInProgress(resolution)) {
        return toBranchMutationFailure({
          action: "switch",
          branchName: normalizedBranchName,
          summary: status.summary,
          issues: [
            {
              code: "operation-in-progress",
              message: "Another Git operation is still in progress.",
            },
          ],
        });
      }

      const invalidBranchIssue = await validateBranchName(resolution, normalizedBranchName);
      if (invalidBranchIssue) {
        return toBranchMutationFailure({
          action: "switch",
          branchName: normalizedBranchName,
          summary: status.summary,
          issues: [invalidBranchIssue],
        });
      }

      const result = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: ["switch", "--no-guess", normalizedBranchName],
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
        maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
      });
      if (result.exitCode !== 0) {
        return toBranchMutationFailure({
          action: "switch",
          branchName: normalizedBranchName,
          summary: status.summary,
          issues: parseGitBranchMutationIssues(result),
        });
      }

      invalidate(workspacePath);
      const nextStatus = await this.getStatus(workspacePath);
      return toBranchMutationSuccess({
        action: "switch",
        branchName: normalizedBranchName,
        didChange: true,
        created: false,
        summary: nextStatus.summary,
      });
    },

    async createBranchAndSwitch(
      workspacePath: string,
      branchName: string,
      startPoint?: string,
    ): Promise<GitBranchMutationResult> {
      const status = await this.getStatus(workspacePath);
      const resolution = ensureRepositoryAvailable(status.resolution, "create and switch branches");
      const normalizedBranchName = branchName.trim();
      if (normalizedBranchName.length === 0) {
        return toBranchMutationFailure({
          action: "create-and-switch",
          branchName: null,
          summary: status.summary,
          issues: [toInvalidBranchNameIssue()],
        });
      }

      if (status.entries.some((entry) => entry.isConflicted)) {
        return toBranchMutationFailure({
          action: "create-and-switch",
          branchName: normalizedBranchName,
          summary: status.summary,
          issues: [
            {
              code: "conflicts-present",
              message: "Repository still has unresolved conflicts.",
            },
          ],
        });
      }

      if (await hasOperationInProgress(resolution)) {
        return toBranchMutationFailure({
          action: "create-and-switch",
          branchName: normalizedBranchName,
          summary: status.summary,
          issues: [
            {
              code: "operation-in-progress",
              message: "Another Git operation is still in progress.",
            },
          ],
        });
      }

      const invalidBranchIssue = await validateBranchName(resolution, normalizedBranchName);
      if (invalidBranchIssue) {
        return toBranchMutationFailure({
          action: "create-and-switch",
          branchName: normalizedBranchName,
          summary: status.summary,
          issues: [invalidBranchIssue],
        });
      }

      const normalizedStartPoint = startPoint?.trim();
      // startPoint 可能来自外部输入；如果值本身以 `-` 开头，
      // Git 会把它继续当成 switch 的选项解析，而不是起始引用。
      // 这里显式插入 `--` 终止选项解析，确保后面的值始终按位置参数处理。
      const result = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: normalizedStartPoint
          ? ["switch", "--no-guess", "-c", normalizedBranchName, "--", normalizedStartPoint]
          : ["switch", "--no-guess", "-c", normalizedBranchName],
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
        maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
      });
      if (result.exitCode !== 0) {
        return toBranchMutationFailure({
          action: "create-and-switch",
          branchName: normalizedBranchName,
          summary: status.summary,
          issues: parseGitBranchMutationIssues(result),
        });
      }

      invalidate(workspacePath);
      const nextStatus = await this.getStatus(workspacePath);
      return toBranchMutationSuccess({
        action: "create-and-switch",
        branchName: normalizedBranchName,
        didChange: true,
        created: true,
        summary: nextStatus.summary,
      });
    },

    async getDiff(params: GitDiffQuery): Promise<GitDiffResult> {
      const program = planGitDiffRead(params, {
        repo: this,
        commandProvider,
        branch: readBranchDiffContents,
        staged: readStagedDiffContents,
        worktree: readUnstagedDiffContents,
        unavailable: toUnavailableDiff,
        attach: withDiffContents,
      });
      let step = program.next();
      while (!step.done) step = program.next(await step.value());
      return step.value;
    },

    async getBranchComparison(workspacePath: string): Promise<GitBranchComparisonSnapshot> {
      const program = planGitBranchComparison();
      let step = program.next();
      while (!step.done) {
        const operation = step.value;
        if (operation.kind === "status") {
          const status = await this.getStatus(workspacePath);
          step = program.next(status);
        } else {
          const result = await commandProvider.run(operation.command);
          step = program.next(result);
        }
      }
      return step.value;
    },

    async stage(workspacePath: string, paths: string[]): Promise<void> {
      const resolution = ensureRepositoryAvailable(
        await this.resolveRepository(workspacePath),
        "stage paths",
      );
      const repoPaths = Array.from(
        new Set(await Promise.all(paths.map((path) => normalizeInputPath(resolution, path)))),
      );
      if (repoPaths.length === 0) {
        return;
      }

      const result = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: ["add", "--", ...repoPaths],
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      });
      ensureGitCommandSucceeded("git add", result);
      invalidate(workspacePath);
    },

    async unstage(workspacePath: string, paths: string[]): Promise<void> {
      const resolution = ensureRepositoryAvailable(
        await this.resolveRepository(workspacePath),
        "unstage paths",
      );
      const repoPaths = Array.from(
        new Set(await Promise.all(paths.map((path) => normalizeInputPath(resolution, path)))),
      );
      if (repoPaths.length === 0) {
        return;
      }

      const result = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: ["restore", "--staged", "--", ...repoPaths],
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      });
      ensureGitCommandSucceeded("git restore --staged", result);
      invalidate(workspacePath);
    },

    async discard(workspacePath: string, paths: string[], staged: boolean): Promise<void> {
      const resolution = ensureRepositoryAvailable(
        await this.resolveRepository(workspacePath),
        "discard paths",
      );
      const repoPaths = Array.from(
        new Set(await Promise.all(paths.map((path) => normalizeInputPath(resolution, path)))),
      );
      if (repoPaths.length === 0) {
        return;
      }

      const result = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: staged
          ? ["restore", "--source=HEAD", "--staged", "--worktree", "--", ...repoPaths]
          : ["restore", "--worktree", "--", ...repoPaths],
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      });
      ensureGitCommandSucceeded("git restore", result);
      invalidate(workspacePath);
    },

    async commit(
      workspacePath: string,
      message: string,
      paths?: string[],
      options?: { stagedOnly?: boolean },
    ): Promise<{ commitHash: string }> {
      const resolution = ensureRepositoryAvailable(
        await this.resolveRepository(workspacePath),
        "commit changes",
      );
      const trimmedMessage = message.trim();
      if (trimmedMessage.length === 0) {
        throw new Error("Commit message cannot be empty");
      }
      const repoPaths =
        paths && paths.length > 0
          ? Array.from(
              new Set(await Promise.all(paths.map((path) => normalizeInputPath(resolution, path)))),
            )
          : [];

      if (options?.stagedOnly && repoPaths.length > 0) {
        const scopedStatusResult = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: ["status", "--porcelain=v2", "-z", "--", ...repoPaths],
          timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
          maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
        });
        ensureGitCommandSucceeded("git status selected paths", scopedStatusResult);

        const cleanupRepoPaths = Array.from(
          new Set([
            ...repoPaths,
            ...parseStatusPorcelain(scopedStatusResult.stdout)
              .entries.filter((entry) => repoPaths.includes(entry.path))
              .map((entry) => entry.originalPath)
              .filter((path): path is string => Boolean(path)),
          ]),
        );
        const stagedEntriesResult = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: ["ls-files", "--stage", "-z", "--", ...repoPaths],
          timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
          maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
        });
        ensureGitCommandSucceeded("git ls-files selected staged entries", stagedEntriesResult);
        const stagedEntries = parseGitIndexEntries(stagedEntriesResult.stdout);
        if (stagedEntries.some((entry) => entry.stage !== "0")) {
          throw new Error("Cannot commit selected staged paths while index conflicts exist.");
        }

        const headResult = await commandProvider.run({
          cwd: resolution.repoRoot,
          args: ["rev-parse", "--verify", "HEAD"],
          timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
        });
        const parentHash = headResult.exitCode === 0 ? headResult.stdout.trim() : null;
        // 私有临时索引跟随当前资料目录，便携运行不会写系统临时目录。
        const tempIndexRoot = join(getKnorviaDataRootDir(), "tmp");
        await mkdir(tempIndexRoot, { recursive: true });
        const tempIndexDir = await mkdtemp(join(tempIndexRoot, "git-index-"));
        const tempIndexPath = join(tempIndexDir, "index");
        const tempIndexEnv = { GIT_INDEX_FILE: tempIndexPath };

        try {
          const readTreeResult = await commandProvider.run({
            cwd: resolution.repoRoot,
            args: parentHash ? ["read-tree", parentHash] : ["read-tree", "--empty"],
            env: tempIndexEnv,
            timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
          });
          ensureGitCommandSucceeded("git read-tree selected commit base", readTreeResult);

          if (cleanupRepoPaths.length > 0) {
            const removeResult = await commandProvider.run({
              cwd: resolution.repoRoot,
              args: ["update-index", "--force-remove", "--", ...cleanupRepoPaths],
              env: tempIndexEnv,
              timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
            });
            ensureGitCommandSucceeded("git update-index remove selected paths", removeResult);
          }

          for (const entry of stagedEntries) {
            const addResult = await commandProvider.run({
              cwd: resolution.repoRoot,
              args: [
                "update-index",
                "--add",
                "--cacheinfo",
                entry.mode,
                entry.objectHash,
                entry.path,
              ],
              env: tempIndexEnv,
              timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
            });
            ensureGitCommandSucceeded("git update-index add selected paths", addResult);
          }

          const scopedCommitResult = await commandProvider.run({
            cwd: resolution.repoRoot,
            args: ["commit", "-m", trimmedMessage],
            env: tempIndexEnv,
            timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
            maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
          });
          ensureGitCommandSucceeded("git commit selected staged paths", scopedCommitResult);

          const hashResult = await commandProvider.run({
            cwd: resolution.repoRoot,
            args: ["rev-parse", "HEAD"],
            timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
          });
          ensureGitCommandSucceeded("git rev-parse selected commit HEAD", hashResult);
          const commitHash = hashResult.stdout.trim();

          // 提交当前会话文件时不能把真实 index 整体替换成临时 index。
          // 这里只把已提交的路径同步到新 HEAD，保留其它已暂存文件继续等待用户手动提交。
          const resetSelectedResult = await commandProvider.run({
            cwd: resolution.repoRoot,
            args: ["reset", "--quiet", "HEAD", "--", ...cleanupRepoPaths],
            timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
          });
          ensureGitCommandSucceeded("git reset selected committed paths", resetSelectedResult);
          invalidate(workspacePath);
          return { commitHash };
        } finally {
          await rm(tempIndexDir, { recursive: true, force: true });
        }
      }

      const commitResult = await commandProvider.run({
        cwd: resolution.repoRoot,
        args:
          repoPaths.length > 0
            ? ["commit", "-m", trimmedMessage, "--", ...repoPaths]
            : ["commit", "-m", trimmedMessage],
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
        maxOutputBytes: DEFAULT_GIT_OUTPUT_BYTES,
      });
      ensureGitCommandSucceeded("git commit", commitResult);
      invalidate(workspacePath);

      const hashResult = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: ["rev-parse", "HEAD"],
        timeoutMs: DEFAULT_GIT_COMMAND_TIMEOUT_MS,
      });
      ensureGitCommandSucceeded("git rev-parse HEAD", hashResult);
      return { commitHash: hashResult.stdout.trim() };
    },

    async push(workspacePath: string): Promise<GitPushResult> {
      const status = await this.getStatus(workspacePath);
      const resolution = ensureRepositoryAvailable(status.resolution, "push changes");
      const branchName = status.summary.branchName?.trim() ?? "";
      if (status.summary.headRefType !== "branch" || branchName.length === 0) {
        throw new Error("Cannot push while HEAD is detached.");
      }

      const hasTrackingBranch = Boolean(status.summary.trackingBranchName);
      const remoteName = hasTrackingBranch
        ? parseTrackingRemoteName(status.summary.trackingBranchName)
        : await resolvePushRemote(status);
      const pushResult = await commandProvider.run({
        cwd: resolution.repoRoot,
        args: hasTrackingBranch
          ? ["push"]
          : ["push", "--set-upstream", remoteName ?? "origin", branchName],
        // 关键业务逻辑：push 是显式用户动作，而且可能被 pre-push hook 拉长。
        // 这里单独使用更长超时，避免测试/校验脚本尚未跑完就被前端误判成 push 失败。
        timeoutMs: DEFAULT_GIT_PUSH_TIMEOUT_MS,
        // 关键业务逻辑：pre-push hook 可能输出完整测试日志。
        // 这里单独放宽输出上限，避免在 push 真正完成前因为 hook 输出过多被截断。
        maxOutputBytes: DEFAULT_GIT_PUSH_OUTPUT_BYTES,
      });
      ensureGitCommandSucceeded("git push", pushResult);
      invalidate(workspacePath);

      const nextStatus = await this.getStatus(workspacePath);
      return {
        branchName,
        trackingBranchName: nextStatus.summary.trackingBranchName,
        remoteName: remoteName ?? parseTrackingRemoteName(nextStatus.summary.trackingBranchName),
        setUpstream: !hasTrackingBranch,
        summary: nextStatus.summary,
      };
    },

    async getIdentity(workspacePath: string): Promise<GitIdentity> {
      const resolution = await this.resolveRepository(workspacePath);
      if (!resolution.isGitAvailable || !resolution.isRepository) return emptyGitIdentity();
      const results = await Promise.all(readGitIdentity(commandProvider, resolution));
      return projectGitIdentity(results);
    },
  };
}
