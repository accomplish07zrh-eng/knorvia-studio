// SPDX-License-Identifier: Apache-2.0
// 搜索门面：文件搜索（glob）与文本搜索（进程内正则 / ripgrep 两条引擎）。
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  createFileSystemError,
  type FileSystemSearchFilesRequest,
  type FileSystemSearchFilesResult,
  type FileSystemSearchTextEntry,
  type FileSystemSearchTextRequest,
  type FileSystemSearchTextResult,
} from "@knorvia/contracts";
import {
  candidates,
  glob,
  posixRelative,
  recent,
  walk,
  type Candidate,
} from "./file-search-paths.js";
import { absolute, aborted, failure } from "./node-file-policy.js";
import { searchPlan } from "./ripgrep-plan.js";
import { RipgrepRuntimeFailure, runSearch } from "./ripgrep-worker.js";
import { matchContent } from "./text-search-lines.js";
import { finish, parseOutput, ripgrepFailure, sortFiles } from "./text-search-results.js";

const DEFAULT_FILE_LIMIT = 100;
const EMPTY_GREP_PATTERN = "Grep pattern must not be empty";
const EMPTY_GLOB_PATTERN = "Glob pattern must not be empty";
const UNKNOWN_RIPGREP_ERROR = "unknown error";

type TextRequest = FileSystemSearchTextRequest;
type FileInfo = Awaited<ReturnType<typeof stat>>;

/** 搜索入口的公共前置：绝对化路径、trim 模式、记录起始时间。 */
function prepareGrep(
  query: TextRequest,
  emptyMessage: string,
): { path: string; pattern: string; startedAt: number } {
  const path = absolute(query.path);
  const pattern = query.pattern.trim();
  const startedAt = Date.now();
  if (pattern.length > 0) return { path, pattern, startedAt };
  throw createFileSystemError({ code: "invalid_pattern", message: emptyMessage, path });
}

function notDirectoryError(path: string): Error {
  const message = `Glob search path must be a directory: ${path}`;
  return createFileSystemError({ code: "not_file", message, path });
}

export async function searchFiles(
  query: FileSystemSearchFilesRequest,
  signal?: AbortSignal,
): Promise<FileSystemSearchFilesResult> {
  const { path, pattern, startedAt } = prepareGrep(query, EMPTY_GLOB_PATTERN);
  try {
    aborted(signal);
    const root = await stat(path);
    if (!root.isDirectory()) throw notDirectoryError(path);
    const matchesGlob = glob(pattern);
    const collected: Candidate[] = [];
    await walk(path, signal, (file, info) => {
      if (!matchesGlob(posixRelative(path, file), basename(file))) return;
      collected.push({ mtimeMs: Number(info.mtimeMs), path: file });
    });
    collected.sort(recent);
    const from = query.offset ?? 0;
    const cap = query.maxResults ?? DEFAULT_FILE_LIMIT;
    const names = collected.slice(from, from + cap).map((row) => row.path);
    const result = {} as FileSystemSearchFilesResult;
    result.path = path;
    result.pattern = pattern;
    result.durationMs = Math.max(0, Date.now() - startedAt);
    result.files = names;
    result.numFiles = names.length;
    result.truncated = collected.length > from + cap;
    return result;
  } catch (error) {
    throw failure(error, path);
  }
}

/** 编译正则：忽略大小写/多行由请求决定，失败归一到 invalid_pattern。 */
function compilePattern(pattern: string, query: TextRequest): RegExp {
  const flags = (query.ignoreCase ? "i" : "") + (query.multiline ? "s" : "");
  try {
    return new RegExp(pattern, flags);
  } catch (cause) {
    const message = `Invalid grep regular expression: ${pattern}`;
    throw createFileSystemError({ cause, code: "invalid_pattern", message, path: query.path });
  }
}

/** 进程内引擎：逐文件读入后按行匹配，命中行按输出模式汇总。 */
async function searchInProcess(
  query: TextRequest,
  signal?: AbortSignal,
): Promise<FileSystemSearchTextResult> {
  const { path, pattern, startedAt } = prepareGrep(query, EMPTY_GREP_PATTERN);
  try {
    aborted(signal);
    const regex = compilePattern(pattern, query);
    const info = await stat(path);
    const rows = await candidates(path, info, query, signal);
    const mode = query.outputMode ?? "files_with_matches";
    const contentMode = mode === "content";
    const rowQuery: TextRequest = contentMode ? query : { ...query, onlyMatching: false };
    const matched: Candidate[] = [];
    const entries: FileSystemSearchTextEntry[] = [];
    let numMatches = 0;

    for (const row of rows) {
      aborted(signal);
      const text = await readFile(row.path, "utf8");
      if (text.includes("\0")) continue;
      const hit = matchContent(row.path, text, regex, rowQuery);
      if (hit.matchCount === 0) continue;
      matched.push(row);
      numMatches += hit.matchCount;
      if (contentMode) entries.push(...hit.entries);
      else if (mode === "count") entries.push({ count: hit.matchCount, path: row.path });
    }

    matched.sort(recent);
    return finish(query, startedAt, { entries, files: matched.map((row) => row.path), numMatches });
  } catch (error) {
    throw failure(error, path);
  }
}

function notSearchableError(path: string): Error {
  const message = `Grep search path must be a file or directory: ${path}`;
  return createFileSystemError({ code: "not_file", message, path });
}

function ripgrepExitError(path: string, code: number | undefined, stderr: string): Error {
  const detail = stderr || UNKNOWN_RIPGREP_ERROR;
  const message = `ripgrep exited with code ${code}: ${detail}`;
  return createFileSystemError({ code: "io_error", message, path });
}

/** ripgrep 引擎：沙箱参数计划 → worker 执行 → 输出解析 → 新近度排序。 */
async function searchWithRipgrep(
  query: TextRequest,
  signal?: AbortSignal,
): Promise<FileSystemSearchTextResult> {
  const { path, pattern, startedAt } = prepareGrep(query, EMPTY_GREP_PATTERN);
  let info: FileInfo;
  try {
    aborted(signal);
    info = await stat(path);
  } catch (error) {
    throw failure(error, path);
  }
  if (!info.isFile() && !info.isDirectory()) throw notSearchableError(path);

  const plan = searchPlan(query, info.isDirectory());
  const result = await runSearch(plan.args, plan.preopens, signal);
  aborted(signal);
  if (result.code === 2) throw ripgrepFailure(result.stderr, path, pattern);
  if (result.code !== 0 && result.code !== 1)
    throw ripgrepExitError(path, result.code, result.stderr);
  const hits = parseOutput(result.stdout, plan.root, query);
  hits.files = await sortFiles(hits.files);
  return finish(query, startedAt, hits);
}

/** 文本搜索门面：显式指定进程内引擎；否则优先 ripgrep，运行时失败时降级。 */
export async function searchText(
  query: TextRequest,
  engine: "javascript" | "ripgrep" | undefined,
  signal?: AbortSignal,
): Promise<FileSystemSearchTextResult> {
  if (engine === "javascript") return searchInProcess(query, signal);
  try {
    return await searchWithRipgrep(query, signal);
  } catch (error) {
    if (error instanceof RipgrepRuntimeFailure) return searchInProcess(query, signal);
    throw failure(error, query.path);
  }
}
