// SPDX-License-Identifier: Apache-2.0
// 搜索结果：分页裁剪、ripgrep 输出解析、按新近度排序与失败归一。
import { stat } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";
import {
  createFileSystemError,
  type FileSystemSearchTextEntry,
  type FileSystemSearchTextRequest,
  type FileSystemSearchTextResult,
} from "@knorvia/contracts";
import { filter, recent } from "./file-search-paths.js";
import type { JsonEvent, Page, PageInput } from "./text-search-result-types.js";
import { matchingFragments } from "./text-search-lines.js";

const DEFAULT_HEAD_LIMIT = 250;
const DOT_SLASH = "./";
const COUNT_SEPARATOR = ":";

export interface SearchHits {
  files: string[];
  entries: FileSystemSearchTextEntry[];
  numMatches: number;
}

/** 分页：headLimit 为 0 表示「不裁剪」但仍应用 offset。 */
function pageOf<T>(input: PageInput<T>): Page {
  const from = input.request.offset ?? 0;
  const cap = input.request.headLimit ?? DEFAULT_HEAD_LIMIT;
  const overflowed = cap !== 0 && input.items.length - from > cap;
  const page = {} as Page;
  page.items = cap === 0 ? input.items.slice(from) : input.items.slice(from, from + cap);
  page.truncated = overflowed;
  page.appliedLimit = overflowed ? cap : undefined;
  page.appliedOffset = from > 0 ? from : undefined;
  return page;
}

/** 结果装配：按输出模式决定 files/entries 哪一侧携带分页后的条目。 */
export function finish(
  request: FileSystemSearchTextRequest,
  startedAt: number,
  hits: SearchHits,
): FileSystemSearchTextResult {
  const mode = request.outputMode ?? "files_with_matches";
  const listing = mode === "files_with_matches";
  const page = pageOf({ items: listing ? hits.files : (hits.entries as unknown[]), request });
  const result = {} as FileSystemSearchTextResult;
  result.path = request.path;
  result.pattern = request.pattern.trim();
  result.mode = mode;
  result.durationMs = Math.max(0, Date.now() - startedAt);
  result.files = listing ? (page.items as string[]) : hits.files;
  result.entries = listing ? [] : (page.items as FileSystemSearchTextEntry[]);
  result.numMatches = hits.numMatches;
  result.truncated = page.truncated;
  result.appliedLimit = page.appliedLimit;
  result.appliedOffset = page.appliedOffset;
  return result;
}

function outputLines(text: string): string[] {
  const rows = text.split("\n").map((row) => (row.endsWith("\r") ? row.slice(0, -1) : row));
  return rows.filter((row, index) => row.length > 0 || index < rows.length - 1);
}

function outputPath(root: string, value: string): string {
  const relative = value.startsWith(DOT_SLASH) ? value.slice(DOT_SLASH.length) : value;
  return normalize(isAbsolute(value) ? value : join(root, relative));
}

interface ParseState {
  entries: FileSystemSearchTextEntry[];
  files: Set<string>;
  isKept: (path: string) => boolean;
  numMatches: number;
  root: string;
}

/** files_with_matches 行：`<path>:<count>`，count 非正或路径被过滤时跳过。 */
function consumeCountLine(state: ParseState, line: string): void {
  const separator = line.lastIndexOf(COUNT_SEPARATOR);
  const count = Number.parseInt(line.slice(separator + 1), 10);
  if (separator <= 0 || !Number.isFinite(count) || count <= 0) return;
  const path = outputPath(state.root, line.slice(0, separator));
  if (!state.isKept(path)) return;
  state.files.add(path);
  state.numMatches += count;
  const summary = {} as FileSystemSearchTextEntry;
  summary.path = path;
  summary.count = count;
  state.entries.push(summary);
}

function parseJsonLine(line: string, request: FileSystemSearchTextRequest): JsonEvent {
  try {
    return JSON.parse(line) as JsonEvent;
  } catch (cause) {
    throw createFileSystemError({
      cause,
      code: "io_error",
      message: "Failed to parse ripgrep JSON output",
      path: request.path,
    });
  }
}

