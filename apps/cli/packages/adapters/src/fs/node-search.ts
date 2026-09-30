import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import {
  createFileSystemError,
  type FileSystemSearchFilesRequest,
  type FileSystemSearchFilesResult,
  type FileSystemSearchTextRequest,
  type FileSystemSearchTextEntry,
  type FileSystemSearchTextResult,
} from "@knorvia/contracts";
import { absolute, aborted, failure } from "./node-file-policy.js";
import {
  candidates,
  glob,
  posixRelative,
  recent,
  walk,
  type Candidate,
} from "./file-search-paths.js";
import { matchContent } from "./text-search-lines.js";
import { finish, parseOutput, ripgrepFailure, sortFiles } from "./text-search-results.js";
import { searchPlan } from "./ripgrep-plan.js";
import { runSearch, RipgrepRuntimeFailure } from "./ripgrep-worker.js";

const DEFAULT_FILE_LIMIT = 100;
function grepRequest(request: FileSystemSearchTextRequest) {
  const path = absolute(request.path),
    pattern = request.pattern.trim(),
    startedAt = Date.now();
  if (!pattern.length)
    throw createFileSystemError({
      code: "invalid_pattern",
      path,
      message: "Grep pattern must not be empty",
    });
  return { path, pattern, startedAt };
}
export async function searchFiles(
  request: FileSystemSearchFilesRequest,
  signal?: AbortSignal,
): Promise<FileSystemSearchFilesResult> {
  const path = absolute(request.path),
    pattern = request.pattern.trim(),
    startedAt = Date.now();
  if (!pattern.length)
    throw createFileSystemError({
      code: "invalid_pattern",
      path,
      message: "Glob pattern must not be empty",
    });
  try {
    aborted(signal);
    if (!(await stat(path)).isDirectory())
      throw createFileSystemError({
        code: "not_file",
        path,
        message: `Glob search path must be a directory: ${path}`,
      });
    const keep = glob(pattern),
      rows: Candidate[] = [];
    await walk(path, signal, (file, info) => {
      if (keep(posixRelative(path, file), basename(file)))
        rows.push({ path: file, mtimeMs: Number(info.mtimeMs) });
    });
    rows.sort(recent);
    const offset = request.offset ?? 0,
      max = request.maxResults ?? DEFAULT_FILE_LIMIT;
    const files = rows.slice(offset, offset + max).map((row) => row.path);
    return {
      path,
      pattern,
      durationMs: Math.max(0, Date.now() - startedAt),
      files,
      numFiles: files.length,
      truncated: rows.length > offset + max,
    };
  } catch (error) {
    throw failure(error, path);
  }
}
function expression(pattern: string, request: FileSystemSearchTextRequest): RegExp {
  try {
    return new RegExp(pattern, (request.ignoreCase ? "i" : "") + (request.multiline ? "s" : ""));
  } catch (cause) {
    throw createFileSystemError({
      code: "invalid_pattern",
      path: request.path,
      message: `Invalid grep regular expression: ${pattern}`,
      cause,
    });
  }
}
async function javascript(
  request: FileSystemSearchTextRequest,
  signal?: AbortSignal,
): Promise<FileSystemSearchTextResult> {
  const { path, pattern, startedAt } = grepRequest(request);
  try {
    aborted(signal);
    const regex = expression(pattern, request),
      info = await stat(path),
      rows = await candidates(path, info, request, signal);
    const mode = request.outputMode ?? "files_with_matches",
      matchRequest = mode === "content" ? request : { ...request, onlyMatching: false };
    const matched: Candidate[] = [],
      entries: FileSystemSearchTextEntry[] = [];
    let numMatches = 0;
    for (const row of rows) {
      aborted(signal);
      const text = await readFile(row.path, "utf8");
      if (text.includes("\0")) continue;
      const result = matchContent(row.path, text, regex, matchRequest);
      if (!result.matchCount) continue;
      matched.push(row);
      numMatches += result.matchCount;
      if (mode === "content") entries.push(...result.entries);
      else if (mode === "count") entries.push({ path: row.path, count: result.matchCount });
    }
    matched.sort(recent);
    return finish(request, startedAt, {
      files: matched.map((row) => row.path),
      entries,
      numMatches,
    });
  } catch (error) {
    throw failure(error, path);
  }
}
async function ripgrep(
  request: FileSystemSearchTextRequest,
  signal?: AbortSignal,
): Promise<FileSystemSearchTextResult> {
  const { path, pattern, startedAt } = grepRequest(request);
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    aborted(signal);
    info = await stat(path);
  } catch (error) {
    throw failure(error, path);
  }
  if (!info.isFile() && !info.isDirectory())
    throw createFileSystemError({
      code: "not_file",
      path,
      message: `Grep search path must be a file or directory: ${path}`,
    });
  const plan = searchPlan(request, info.isDirectory());
  const result = await runSearch(plan.args, plan.preopens, signal);
  aborted(signal);
  if (result.code === 2) throw ripgrepFailure(result.stderr, path, pattern);
  if (result.code !== 0 && result.code !== 1)
    throw createFileSystemError({
      code: "io_error",
      path,
      message: `ripgrep exited with code ${result.code}: ${result.stderr || "unknown error"}`,
    });
  const hits = parseOutput(result.stdout, plan.root, request);
  hits.files = await sortFiles(hits.files);
  return finish(request, startedAt, hits);
}
export async function searchText(
  request: FileSystemSearchTextRequest,
  engine: "javascript" | "ripgrep" | undefined,
  signal?: AbortSignal,
): Promise<FileSystemSearchTextResult> {
  if (engine === "javascript") return javascript(request, signal);
  try {
    return await ripgrep(request, signal);
  } catch (error) {
    if (error instanceof RipgrepRuntimeFailure) return javascript(request, signal);
    throw failure(error, request.path);
  }
}
