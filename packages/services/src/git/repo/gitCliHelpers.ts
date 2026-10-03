import { access, open, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { GitBranchMutationIssue, GitDiffResult } from "@knorvia/shared";
import type { GitCommandExecutionResult } from "../providers/gitCommandProvider.js";
import type { GitLineStat, GitResolvedRepository, GitStatusEntry } from "./gitCliTypes.js";
import {
  GIT_UNTRACKED_STAT_CHUNK_BYTES,
  GIT_UNTRACKED_STAT_CONCURRENCY,
  GIT_UNTRACKED_STAT_MAX_BYTES,
  normalizeGitPath,
} from "#src/git/config.js";

export { inferKindFromNumstat, parseNumstat, parseStatusPorcelain } from "./gitCliParsing.js";

export function toInvalidBranchNameIssue(detail?: string | null): GitBranchMutationIssue {
  return {
    code: "invalid-branch-name",
    message: "Branch name is invalid.",
    detail: detail?.trim() || null,
  };
}

function failureMessage(result: GitCommandExecutionResult): string {
  return result.stderr.trim() || result.stdout.trim() || `exitCode=${result.exitCode ?? "null"}`;
}

export function ensureGitCommandSucceeded(
  label: string,
  result: GitCommandExecutionResult,
  allowedExitCodes: number[] = [0],
): GitCommandExecutionResult {
  if (result.timedOut) {
    const details = [`elapsed=${result.durationMs}ms`];
    if (result.timeoutElapsedMs !== undefined) details.push(`killAt=${result.timeoutElapsedMs}ms`);
    if (result.timeoutCloseDelayMs !== undefined)
      details.push(`cleanup=${result.timeoutCloseDelayMs}ms`);
    if (result.forceKillAttempted) details.push("forceKill=true");
    if (result.orphaned) details.push("orphaned=true");
    throw new Error(
      `${label} timed out after ${result.timeoutMs ?? result.durationMs}ms (${details.join(", ")})`,
    );
  }
  if (result.outputTruncated) throw new Error(`${label} output exceeded limit`);
  if (allowedExitCodes.includes(result.exitCode ?? NaN)) return result;
  throw new Error(`${label} failed: ${failureMessage(result)}`);
}

export function isNotRepositoryResult(result: GitCommandExecutionResult): boolean {
  const message = result.stderr.toLowerCase();
  return message.includes("not a git repository") || message.includes("outside repository");
}

export function isMissingWorkingDirectoryResult(result: GitCommandExecutionResult): boolean {
  const message = result.stderr.toLowerCase();
  return (
    (result.exitCode === -2 && message.includes("enoent")) ||
    message.includes("unable to read current working directory") ||
    message.includes("no such file or directory")
  );
}

function pathsAfterHeader(lines: string[], header: RegExp): string[] {
  const start = lines.findIndex((line) => header.test(line.toLowerCase()));
  if (start < 0) return [];
  const paths: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) break;
    paths.push(normalizeGitPath(line.trim()));
  }
  return paths;
}

