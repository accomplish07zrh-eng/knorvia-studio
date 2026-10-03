import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { GitDiffResult } from "@knorvia/shared";
import type { GitCliRepo } from "./gitCliTypes.js";
import { getGitNullDevicePath } from "../config.js";
import {
  buildUntrackedTextDiffResult,
  fileExists,
  normalizeInputPath,
  toDiffResult,
} from "./gitCliHelpers.js";
import { DIFF_BYTES, DIFF_TIMEOUT, OUTPUT_BYTES, runAt, type RepoOwner } from "./gitRepoOwner.js";

function unavailable(path: string, summary: string): GitDiffResult {
  return {
    path,
    availability: "unavailable",
    patch: null,
    beforeContent: null,
    afterContent: null,
    summary,
  };
}

async function workingContent(path: string): Promise<string | null> {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size > DIFF_BYTES) return null;
    const content = await readFile(path, "utf-8");
    return content.includes("\0") ? null : content;
  } catch {
    return null;
  }
}

async function blob(
  owner: RepoOwner,
  repoRoot: string,
  ref: string,
  path: string,
): Promise<string | null> {
  const result = await runAt(owner, { repoRoot }, ["show", `${ref}:${path}`], {
    timeoutMs: DIFF_TIMEOUT,
    maxOutputBytes: DIFF_BYTES,
  });
  return result.timedOut ||
    result.outputTruncated ||
    result.exitCode !== 0 ||
    result.stdout.includes("\0")
    ? null
    : result.stdout;
}

interface Contents {
  beforeContent: string;
  afterContent: string;
}

function completePair(beforeContent: string | null, afterContent: string | null): Contents | null {
  return beforeContent !== null && afterContent !== null ? { beforeContent, afterContent } : null;
}

async function branchContents(
  owner: RepoOwner,
  repoRoot: string,
  tracking: string,
  relativePath: string,
): Promise<Contents | null> {
  const baseResult = await runAt(owner, { repoRoot }, ["merge-base", tracking, "HEAD"], {
    maxOutputBytes: OUTPUT_BYTES,
  });
  const base = baseResult.exitCode === 0 ? baseResult.stdout.trim() : "";
  const before = await blob(owner, repoRoot, base || tracking, relativePath);
  const after = await blob(owner, repoRoot, "HEAD", relativePath);
  return completePair(before, after);
}

async function stagedContents(
  owner: RepoOwner,
  repoRoot: string,
  relativePath: string,
): Promise<Contents | null> {
  const before = await blob(owner, repoRoot, "HEAD", relativePath);
  const after = await blob(owner, repoRoot, "", relativePath);
  return completePair(before, after);
}

async function unstagedContents(
  owner: RepoOwner,
  repoRoot: string,
  relativePath: string,
  absolutePath: string,
): Promise<Contents | null> {
  const before = await blob(owner, repoRoot, "", relativePath);
  const after = await workingContent(absolutePath);
  return completePair(before, after);
}

function attach(diff: GitDiffResult, contents: Contents | null): GitDiffResult {
  return diff.availability === "patch" && contents !== null ? { ...diff, ...contents } : diff;
}

export function createDiffMethods(owner: RepoOwner): Pick<GitCliRepo, "getDiff"> {
  return {
    async getDiff(this: GitCliRepo, params) {
      const resolution = await this.resolveRepository(params.workspacePath);
      const absolutePath = isAbsolute(params.path)
        ? params.path
        : resolve(params.workspacePath, params.path.split("/").join(sep));
      if (!resolution.isGitAvailable)
        return unavailable(absolutePath, "Git binary is not available in the current environment.");
      if (!resolution.isRepository)
        return unavailable(absolutePath, "Workspace is not inside a Git repository.");
      const relativePath = await normalizeInputPath(resolution, params.path);
      const limits = { timeoutMs: DIFF_TIMEOUT, maxOutputBytes: DIFF_BYTES };
      if (params.sourceId === "branch") {
        const status = await this.getStatus(params.workspacePath);
        const tracking = status.summary.trackingBranchName;
        if (!tracking)
          return unavailable(absolutePath, "Current branch does not have an upstream branch.");
        const result = await runAt(
          owner,
          resolution,
          [
            "diff",
            "--no-ext-diff",
            "--no-color",
            "--binary",
            "--find-renames",
            `${tracking}...HEAD`,
            "--",
            relativePath,
          ],
          limits,
        );
        const diff = toDiffResult(absolutePath, result, {
          emptySummary: "No branch comparison diff is available for this file.",
        });
        const contents = await branchContents(owner, resolution.repoRoot, tracking, relativePath);
        return attach(diff, contents);
      }
      const staged = params.staged ?? params.sourceId === "staged";
      const args = staged
        ? ["diff", "--cached", "--no-ext-diff", "--no-color", "--binary", "--", relativePath]
        : ["diff", "--no-ext-diff", "--no-color", "--binary", "--", relativePath];
      const result = await runAt(owner, resolution, args, limits);
      const diff = toDiffResult(absolutePath, result, {
        emptySummary: "No Git diff is available for this file.",
      });
      if (diff.availability !== "unavailable" || staged) {
        const contents = staged
          ? await stagedContents(owner, resolution.repoRoot, relativePath)
          : await unstagedContents(owner, resolution.repoRoot, relativePath, absolutePath);
        return attach(diff, contents);
      }
      if (!(await fileExists(absolutePath))) return diff;
      const untracked = await buildUntrackedTextDiffResult(absolutePath, relativePath, DIFF_BYTES);
      if (untracked) return untracked;
      const fallback = await runAt(
        owner,
        resolution,
        [
          "diff",
          "--no-index",
          "--no-ext-diff",
          "--no-color",
          "--binary",
          getGitNullDevicePath(),
          absolutePath,
        ],
        limits,
      );
      return toDiffResult(absolutePath, fallback, {
        allowedExitCodes: [0, 1],
        emptySummary: "No previewable diff is available for this file.",
      });
    },
  };
}