/** 命中片段：onlyMatching 时按 submatch 切分，否则只带整行文本。 */
function fragmentsFor(
  event: JsonEvent,
  path: string,
  lineNumber: number | undefined,
): FileSystemSearchTextEntry[] {
  const fragments = event.data?.submatches ?? [];
  const collected: FileSystemSearchTextEntry[] = [];
  for (const fragment of fragments) {
    collected.push(...matchingFragments(path, fragment.match?.text ?? "", lineNumber));
  }
  return collected;
}

/** content 模式行：match 计入文件与计数，context 只带出上下文文本。 */
function consumeJsonLine(
  state: ParseState,
  event: JsonEvent,
  request: FileSystemSearchTextRequest,
): void {
  if (event.type !== "match" && event.type !== "context") return;
  const source = event.data?.path?.text;
  if (!source) return;
  const path = outputPath(state.root, source);
  if (!state.isKept(path)) return;

  const matched = event.type === "match";
  if (matched) {
    state.files.add(path);
    state.numMatches += 1;
  }
  const lineNumber =
    typeof event.data?.line_number === "number" ? event.data.line_number : undefined;
  const fragments = event.data?.submatches ?? [];
  if (request.onlyMatching && matched && fragments.length > 0) {
    state.entries.push(...fragmentsFor(event, path, lineNumber));
    return;
  }
  const line = {} as FileSystemSearchTextEntry;
  line.path = path;
  line.lineNumber = lineNumber;
  line.text = (event.data?.lines?.text ?? "").replace(/\r?\n$/u, "");
  line.matched = matched;
  state.entries.push(line);
}

export function parseOutput(
  text: string,
  root: string,
  request: FileSystemSearchTextRequest,
): SearchHits {
  const state: ParseState = {
    entries: [],
    files: new Set<string>(),
    isKept: filter(root, request),
    numMatches: 0,
    root,
  };
  const counting = request.outputMode !== "content";
  for (const line of outputLines(text)) {
    if (counting) consumeCountLine(state, line);
    else consumeJsonLine(state, parseJsonLine(line, request), request);
  }
  const hits = {} as SearchHits;
  hits.files = [...state.files];
  hits.entries = state.entries;
  hits.numMatches = state.numMatches;
  return hits;
}

async function probeMtime(path: string): Promise<{ mtimeMs: number; path: string }> {
  const mtimeMs = await stat(path).then(
    (info) => Number(info.mtimeMs),
    () => 0,
  );
  return { mtimeMs, path };
}

export async function sortFiles(paths: string[]): Promise<string[]> {
  const unique = [...new Set(paths)];
  const probed = await Promise.all(unique.map((path) => probeMtime(path)));
  return probed.sort(recent).map((row) => row.path);
}

/** 正则类失败与权限/缺失类失败的识别词表。 */
const PATTERN_HINTS = ["regex parse error", "error parsing regex", "unclosed"];
const PERMISSION_HINTS = ["permission denied", "os error 13"];
const MISSING_HINTS = ["no such file", "os error 2"];

function mentions(haystack: string, hints: readonly string[]): boolean {
  return hints.some((hint) => haystack.includes(hint));
}

export function ripgrepFailure(stderr: string, path: string, pattern: string): Error {
  const detail = stderr.trim() || `ripgrep failed while searching ${path}`;
  const haystack = detail.toLowerCase();
  if (mentions(haystack, PATTERN_HINTS)) {
    return createFileSystemError({
      code: "invalid_pattern",
      message: `Invalid grep regular expression: ${pattern}`,
      path,
    });
  }
  let code = "io_error";
  if (mentions(haystack, PERMISSION_HINTS)) code = "permission_denied";
  else if (mentions(haystack, MISSING_HINTS)) code = "not_found";
  return createFileSystemError({ code, message: detail, path });
}
