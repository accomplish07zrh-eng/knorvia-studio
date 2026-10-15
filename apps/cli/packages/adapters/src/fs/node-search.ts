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
type TextResult = FileSystemSearchTextResult;
type FilesRequest = FileSystemSearchFilesRequest;
type FilesResult = FileSystemSearchFilesResult;
type Engine = "javascript" | "ripgrep" | undefined;
type FileInfo = Awaited<ReturnType<typeof stat>>;
type GlobMatch = (relativePath: string, fileName: string) => boolean;

interface Prepared {
  path: string;
  pattern: string;
  startedAt: number;
}

/** 单文件命中：count 为命中行数，entries 为该文件贡献的条目。 */
interface FileHits {
  count: number;
  entries: FileSystemSearchTextEntry[];
}

/** 搜索入口的公共前置：绝对化路径、trim 模式、记录起始时间。 */
function prepareGrep(query: TextRequest, emptyMessage: string): Prepared {
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

function notSearchableError(path: string): Error {
  const message = `Grep search path must be a file or directory: ${path}`;
  return createFileSystemError({ code: "not_file", message, path });
}

/** walk 的访问器：只收集 glob 命中且是文件的条目，顺序由 walk 的 DFS 决定。 */
function globCollector(
  base: string,
  matches: GlobMatch,
  collected: Candidate[],
): (file: string, info: FileInfo) => void {
  return (file, info) => {
    if (!matches(posixRelative(base, file), basename(file))) return;
    collected.push({ mtimeMs: Number(info.mtimeMs), path: file });
  };
}

export async function searchFiles(
  query: FilesRequest,
  cancellation?: AbortSignal,
): Promise<FilesResult> {
  const { path, pattern, startedAt } = prepareGrep(query, EMPTY_GLOB_PATTERN);
  try {
    aborted(cancellation);
    const root = await stat(path);
    if (!root.isDirectory()) throw notDirectoryError(path);
    const collected: Candidate[] = [];
    await walk(path, cancellation, globCollector(path, glob(pattern), collected));
    collected.sort(recent);
    const from = query.offset ?? 0;
    const cap = query.maxResults ?? DEFAULT_FILE_LIMIT;
    const visible = collected.slice(from, from + cap).map((file) => file.path);
    const result = {} as FilesResult;
    result.path = path;
    result.pattern = pattern;
    result.durationMs = Math.max(0, Date.now() - startedAt);
    result.files = visible;
    result.numFiles = visible.length;
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

/** 读一个文件并做行匹配：二进制（含 NUL）与零命中都返回 undefined。 */
async function matchOneFile(
  file: Candidate,
  regex: RegExp,
  rowQuery: TextRequest,
  cancellation: AbortSignal | undefined,
): Promise<FileHits | undefined> {
  aborted(cancellation);
  const text = await readFile(file.path, "utf8");
  if (text.includes("\0")) return undefined;
  const hit = matchContent(file.path, text, regex, rowQuery);
  if (hit.matchCount === 0) return undefined;
  return { count: hit.matchCount, entries: hit.entries };
}

/** 进程内引擎：逐文件读入后按行匹配，命中行按输出模式汇总。 */
async function searchInProcess(
  query: TextRequest,
  cancellation?: AbortSignal,
): Promise<TextResult> {
  const { path, pattern, startedAt } = prepareGrep(query, EMPTY_GREP_PATTERN);
  try {
    aborted(cancellation);
    const regex = compilePattern(pattern, query);
    const info = await stat(path);
    const scanRows = await candidates(path, info, query, cancellation);
    const mode = query.outputMode ?? "files_with_matches";
    const contentMode = mode === "content";
    const rowQuery: TextRequest = contentMode ? query : { ...query, onlyMatching: false };
    const hitFiles: Candidate[] = [];
    const entries: FileSystemSearchTextEntry[] = [];
    let numMatches = 0;

    for (const file of scanRows) {
      const hit = await matchOneFile(file, regex, rowQuery, cancellation);
      if (hit === undefined) continue;
      hitFiles.push(file);
      numMatches += hit.count;
      if (contentMode) entries.push(...hit.entries);
      else if (mode === "count") entries.push({ count: hit.count, path: file.path });
    }

    hitFiles.sort(recent);
    return finish(query, startedAt, {
      entries,
      files: hitFiles.map((file) => file.path),
      numMatches,
    });
  } catch (error) {
    throw failure(error, path);
  }
}

function ripgrepExitError(path: string, code: number | undefined, stderr: string): Error {
  const detail = stderr || UNKNOWN_RIPGREP_ERROR;
  const message = `ripgrep exited with code ${code}: ${detail}`;
  return createFileSystemError({ code: "io_error", message, path });
}

/** ripgrep 引擎：沙箱参数计划 → worker 执行 → 输出解析 → 新近度排序。 */
async function searchWithRipgrep(
  query: TextRequest,
  cancellation?: AbortSignal,
): Promise<TextResult> {
  const { path, pattern, startedAt } = prepareGrep(query, EMPTY_GREP_PATTERN);
  let info: FileInfo;
  try {
    aborted(cancellation);
    info = await stat(path);
  } catch (error) {
    throw failure(error, path);
  }
  if (!info.isFile() && !info.isDirectory()) throw notSearchableError(path);

  const plan = searchPlan(query, info.isDirectory());
  const result = await runSearch(plan.args, plan.preopens, cancellation);
  aborted(cancellation);
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
  engine: Engine,
  cancellation?: AbortSignal,
): Promise<TextResult> {
  if (engine === "javascript") return searchInProcess(query, cancellation);
  try {
    return await searchWithRipgrep(query, cancellation);
  } catch (error) {
    if (error instanceof RipgrepRuntimeFailure) return searchInProcess(query, cancellation);
    throw failure(error, query.path);
  }
}