export function parseGitBranchMutationIssues(
  result: GitCommandExecutionResult,
): GitBranchMutationIssue[] {
  const detail = result.stderr.trim() || result.stdout.trim() || null;
  const lines = (detail ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const tracked = pathsAfterHeader(
    lines,
    /your local changes to the following files would be overwritten by (checkout|switch)/,
  );
  if (tracked.length) {
    return [
      {
        code: "tracked-changes-would-be-overwritten",
        message: "Tracked changes would be overwritten by switching branches.",
        paths: tracked,
        detail,
      },
    ];
  }
  const untracked = pathsAfterHeader(
    lines,
    /the following untracked working tree files would be overwritten by (checkout|switch)/,
  );
  if (untracked.length) {
    return [
      {
        code: "untracked-changes-would-be-overwritten",
        message: "Untracked files would be overwritten by switching branches.",
        paths: untracked,
        detail,
      },
    ];
  }
  const message = (detail ?? "").toLowerCase();
  let code: GitBranchMutationIssue["code"] = "unknown";
  let description = "Git could not complete the branch operation.";
  if (message.includes("already exists")) {
    code = "branch-already-exists";
    description = "Branch already exists.";
  } else if (message.includes("invalid reference:")) {
    code = "target-branch-not-found";
    description = "Target branch was not found.";
  } else if (message.includes("is already used by worktree at")) {
    code = "branch-in-other-worktree";
    description = "Branch is already checked out in another worktree.";
  } else if (message.includes("resolve your current index first")) {
    code = "conflicts-present";
    description = "Repository still has unresolved conflicts.";
  } else if (
    /cannot switch branch while (merging|rebasing|cherry-picking|reverting|bisecting)/.test(
      message,
    ) ||
    message.includes("you have not concluded your merge") ||
    message.includes("rebase in progress")
  ) {
    code = "operation-in-progress";
    description = "Another Git operation is still in progress.";
  }
  return [{ code, message: description, detail }];
}

async function countUntrackedLines(absolutePath: string, buffer: Buffer): Promise<number> {
  const info = await stat(absolutePath);
  if (!info.isFile() || info.size > GIT_UNTRACKED_STAT_MAX_BYTES) return 0;
  const file = await open(absolutePath, "r");
  try {
    let totalBytes = 0;
    let lineFeeds = 0;
    let lastByte = 10;
    while (totalBytes <= GIT_UNTRACKED_STAT_MAX_BYTES) {
      const length = Math.min(buffer.length, GIT_UNTRACKED_STAT_MAX_BYTES + 1 - totalBytes);
      const { bytesRead } = await file.read(buffer, 0, length, null);
      if (bytesRead === 0) return lineFeeds + (lastByte === 10 ? 0 : 1);
      totalBytes += bytesRead;
      if (totalBytes > GIT_UNTRACKED_STAT_MAX_BYTES) return 0;
      for (const byte of buffer.subarray(0, bytesRead)) {
        if (byte === 0) return 0;
        if (byte === 10) lineFeeds += 1;
        lastByte = byte;
      }
    }
    return 0;
  } finally {
    await file.close();
  }
}

export async function buildUntrackedStats(
  repoRoot: string,
  entries: GitStatusEntry[],
): Promise<Map<string, GitLineStat>> {
  const pending = entries.filter((entry) => entry.isUntracked);
  const stats = new Map<string, GitLineStat>();
  const work = pending.values();
  const workers = Array.from(
    { length: Math.min(GIT_UNTRACKED_STAT_CONCURRENCY, pending.length) },
    async () => {
      const buffer = Buffer.allocUnsafe(GIT_UNTRACKED_STAT_CHUNK_BYTES);
      while (true) {
        const next = work.next();
        if (next.done) break;
        const entry = next.value;
        const absolutePath = resolve(repoRoot, ...entry.path.split("/"));
        try {
          stats.set(entry.path, {
            added: await countUntrackedLines(absolutePath, buffer),
            removed: 0,
          });
        } catch {
          stats.set(entry.path, { added: 0, removed: 0 });
        }
      }
    },
  );
  await Promise.all(workers);
  return stats;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function normalizeInputPath(
  resolution: GitResolvedRepository,
  path: string,
): Promise<string> {
  const rawAbsolute = isAbsolute(path)
    ? path
    : resolve(resolution.workspacePath, path.split("/").join(sep));
  const absolute = await realpath(rawAbsolute).catch(() => rawAbsolute);
  const normalized = normalizeGitPath(relative(resolution.repoRoot, absolute));
  if (
    !normalized.length ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Path is outside repository scope: ${path}`);
  }
  return normalized;
}

export function ensureRepositoryAvailable(
  resolution: GitResolvedRepository,
  label: string,
): GitResolvedRepository {
  if (!resolution.isGitAvailable) throw new Error(`Cannot ${label}: Git binary is not available`);
  if (!resolution.isRepository)
    throw new Error(`Cannot ${label}: workspace is not inside a Git repository`);
  return resolution;
}

function diffWithoutPatch(
  path: string,
  availability: GitDiffResult["availability"],
  summary: string,
): GitDiffResult {
  return { path, availability, patch: null, beforeContent: null, afterContent: null, summary };
}

export async function buildUntrackedTextDiffResult(
  absolutePath: string,
  repoRelativePath: string,
  maxPreviewBytes: number,
): Promise<GitDiffResult | null> {
  try {
    const content = await readFile(absolutePath);
    if (content.includes(0))
      return diffWithoutPatch(absolutePath, "binary", "Binary diff is not previewable.");
    if (content.byteLength > maxPreviewBytes)
      return diffWithoutPatch(
        absolutePath,
        "truncated",
        "Git diff output exceeded the preview limit.",
      );
    const afterContent = content.toString("utf-8");
    const normalized = afterContent.replace(/\r\n/g, "\n");
    const trailingNewline = normalized.endsWith("\n");
    const lines = normalized.length ? normalized.split("\n") : [];
    if (trailingNewline) lines.pop();
    const patch = ["--- /dev/null", `+++ b/${normalizeGitPath(repoRelativePath)}`];
    if (lines.length) {
      patch.push(`@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`));
      if (!trailingNewline) patch.push("\\ No newline at end of file");
    }
    return {
      path: absolutePath,
      availability: "patch",
      patch: `${patch.join("\n")}\n`,
      beforeContent: "",
      afterContent,
      summary: null,
    };
  } catch {
    return null;
  }
}

export function toDiffResult(
  path: string,
  result: GitCommandExecutionResult,
  options?: {
    allowedExitCodes?: number[];
    emptySummary?: string;
    binarySummary?: string;
  },
): GitDiffResult {
  if (result.timedOut) return diffWithoutPatch(path, "unavailable", "Git diff command timed out.");
  if (result.outputTruncated)
    return diffWithoutPatch(path, "truncated", "Git diff output exceeded the preview limit.");
  if (!(options?.allowedExitCodes ?? [0]).includes(result.exitCode ?? NaN))
    return diffWithoutPatch(path, "unavailable", failureMessage(result));
  if (!result.stdout.trim())
    return diffWithoutPatch(
      path,
      "unavailable",
      options?.emptySummary ?? "No diff output available.",
    );
  if (result.stdout.includes("GIT binary patch") || result.stdout.includes("Binary files "))
    return diffWithoutPatch(
      path,
      "binary",
      options?.binarySummary ?? "Binary diff is not previewable.",
    );
  return {
    path,
    availability: "patch",
    patch: result.stdout,
    beforeContent: null,
    afterContent: null,
    summary: null,
  };
}

export function parseGitConfigValue(result: GitCommandExecutionResult): {
  scope: string | null;
  source: string | null;
  value: string | null;
} {
  if (result.exitCode === 1) return { scope: null, source: null, value: null };
  ensureGitCommandSucceeded("git config", result);
  const line = result.stdout.replace(/\r?\n$/, "");
  const parts = line.split("\t");
  if (parts.length < 3) return { scope: null, source: null, value: line || null };
  return {
    scope: parts[0] ?? null,
    source: parts[1] ?? null,
    value: parts.slice(2).join("\t") || null,
  };
}
