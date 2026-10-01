// Source-exposed inherited service. Read projection has one private replacement
// owner; public methods, generation, commands and mutation policy remain retained.
import type { GitBranchComparison, GitFileChange } from "@knorvia/shared";
import { filterCommitMessageFilesByCurrentSession } from "./commitMessageFileScope.js";
import type { IGitService } from "./git.js";
import type { GitCommitMessageGenerator } from "./gitCommitMessageGenerator.js";
import { getBranchComparisonChanges, getChangesForSource } from "./gitServiceReadProjection.js";
import { createGitCliRepo, type GitCliRepo } from "./repo/gitCliRepo.js";

const COMMIT_MESSAGE_DIFF_FILE_LIMIT = 8;

function getCommitMessageDiffQueries(
  files: readonly GitFileChange[],
  includeUnstaged: boolean,
): Array<{ path: string; sourceId: "unstaged" | "staged" }> {
  const queries: Array<{ path: string; sourceId: "unstaged" | "staged" }> = [];
  for (const file of files.slice(0, COMMIT_MESSAGE_DIFF_FILE_LIMIT)) {
    if (file.section === "staged") {
      queries.push({ path: file.path, sourceId: "staged" });
      continue;
    }

    if (!includeUnstaged) {
      continue;
    }

    queries.push({ path: file.path, sourceId: "unstaged" });
  }
  return queries;
}

export function createGitService(options?: {
  repo?: GitCliRepo;
  commitMessageGenerator?: GitCommitMessageGenerator;
}): IGitService {
  const repo = options?.repo ?? createGitCliRepo();

  return {
    async getRepositorySummary(params) {
      const status = await repo.getStatus(params.workspacePath);
      return status.summary;
    },

    async getWorkspaceRepositoryInfo(params) {
      return await repo.getWorkspaceRepositoryInfo(params.workspacePath);
    },

    async getLocalBranches(params) {
      return await repo.listLocalBranches(params.workspacePath);
    },

    async getCommitGraph(params) {
      const snapshot = await repo.getCommitGraph(
        params.workspacePath,
        params.maxCount,
        params.skip,
      );
      return {
        commits: snapshot.commits,
        hasMore: snapshot.hasMore,
      };
    },

    async switchBranch(params) {
      return await repo.switchBranch(params.workspacePath, params.targetBranchName);
    },

    async createBranchAndSwitch(params) {
      return await repo.createBranchAndSwitch(
        params.workspacePath,
        params.branchName,
        params.startPoint,
      );
    },

    async getChanges(params) {
      const status = await repo.getStatus(params.workspacePath);

      // workspace 可以是 monorepo 子目录，所以这里统一在 service 层按作用域裁剪。
      // 这样 repo 继续只负责“把 Git 原始状态解析出来”，上层则始终拿到符合当前 workspace 边界的数据。
      return getChangesForSource(status, params.sourceId);
    },

    async getIgnoredPaths(params) {
      return await repo.getIgnoredPaths(params.workspacePath, params.paths);
    },

    async getDiff(params) {
      return await repo.getDiff(params);
    },

    async getBranchComparison(params): Promise<GitBranchComparison> {
      const comparison = await repo.getBranchComparison(params.workspacePath);
      return {
        baseRef: comparison.baseRef,
        headRef: comparison.headRef,
        comparisonLabel: comparison.comparisonLabel,
        changes: getBranchComparisonChanges(comparison),
      };
    },

    async stagePaths(params) {
      await repo.stage(params.workspacePath, params.paths);
    },

    async unstagePaths(params) {
      await repo.unstage(params.workspacePath, params.paths);
    },

    async discardPaths(params) {
      await repo.discard(params.workspacePath, params.paths, params.staged ?? false);
    },

    async generateCommitMessage(params) {
      if (!options?.commitMessageGenerator) {
        throw new Error("Commit message generation is not available.");
      }

      const includeUnstaged = (params as { includeUnstaged?: boolean }).includeUnstaged ?? true;
      const status = await repo.getStatus(params.workspacePath);
      const unstagedChanges = includeUnstaged ? getChangesForSource(status, "unstaged") : [];
      const stagedChanges = getChangesForSource(status, "staged");
      const files = filterCommitMessageFilesByCurrentSession({
        files: [...unstagedChanges, ...stagedChanges],
        workspacePath: params.workspacePath,
        repoRoot: status.resolution.repoRoot,
        workspaceInRepoPath: status.resolution.workspaceInRepoPath,
        currentSessionFilePaths: params.currentSessionFilePaths,
      });
      if (files.length === 0) {
        throw new Error("There are no changes available to commit.");
      }

      const diffQueries = getCommitMessageDiffQueries(files, includeUnstaged);
      const diffResults = await Promise.allSettled(
        diffQueries.map((query) =>
          repo.getDiff({
            workspacePath: params.workspacePath,
            path: query.path,
            sourceId: query.sourceId,
          }),
        ),
      );
      const diffs = diffResults.flatMap((result) =>
        result.status === "fulfilled" && (result.value.patch || result.value.summary)
          ? [result.value]
          : [],
      );

      return await options.commitMessageGenerator.generate({
        workspacePath: params.workspacePath,
        ...(params.workspaceIdentity ? { workspaceIdentity: params.workspaceIdentity } : {}),
        ...(params.locale ? { locale: params.locale } : {}),
        branchName: status.summary.branchName,
        files,
        diffs,
        ...(params.conversationContext ? { conversationContext: params.conversationContext } : {}),
      });
    },

    async commit(params) {
      const result = await repo.commit(params.workspacePath, params.message, params.paths, {
        stagedOnly: params.stagedOnly,
      });
      const status = await repo.getStatus(params.workspacePath);
      return {
        commitHash: result.commitHash,
        summary: status.summary,
      };
    },

    async push(params) {
      const result = await repo.push(params.workspacePath);
      return result;
    },

    async getIdentity(params) {
      return await repo.getIdentity(params.workspacePath);
    },

    async refresh(params) {
      const requests = [
        repo.getStatus(params.workspacePath),
        params.includeIdentity ? repo.getIdentity(params.workspacePath) : Promise.resolve(null),
        params.includeBranchComparison
          ? repo.getBranchComparison(params.workspacePath)
          : Promise.resolve(null),
      ] as const;
      const [status, identity, branchComparisonSnapshot] = await Promise.all(requests);
      let branchComparison: GitBranchComparison | null = null;
      if (branchComparisonSnapshot) {
        branchComparison = {
          baseRef: branchComparisonSnapshot.baseRef,
          headRef: branchComparisonSnapshot.headRef,
          comparisonLabel: branchComparisonSnapshot.comparisonLabel,
          changes: getBranchComparisonChanges(branchComparisonSnapshot),
        };
      }
      const frame = {
        summary: status.summary,
        identity,
        unstagedChanges: [] as GitFileChange[],
        stagedChanges: [] as GitFileChange[],
        branchComparison,
      };
      for (const source of ["unstaged", "staged"] as const) {
        frame[`${source}Changes`] = getChangesForSource(status, source);
      }
      return frame;
    },
  };
}
