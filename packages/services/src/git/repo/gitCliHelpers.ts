/* eslint-disable max-lines */
import { access, open, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type {
  GitBranchMutationIssue,
  GitChangeKind,
  GitDiffResult,
  GitHeadRefType,
} from "@knorvia/shared";
import {
  GIT_UNTRACKED_STAT_CHUNK_BYTES,
  GIT_UNTRACKED_STAT_CONCURRENCY,
  GIT_UNTRACKED_STAT_MAX_BYTES,
  normalizeGitPath,
} from "#src/git/config.js";
import type { GitCommandExecutionResult } from "../providers/gitCommandProvider.js";
import type { GitLineStat, GitResolvedRepository, GitStatusEntry } from "./gitCliTypes.js";

function toResultMessage(result: GitCommandExecutionResult): string {
  for (const stream of ["stderr", "stdout"] as const) {
    const message = result[stream].trim();
    if (message) return message;
  }
  return `exitCode=${result.exitCode ?? "null"}`;
}

function toNormalizedLines(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  while (true) {
    const separator = text.indexOf("\n", start);
    const end = separator < 0 ? text.length : separator;
    lines.push(text.slice(start, end).trimEnd());
    if (separator < 0) return lines;
    start = end + 1;
  }
}

function extractIndentedPaths(lines: string[], headerPattern: RegExp): string[] {
  const paths: string[] = [];
  let inBody = false;
  for (const line of lines) {
    if (!inBody) {
      inBody = headerPattern.test(line.toLowerCase());
      continue;
    }
    if (!line) continue;
    if (!/^\s+/.test(line)) break;
    const value = line.trim();
    if (value.length > 0) paths.push(normalizeGitPath(value));
  }
  return paths;
}

export function toInvalidBranchNameIssue(detail?: string | null): GitBranchMutationIssue {
  return {
    code: "invalid-branch-name",
    message: "Branch name is invalid.",
    detail: detail?.trim() || null,
  };
}

export function parseGitBranchMutationIssues(
  result: GitCommandExecutionResult,
): GitBranchMutationIssue[] {
  const detail = result.stderr.trim() || result.stdout.trim() || null;
  const lines = toNormalizedLines(detail ?? "");
  const normalizedDetail = detail?.toLowerCase() ?? "";

  // Rules retain Git's diagnostic prose and the established issue priority.
  const pathRules = [
    [
      /your local changes to the following files would be overwritten by (checkout|switch)/,
      "tracked-changes-would-be-overwritten",
      "Tracked changes would be overwritten by switching branches.",
    ],
    [
      /the following untracked working tree files would be overwritten by (checkout|switch)/,
      "untracked-changes-would-be-overwritten",
      "Untracked files would be overwritten by switching branches.",
    ],
  ] as const;
  for (const [pattern, code, message] of pathRules) {
    const paths = extractIndentedPaths(lines, pattern);
    if (paths.length > 0) return [{ code, message, paths, detail }];
  }

  const messageRules = [
    [/already exists/, "branch-already-exists", "Branch already exists."],
    [/invalid reference:/, "target-branch-not-found", "Target branch was not found."],
    [
      /is already used by worktree at/,
      "branch-in-other-worktree",
      "Branch is already checked out in another worktree.",
    ],
    [
      /resolve your current index first/,
      "conflicts-present",
      "Repository still has unresolved conflicts.",
    ],
    [
      /cannot switch branch while (merging|rebasing|cherry-picking|reverting|bisecting)|you have not concluded your merge|rebase in progress/,
      "operation-in-progress",
      "Another Git operation is still in progress.",
    ],
  ] as const;
  const match = messageRules.find(([pattern]) => pattern.test(normalizedDetail));
  return [
    {
      code: match?.[1] ?? "unknown",
      message: match?.[2] ?? "Git could not complete the branch operation.",
      detail,
    },
  ];
}

export function ensureGitCommandSucceeded(
  label: string,
  result: GitCommandExecutionResult,
  allowedExitCodes: number[] = [0],
): GitCommandExecutionResult {
  let message: string;
  if (result.timedOut) {
    const timeoutMs = result.timeoutMs ?? result.durationMs;
    let diagnostics = `elapsed=${result.durationMs}ms`;
    // 冻结契约要求可选时间先检查再读取，不能快照 getter 或把清理耗时当超时阈值。
    for (const [field, token] of [
      ["timeoutElapsedMs", "killAt"],
      ["timeoutCloseDelayMs", "cleanup"],
    ] as const) {
      if (result[field] !== undefined) diagnostics += `, ${token}=${result[field]}ms`;
    }
    if (result.forceKillAttempted) diagnostics += ", forceKill=true";
    if (result.orphaned) diagnostics += ", orphaned=true";
    message = `${label} timed out after ${timeoutMs}ms (${diagnostics})`;
  } else if (result.outputTruncated) {
    message = `${label} output exceeded limit`;
  } else {
    if (allowedExitCodes.includes(result.exitCode ?? Number.NaN)) return result;
    message = `${label} failed: ${toResultMessage(result)}`;
  }
  throw new Error(message);
}

export function isNotRepositoryResult(result: GitCommandExecutionResult): boolean {
  const stderr = result.stderr.toLowerCase();
  return stderr.includes("not a git repository") || stderr.includes("outside repository");
}

export function isMissingWorkingDirectoryResult(result: GitCommandExecutionResult): boolean {
  const stderr = result.stderr.toLowerCase();
  return (
    (result.exitCode === -2 && stderr.includes("enoent")) ||
    stderr.includes("unable to read current working directory") ||
    stderr.includes("no such file or directory")
  );
}

function inferKindFromStatusCode(statusCode: string): GitChangeKind {
  if (statusCode === "A" || statusCode === "?") {
    return "added";
  }

  if (statusCode === "D") {
    return "deleted";
  }

  if (statusCode === "R" || statusCode === "C") {
    return "renamed";
  }

  return "modified";
}

function parseBranchAheadBehind(value: string): { ahead: number; behind: number } {
  const aheadMatch = value.match(/\+(\d+)/);
  const behindMatch = value.match(/-(\d+)/);
  return {
    ahead: aheadMatch ? Number.parseInt(aheadMatch[1]!, 10) : 0,
    behind: behindMatch ? Number.parseInt(behindMatch[1]!, 10) : 0,
  };
}

function* iteratePorcelainStatusRecords(stdout: string): Generator<string> {
  let start = 0;
  while (start < stdout.length) {
    const separator = stdout.indexOf("\0", start);
    const end = separator < 0 ? stdout.length : separator;
    // 旧格式先去掉空记录，rename 的下一个记录也必须沿用这一消费规则。
    if (end > start) yield stdout.slice(start, end);
    start = end + 1;
  }
}

function decodePorcelainTrackedRecord(
  record: string,
  metadataFields: number,
): { xy: string; path: string } | null {
  const xy = record.slice(2, 4);
  if (xy.length !== 2 || xy.includes(" ") || record[4] !== " ") return null;
  let offset = 5;
  for (let field = 0; field < metadataFields; field += 1) {
    const separator = record.indexOf(" ", offset);
    if (separator <= offset) return null;
    offset = separator + 1;
  }
  // 路径保留旧 JS dot/anchor 的换行边界；元数据仅以 ASCII 空格分隔。
  const path = record.slice(offset).match(/^(.+)$/)?.[1];
  return path === undefined ? null : { xy, path };
}

export function parseStatusPorcelain(stdout: string): {
  branchName: string | null;
  trackingBranchName: string | null;
  headRefType: GitHeadRefType;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
} {
  const records = iteratePorcelainStatusRecords(stdout);
  const entries: GitStatusEntry[] = [];
  let branchName: string | null = null;
  let trackingBranchName: string | null = null;
  let headRefType: GitHeadRefType = "branch";
  let ahead = 0;
  let behind = 0;

  for (const record of records) {
    const tag = record.slice(0, 2);
    if (tag === "# ") {
      if (record.startsWith("# branch.head ")) {
        const head = record.slice("# branch.head ".length);
        headRefType = head === "(detached)" ? "detached" : "branch";
        branchName = headRefType === "detached" ? null : head;
      } else if (record.startsWith("# branch.upstream ")) {
        trackingBranchName = record.slice("# branch.upstream ".length);
      } else if (record.startsWith("# branch.ab ")) {
        const counters = parseBranchAheadBehind(record.slice("# branch.ab ".length));
        ahead = counters.ahead;
        behind = counters.behind;
      }
      continue;
    }
    if (tag === "? ") {
      entries.push({
        path: normalizeGitPath(record.slice(2)),
        originalPath: null,
        kind: "added",
        x: null,
        y: "?",
        isUntracked: true,
        isConflicted: false,
      });
      continue;
    }
    if (tag !== "1 " && tag !== "2 " && tag !== "u ") continue;
    const fields = decodePorcelainTrackedRecord(record, tag === "1 " ? 6 : tag === "2 " ? 7 : 8);
    if (!fields) continue;
    const originalPath = tag === "2 " ? (records.next().value ?? null) : null;
    const { xy } = fields;
    entries.push({
      path: normalizeGitPath(fields.path),
      originalPath: originalPath ? normalizeGitPath(originalPath) : null,
      kind:
        tag === "2 "
          ? "renamed"
          : tag === "u "
            ? "modified"
            : inferKindFromStatusCode(xy[0] !== "." ? xy[0]! : xy[1]!),
      x: xy[0]!,
      y: xy[1]!,
      isUntracked: false,
      isConflicted: tag === "u ",
    });
  }
  return { branchName, trackingBranchName, headRefType, ahead, behind, entries };
}

function parseNumstatValue(value: string): number {
  if (value === "-") {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function inferKindFromNumstat(stat: GitLineStat): GitChangeKind {
  if (stat.kind) {
    return stat.kind;
  }

  if (stat.added > 0 && stat.removed === 0) {
    return "added";
  }

  if (stat.removed > 0 && stat.added === 0) {
    return "deleted";
  }

  return "modified";
}

export function parseNumstat(stdout: string): Map<string, GitLineStat> {
  const stats = new Map<string, GitLineStat>();
  let offset = 0;
  // numstat 的 rename 尾部保留空记录；不能复用 porcelain 的去空消费规则。
  const takeRecord = (): string | undefined => {
    if (offset > stdout.length) return undefined;
    const separator = stdout.indexOf("\0", offset);
    const end = separator < 0 ? stdout.length : separator;
    const record = stdout.slice(offset, end);
    offset = end + 1;
    return record;
  };
  let record: string | undefined;
  while ((record = takeRecord()) !== undefined) {
    if (record.length === 0) continue;
    const firstTab = record.indexOf("\t");
    if (firstTab < 0) continue;
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (secondTab < 0) continue;
    const added = parseNumstatValue(record.slice(0, firstTab));
    const removed = parseNumstatValue(record.slice(firstTab + 1, secondTab));
    const path = record.slice(secondTab + 1);
    if (path.length > 0) {
      stats.set(normalizeGitPath(path), { added, removed });
      continue;
    }
    const originalPath = takeRecord() ?? "";
    const renamedPath = takeRecord() ?? "";
    if (renamedPath.length === 0) continue;
    stats.set(normalizeGitPath(renamedPath), {
      added,
      removed,
      kind: "renamed",
      originalPath: normalizeGitPath(originalPath),
    });
  }
  return stats;
}

async function countUntrackedFileLines(absolutePath: string, buffer: Buffer): Promise<number> {
  const info = await stat(absolutePath);
  if (!info.isFile() || info.size > GIT_UNTRACKED_STAT_MAX_BYTES) return 0;

  const file = await open(absolutePath, "r");
  try {
    let totalBytes = 0;
    let newlines = 0;
    let lastByte = 10;
    while (totalBytes <= GIT_UNTRACKED_STAT_MAX_BYTES) {
      // 文件可能在 stat 后增长；实际读取也必须受预算约束，额外一字节只用于识别越界。
      const length = Math.min(buffer.length, GIT_UNTRACKED_STAT_MAX_BYTES + 1 - totalBytes);
      const { bytesRead } = await file.read(buffer, 0, length, null);
      if (bytesRead === 0) return newlines + (lastByte === 10 ? 0 : 1);
      totalBytes += bytesRead;
      if (totalBytes > GIT_UNTRACKED_STAT_MAX_BYTES) return 0;
      for (let index = 0; index < bytesRead; index++) {
        if (buffer[index] === 0) return 0;
        if (buffer[index] === 10) newlines++;
      }
      lastByte = buffer[bytesRead - 1]!;
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
  const stats = new Map<string, GitLineStat>();
  const untrackedEntries = entries.filter((entry) => entry.isUntracked);
  let nextIndex = 0;
  // 并发 readFile 全部未跟踪文件、读取后才识别二进制会让 Host 瞬间分配数 GiB。
  // 固定 worker 各复用一个小缓冲，逐文件限量读取；大文件仍保留变更条目，只跳过行数统计。
  const worker = async () => {
    const buffer = Buffer.allocUnsafe(GIT_UNTRACKED_STAT_CHUNK_BYTES);
    while (nextIndex < untrackedEntries.length) {
      const entry = untrackedEntries[nextIndex++]!;
      const absolutePath = resolve(repoRoot, ...entry.path.split("/"));
      try {
        stats.set(entry.path, {
          added: await countUntrackedFileLines(absolutePath, buffer),
          removed: 0,
        });
      } catch {
        stats.set(entry.path, { added: 0, removed: 0 });
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(GIT_UNTRACKED_STAT_CONCURRENCY, untrackedEntries.length) },
      worker,
    ),
  );

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

function splitUntrackedText(content: string): {
  lines: string[];
  hasTrailingNewline: boolean;
} {
  const lines: string[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const separator = content.indexOf("\n", cursor);
    if (separator < 0) {
      lines.push(content.slice(cursor));
      break;
    }
    const end =
      separator > cursor && content.charCodeAt(separator - 1) === 13 ? separator - 1 : separator;
    lines.push(content.slice(cursor, end));
    cursor = separator + 1;
  }
  return {
    lines,
    hasTrailingNewline: content.length > 0 && content.charCodeAt(content.length - 1) === 10,
  };
}

export async function buildUntrackedTextDiffResult(
  absolutePath: string,
  repoRelativePath: string,
  maxPreviewBytes: number,
): Promise<GitDiffResult | null> {
  try {
    const content = await readFile(absolutePath);
    let availability: "binary" | "truncated" | null = null;
    if (content.includes(0)) {
      availability = "binary";
    } else if (content.byteLength > maxPreviewBytes) {
      availability = "truncated";
    }
    if (availability !== null) {
      return {
        path: absolutePath,
        availability,
        patch: null,
        beforeContent: null,
        afterContent: null,
        summary:
          availability === "binary"
            ? "Binary diff is not previewable."
            : "Git diff output exceeded the preview limit.",
      };
    }

    const normalizedPath = normalizeGitPath(repoRelativePath);
    const { lines, hasTrailingNewline } = splitUntrackedText(content.toString("utf-8"));
    const patchLines = ["--- /dev/null", `+++ b/${normalizedPath}`];

    if (lines.length > 0) {
      patchLines.push(`@@ -0,0 +1,${lines.length} @@`);
      const additions: string[] = [];
      for (const line of lines) additions.push(`+${line}`);
      patchLines.push(...additions);
      if (!hasTrailingNewline) {
        patchLines.push("\\ No newline at end of file");
      }
    }

    return {
      path: absolutePath,
      availability: "patch",
      patch: `${patchLines.join("\n")}\n`,
      beforeContent: "",
      afterContent: content.toString("utf-8"),
      summary: null,
    };
  } catch {
    return null;
  }
}

function isBinaryDiff(stdout: string): boolean {
  return stdout.includes("GIT binary patch") || stdout.includes("Binary files ");
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
  type Verdict = readonly [GitDiffResult["availability"], string | null, string | null];
  // 按旧优先级延迟读取输入；不能提前快照 getter 或改变 stdout 的重复读取顺序。
  const stages: (() => Verdict | null)[] = [
    () => (result.timedOut ? ["unavailable", null, "Git diff command timed out."] : null),
    () =>
      result.outputTruncated
        ? ["truncated", null, "Git diff output exceeded the preview limit."]
        : null,
    () => {
      const allowedExitCodes = options?.allowedExitCodes ?? [0];
      return allowedExitCodes.includes(result.exitCode ?? Number.NaN)
        ? null
        : ["unavailable", null, toResultMessage(result)];
    },
    () =>
      result.stdout.trim()
        ? null
        : ["unavailable", null, options?.emptySummary ?? "No diff output available."],
    () =>
      isBinaryDiff(result.stdout)
        ? ["binary", null, options?.binarySummary ?? "Binary diff is not previewable."]
        : null,
  ];
  let selected: Verdict | null = null;
  for (const choose of stages) {
    selected = choose();
    if (selected !== null) break;
  }
  const verdict: Verdict = selected ?? ["patch", result.stdout, null];
  const [availability, patch, summary] = verdict;
  return {
    path,
    availability,
    patch,
    beforeContent: null,
    afterContent: null,
    summary,
  };
}

export function parseGitConfigValue(result: GitCommandExecutionResult): {
  scope: string | null;
  source: string | null;
  value: string | null;
} {
  if (result.exitCode === 1) {
    return { scope: null, source: null, value: null };
  }

  ensureGitCommandSucceeded("git config", result);
  const line = result.stdout.replace(/\r?\n$/, "");
  const firstTab = line.indexOf("\t");
  const secondTab = firstTab < 0 ? -1 : line.indexOf("\t", firstTab + 1);
  const scoped = secondTab >= 0;
  // 只消费前两个字段边界；值的所有后续 tab/空白必须按旧线格式原样保留。
  return {
    scope: scoped ? line.slice(0, firstTab) : null,
    source: scoped ? line.slice(firstTab + 1, secondTab) : null,
    value: (scoped ? line.slice(secondTab + 1) : line) || null,
  };
}

export async function normalizeInputPath(
  resolution: GitResolvedRepository,
  path: string,
): Promise<string> {
  const rawAbsolutePath = isAbsolute(path)
    ? path
    : resolve(resolution.workspacePath, path.split("/").join(sep));
  const absolutePath = await realpath(rawAbsolutePath).catch(() => rawAbsolutePath);
  const repoRelativePath = normalizeGitPath(relative(resolution.repoRoot, absolutePath));
  if (
    repoRelativePath.length === 0 ||
    repoRelativePath === "." ||
    repoRelativePath === ".." ||
    repoRelativePath.startsWith("../")
  ) {
    throw new Error(`Path is outside repository scope: ${path}`);
  }

  return repoRelativePath;
}

export function ensureRepositoryAvailable(
  resolution: GitResolvedRepository,
  label: string,
): GitResolvedRepository {
  if (!resolution.isGitAvailable) {
    throw new Error(`Cannot ${label}: Git binary is not available`);
  }

  if (!resolution.isRepository) {
    throw new Error(`Cannot ${label}: workspace is not inside a Git repository`);
  }

  return resolution;
}
