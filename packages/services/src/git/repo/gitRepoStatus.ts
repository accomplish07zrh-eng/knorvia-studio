import { isAbsolute, resolve, sep } from "node:path";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import type { GitCliRepo, GitStatusSnapshot } from "./gitCliTypes.js";
import { createEmptySummary } from "./gitCliTypes.js";
import {
  buildUntrackedStats,
  ensureGitCommandSucceeded,
  inferKindFromNumstat,
  normalizeInputPath,
  parseGitConfigValue,
  parseNumstat,
  parseStatusPorcelain,
} from "./gitCliHelpers.js";
import { planGitCommitGraphQuery, projectGitCommitGraphQuery } from "./gitCommitGraphPlan.js";
import { inFlight, OUTPUT_BYTES, runAt, type RepoOwner } from "./gitRepoOwner.js";

const logger = createServiceLogger("git-repo");
type StatusMethods = Pick<
  GitCliRepo,
  | "getStatus"
  | "getIgnoredPaths"
  | "listLocalBranches"
  | "getCommitGraph"
  | "getBranchComparison"
  | "getIdentity"
>;

export function createStatusMethods(owner: RepoOwner): StatusMethods {
  const statuses = new Map<string, Promise<GitStatusSnapshot>>();
  const collapsedUntracked = new Set<string>();
  const previousInvalidate = owner.invalidate;
  owner.invalidate = (path) => {
    previousInvalidate(path);
    statuses.delete(path);
  };
  return {
    async getStatus(this: GitCliRepo, workspacePath) {
      return await inFlight(statuses, workspacePath, async () => {
        const resolution = await this.resolveRepository(workspacePath);
        if (!resolution.isGitAvailable || !resolution.isRepository)
          return {
            resolution,
            summary: createEmptySummary(resolution),
            entries: [],
            stagedStats: new Map(),
            unstagedStats: new Map(),
            untrackedStats: new Map(),
          };
        const status = async () => {
          const mode = collapsedUntracked.has(resolution.repoRoot) ? "normal" : "all";
          const result = await runAt(
            owner,
            resolution,
            ["status", "--porcelain=v2", "--branch", `--untracked-files=${mode}`, "-z"],
            { maxOutputBytes: OUTPUT_BYTES },
          );
          if (mode === "all" && result.outputTruncated) {
            collapsedUntracked.add(resolution.repoRoot);
            logger.warn(
              undefined,
              `git status detailed output exceeded limit; collapsing untracked directories repoRoot=${resolution.repoRoot}`,
            );
            return await runAt(
              owner,
              resolution,
              ["status", "--porcelain=v2", "--branch", "--untracked-files=normal", "-z"],
              { maxOutputBytes: OUTPUT_BYTES },
            );
          }
          return result;
        };
        const [statusResult, stagedResult, unstagedResult] = await Promise.all([
          status(),
          runAt(
            owner,
            resolution,
            ["diff", "--cached", "--numstat", "-z", "--find-renames", "--"],
            { maxOutputBytes: OUTPUT_BYTES },
          ),
          runAt(owner, resolution, ["diff", "--numstat", "-z", "--find-renames", "--"], {
            maxOutputBytes: OUTPUT_BYTES,
          }),
        ]);
        ensureGitCommandSucceeded("git status", statusResult);
        ensureGitCommandSucceeded("git diff --cached --numstat", stagedResult);
        ensureGitCommandSucceeded("git diff --numstat", unstagedResult);
        const parsed = parseStatusPorcelain(statusResult.stdout);
        const untrackedStats = await buildUntrackedStats(resolution.repoRoot, parsed.entries);
        return {
          resolution,
          summary: {
            workspacePath: resolution.workspacePath,
            repoRoot: resolution.repoRoot,
            workspaceInRepoPath: resolution.workspaceInRepoPath,
            autoRefreshWatchPaths: resolution.autoRefreshWatchPaths,
            branchName: parsed.branchName,
            trackingBranchName: parsed.trackingBranchName,
            headRefType: parsed.headRefType,
            ahead: parsed.ahead,
            behind: parsed.behind,
            isDirty: parsed.entries.length > 0,
            isGitAvailable: true,
            isRepository: true,
          },
          entries: parsed.entries,
          stagedStats: parseNumstat(stagedResult.stdout),
          unstagedStats: parseNumstat(unstagedResult.stdout),
          untrackedStats,
        };
      });
    },
    async getIgnoredPaths(this: GitCliRepo, workspacePath, paths) {
      if (!paths.length) return [];
      const resolution = await this.resolveRepository(workspacePath);
      if (!resolution.isGitAvailable || !resolution.isRepository) return [];
      const pairs = await Promise.all(
        paths.map(async (path) => {
          try {
            const absolutePath = isAbsolute(path)
              ? path
              : resolve(resolution.workspacePath, path.split("/").join(sep));
            const relativePath = await normalizeInputPath(resolution, path);
            return { absolutePath, relativePath };
          } catch {
            return null;
          }
        }),
      );
      const valid = pairs.filter((pair) => pair !== null);
      if (!valid.length) return [];
      const result = await runAt(
        owner,
        resolution,
        ["check-ignore", "--", ...valid.map((pair) => pair.relativePath)],
        { maxOutputBytes: OUTPUT_BYTES },
      );
      if (result.exitCode === 1) return [];
      ensureGitCommandSucceeded("git check-ignore", result);
      const ignored = new Set(
        result.stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => line.replace(/\\/g, "/")),
      );
      return valid
        .filter((pair) => ignored.has(pair.relativePath))
        .map((pair) => pair.absolutePath);
    },
    async listLocalBranches(this: GitCliRepo, workspacePath) {
      const status = await this.getStatus(workspacePath);
      if (!status.resolution.isGitAvailable || !status.resolution.isRepository)
        return {
          headRefType: status.summary.headRefType,
          currentBranchName: status.summary.branchName,
          branches: [],
        };
      const result = await runAt(
        owner,
        status.resolution,
        [
          "for-each-ref",
          "refs/heads",
          "--format=%(refname:short)%00%(upstream:short)%00%(objectname)%00%(committerdate:unix)",
        ],
        { maxOutputBytes: OUTPUT_BYTES },
      );
      ensureGitCommandSucceeded("git for-each-ref refs/heads", result);
      const currentBranchName = status.summary.branchName;
      const headRefType = status.summary.headRefType;
      const branches = result.stdout
        .replace(/\r\n/g, "\n")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          const [name, upstream, hash, seconds] = line.split("\0");
          if (!name) return [];
          const timestamp = seconds ? Number.parseInt(seconds, 10) : Number.NaN;
          return [
            {
              name,
              isCurrent: name === (headRefType === "branch" ? currentBranchName : null),
              upstreamName: upstream || null,
              commitHash: hash || null,
              commitTimestampMs: Number.isNaN(timestamp) ? null : timestamp * 1000,
            },
          ];
        });
      branches.sort(
        (left, right) =>
          Number(right.isCurrent) - Number(left.isCurrent) ||
          (right.commitTimestampMs ?? -Infinity) - (left.commitTimestampMs ?? -Infinity) ||
          left.name.localeCompare(right.name),
      );
      return { headRefType, currentBranchName, branches };
    },
    async getCommitGraph(this: GitCliRepo, workspacePath, maxCount, skip) {
      const resolution = await this.resolveRepository(workspacePath);
      if (!resolution.isGitAvailable || !resolution.isRepository)
        return { resolution, commits: [], hasMore: false };
      const plan = planGitCommitGraphQuery(maxCount, skip);
      const result = await runAt(owner, resolution, plan.args, { maxOutputBytes: OUTPUT_BYTES });
      return projectGitCommitGraphQuery(resolution, plan, result, ensureGitCommandSucceeded);
    },
    async getBranchComparison(this: GitCliRepo, workspacePath) {
      const status = await this.getStatus(workspacePath);
      if (
        !status.resolution.isGitAvailable ||
        !status.resolution.isRepository ||
        !status.summary.trackingBranchName
      )
        return {
          resolution: status.resolution,
          baseRef: status.summary.trackingBranchName,
          headRef: status.summary.branchName ?? "HEAD",
          comparisonLabel: null,
          changes: [],
        };
      const result = await runAt(
        owner,
        status.resolution,
        [
          "diff",
          "--numstat",
          "-z",
          "--find-renames",
          `${status.summary.trackingBranchName}...HEAD`,
          "--",
        ],
        { maxOutputBytes: OUTPUT_BYTES },
      );
      ensureGitCommandSucceeded("git diff --numstat upstream...HEAD", result);
      const changes = [...parseNumstat(result.stdout)].map(([path, stat]) => ({
        path,
        originalPath: stat.originalPath ?? null,
        kind: inferKindFromNumstat(stat),
        added: stat.added,
        removed: stat.removed,
      }));
      const baseRef = status.summary.trackingBranchName;
      const headRef = status.summary.branchName ?? "HEAD";
      const comparisonLabel = `${status.summary.branchName || "HEAD"} -> ${baseRef}`;
      return { resolution: status.resolution, baseRef, headRef, comparisonLabel, changes };
    },
    async getIdentity(this: GitCliRepo, workspacePath) {
      const resolution = await this.resolveRepository(workspacePath);
      if (!resolution.isGitAvailable || !resolution.isRepository)
        return {
          userName: null,
          userEmail: null,
          nameSource: null,
          emailSource: null,
          scopeLabel: null,
        };
      const [nameResult, emailResult] = await Promise.all([
        runAt(owner, resolution, ["config", "--show-scope", "--show-origin", "--get", "user.name"]),
        runAt(owner, resolution, [
          "config",
          "--show-scope",
          "--show-origin",
          "--get",
          "user.email",
        ]),
      ]);
      const name = parseGitConfigValue(nameResult);
      const email = parseGitConfigValue(emailResult);
      return {
        userName: name.value,
        userEmail: email.value,
        nameSource: name.source,
        emailSource: email.source,
        scopeLabel: name.scope ?? email.scope ?? null,
      };
    },
  };
}
