import {
  createGitCommandProvider,
  type GitCommandProvider,
} from "../providers/gitCommandProvider.js";
import type { GitCliRepo } from "./gitCliTypes.js";
import { createResolutionMethods } from "./gitRepoResolution.js";
import { createStatusMethods } from "./gitRepoStatus.js";
import { createBranchMethods } from "./gitRepoBranches.js";
import { createDiffMethods } from "./gitRepoDiff.js";
import { createWriteMethods } from "./gitRepoWrites.js";
import { createPushMethods } from "./gitRepoPush.js";
import type { RepoOwner } from "./gitRepoOwner.js";

export type {
  GitBranchComparisonChange,
  GitBranchComparisonSnapshot,
  GitCliRepo,
  GitLineStat,
  GitResolvedRepository,
  GitStatusEntry,
  GitStatusSnapshot,
} from "./gitCliTypes.js";

export function createGitCliRepo(options?: { commandProvider?: GitCommandProvider }): GitCliRepo {
  const owner: RepoOwner = {
    provider: options?.commandProvider ?? createGitCommandProvider(),
    invalidate() {},
  };
  const resolution = createResolutionMethods(owner);
  const status = createStatusMethods(owner);
  const branches = createBranchMethods(owner);
  const diff = createDiffMethods(owner);
  const writes = createWriteMethods(owner);
  const push = createPushMethods(owner);
  return {
    invalidate(workspacePath) {
      owner.invalidate(workspacePath);
    },
    resolveRepository: resolution.resolveRepository,
    getWorkspaceRepositoryInfo: resolution.getWorkspaceRepositoryInfo,
    getStatus: status.getStatus,
    getIgnoredPaths: status.getIgnoredPaths,
    listLocalBranches: status.listLocalBranches,
    getCommitGraph: status.getCommitGraph,
    switchBranch: branches.switchBranch,
    createBranchAndSwitch: branches.createBranchAndSwitch,
    getDiff: diff.getDiff,
    getBranchComparison: status.getBranchComparison,
    stage: writes.stage,
    unstage: writes.unstage,
    discard: writes.discard,
    commit: writes.commit,
    push: push.push,
    getIdentity: status.getIdentity,
  };
}
