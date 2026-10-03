import type { GitCliRepo, GitResolvedRepository } from "./gitCliTypes.js";
import { ensureGitCommandSucceeded, ensureRepositoryAvailable } from "./gitCliHelpers.js";
import {
  OUTPUT_BYTES,
  PUSH_OUTPUT_BYTES,
  PUSH_TIMEOUT,
  runAt,
  type RepoOwner,
} from "./gitRepoOwner.js";

function trackingRemote(tracking: string | null): string | null {
  return tracking?.split("/")[0]?.trim() || null;
}

async function optionalConfig(
  owner: RepoOwner,
  resolution: GitResolvedRepository,
  key: string,
): Promise<string | null> {
  const result = await runAt(owner, resolution, ["config", "--get", key]);
  if (result.timedOut || result.outputTruncated)
    ensureGitCommandSucceeded(`git config --get ${key}`, result);
  if (result.exitCode === 0) return result.stdout.trim() || null;
  if (result.exitCode === 1) return null;
  ensureGitCommandSucceeded(`git config --get ${key}`, result);
  return null;
}

async function pushRemote(
  owner: RepoOwner,
  resolution: GitResolvedRepository,
  branchName: string,
): Promise<string> {
  ensureRepositoryAvailable(resolution, "push changes");
  const branch = branchName.trim();
  if (!branch) throw new Error("Cannot resolve a Git push remote without a current branch.");
  const configured = await optionalConfig(owner, resolution, `branch.${branch}.remote`);
  if (configured) return configured;
  const fallback = await optionalConfig(owner, resolution, "remote.pushDefault");
  if (fallback) return fallback;
  const result = await runAt(owner, resolution, ["remote"], { maxOutputBytes: OUTPUT_BYTES });
  ensureGitCommandSucceeded("git remote", result);
  const remotes = result.stdout
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (remotes.includes("origin")) return "origin";
  const [soleRemote] = remotes;
  if (remotes.length === 1 && soleRemote !== undefined) return soleRemote;
  if (!remotes.length) throw new Error("No Git remote is configured for the current repository.");
  throw new Error(
    "Multiple Git remotes are configured. Configure branch.<name>.remote or remote.pushDefault first.",
  );
}

export function createPushMethods(owner: RepoOwner): Pick<GitCliRepo, "push"> {
  return {
    async push(this: GitCliRepo, workspacePath) {
      const status = await this.getStatus(workspacePath);
      ensureRepositoryAvailable(status.resolution, "push changes");
      const branchName = status.summary.branchName?.trim() ?? "";
      if (status.summary.headRefType !== "branch" || !branchName)
        throw new Error("Cannot push while HEAD is detached.");
      const hasTracking = Boolean(status.summary.trackingBranchName);
      const remoteName = hasTracking
        ? trackingRemote(status.summary.trackingBranchName)
        : await pushRemote(owner, status.resolution, branchName);
      const args = hasTracking
        ? ["push"]
        : ["push", "--set-upstream", remoteName ?? "origin", branchName];
      const result = await runAt(owner, status.resolution, args, {
        timeoutMs: PUSH_TIMEOUT,
        maxOutputBytes: PUSH_OUTPUT_BYTES,
      });
      ensureGitCommandSucceeded("git push", result);
      owner.invalidate(workspacePath);
      const refreshed = await this.getStatus(workspacePath);
      return {
        branchName,
        trackingBranchName: refreshed.summary.trackingBranchName,
        remoteName: remoteName ?? trackingRemote(refreshed.summary.trackingBranchName),
        setUpstream: !hasTracking,
        summary: refreshed.summary,
      };
    },
  };
}
