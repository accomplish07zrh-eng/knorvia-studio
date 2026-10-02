import { isAbsolute, resolve } from "node:path";
import type {
  GitBranchMutationAction,
  GitBranchMutationIssue,
  GitBranchMutationResult,
  GitRepositorySummary,
} from "@knorvia/shared";
import type { GitCliRepo, GitResolvedRepository } from "./gitCliTypes.js";
import {
  ensureGitCommandSucceeded,
  ensureRepositoryAvailable,
  fileExists,
  parseGitBranchMutationIssues,
  toInvalidBranchNameIssue,
} from "./gitCliHelpers.js";
import { OUTPUT_BYTES, runAt, type RepoOwner } from "./gitRepoOwner.js";

type BranchMethods = Pick<GitCliRepo, "switchBranch" | "createBranchAndSwitch">;

function outcome(
  action: GitBranchMutationAction,
  branchName: string | null,
  summary: GitRepositorySummary,
  issues: GitBranchMutationIssue[],
  didChange = false,
  created = false,
): GitBranchMutationResult {
  return { ok: issues.length === 0, action, branchName, didChange, created, summary, issues };
}

async function hasOperation(owner: RepoOwner, resolution: GitResolvedRepository): Promise<boolean> {
  const markers = [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "REBASE_HEAD",
    "rebase-merge",
    "rebase-apply",
    "BISECT_LOG",
  ];
  const result = await runAt(owner, resolution, [
    "rev-parse",
    ...markers.flatMap((marker) => ["--git-path", marker]),
  ]);
  ensureGitCommandSucceeded("git rev-parse --git-path", result);
  const candidates = result.stdout
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((path) => (isAbsolute(path) ? path : resolve(resolution.repoRoot, path)));
  return (await Promise.all(candidates.map((path) => fileExists(path)))).some(Boolean);
}

async function validateBranch(
  owner: RepoOwner,
  resolution: GitResolvedRepository,
  branchName: string,
): Promise<GitBranchMutationIssue | null> {
  const result = await runAt(owner, resolution, ["check-ref-format", "--branch", branchName]);
  if (result.timedOut || result.outputTruncated)
    ensureGitCommandSucceeded("git check-ref-format --branch", result);
  return result.exitCode === 0 ? null : toInvalidBranchNameIssue(result.stderr);
}

export function createBranchMethods(owner: RepoOwner): BranchMethods {
  return {
    async switchBranch(this: GitCliRepo, workspacePath, targetBranchName) {
      const status = await this.getStatus(workspacePath);
      ensureRepositoryAvailable(status.resolution, "switch branches");
      const branchName = targetBranchName.trim();
      if (!branchName) return outcome("switch", null, status.summary, [toInvalidBranchNameIssue()]);
      if (status.summary.headRefType === "branch" && status.summary.branchName === branchName)
        return outcome("switch", branchName, status.summary, []);
      if (status.entries.some((entry) => entry.isConflicted))
        return outcome("switch", branchName, status.summary, [
          { code: "conflicts-present", message: "Repository still has unresolved conflicts." },
        ]);
      if (await hasOperation(owner, status.resolution))
        return outcome("switch", branchName, status.summary, [
          { code: "operation-in-progress", message: "Another Git operation is still in progress." },
        ]);
      const issue = await validateBranch(owner, status.resolution, branchName);
      if (issue) return outcome("switch", branchName, status.summary, [issue]);
      const result = await runAt(owner, status.resolution, ["switch", "--no-guess", branchName], {
        maxOutputBytes: OUTPUT_BYTES,
      });
      if (result.exitCode !== 0)
        return {
          ...outcome("switch", branchName, status.summary, parseGitBranchMutationIssues(result)),
          ok: false,
        };
      owner.invalidate(workspacePath);
      const refreshed = await this.getStatus(workspacePath);
      return outcome("switch", branchName, refreshed.summary, [], true);
    },
    async createBranchAndSwitch(this: GitCliRepo, workspacePath, requestedName, startPoint) {
      const status = await this.getStatus(workspacePath);
      ensureRepositoryAvailable(status.resolution, "create and switch branches");
      const branchName = requestedName.trim();
      if (!branchName)
        return outcome("create-and-switch", null, status.summary, [toInvalidBranchNameIssue()]);
      if (status.entries.some((entry) => entry.isConflicted))
        return outcome("create-and-switch", branchName, status.summary, [
          { code: "conflicts-present", message: "Repository still has unresolved conflicts." },
        ]);
      if (await hasOperation(owner, status.resolution))
        return outcome("create-and-switch", branchName, status.summary, [
          { code: "operation-in-progress", message: "Another Git operation is still in progress." },
        ]);
      const issue = await validateBranch(owner, status.resolution, branchName);
      if (issue) return outcome("create-and-switch", branchName, status.summary, [issue]);
      const start = startPoint?.trim();
      const args = start
        ? ["switch", "--no-guess", "-c", branchName, "--", start]
        : ["switch", "--no-guess", "-c", branchName];
      const result = await runAt(owner, status.resolution, args, { maxOutputBytes: OUTPUT_BYTES });
      if (result.exitCode !== 0)
        return {
          ...outcome(
            "create-and-switch",
            branchName,
            status.summary,
            parseGitBranchMutationIssues(result),
          ),
          ok: false,
        };
      owner.invalidate(workspacePath);
      const refreshed = await this.getStatus(workspacePath);
      return outcome("create-and-switch", branchName, refreshed.summary, [], true, true);
    },
  };
}
