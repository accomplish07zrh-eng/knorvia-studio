// SPDX-License-Identifier: Apache-2.0
// 搜索结果公开面：结果装配转发 + ripgrep 输出解析、新近度排序与失败归一。
import { stat } from "node:fs/promises";
import type { FileSystemErrorCode } from "@knorvia/contracts";
import {
  createFileSystemError,
  type FileSystemSearchTextEntry,
  type FileSystemSearchTextRequest,
  type FileSystemSearchTextResult,
} from "@knorvia/contracts";
import { filter, recent } from "./file-search-paths.js";
import { finishResult, outputLines, outputPath, type FoundHits } from "./text-search-finish.js";
import type { JsonEvent } from "./text-search-result-types.js";
import { matchingFragments } from "./text-search-lines.js";

const COUNT_SEPARATOR = ":";

export interface SearchHits {
  files: string[];
  entries: FileSystemSearchTextEntry[];
  numMatches: number;
}

export function finish(
  options: FileSystemSearchTextRequest,
  beganAt: number,
  found: FoundHits,
): FileSystemSearchTextResult {
  return finishResult(options, beganAt, found);
}

interface ParseState {
  entries: FileSystemSearchTextEntry[];
  files: Set<string>;
  isKept: (path: string) => boolean;
  numMatches: number;
  root: string;
}

/** count 列可用性：分隔符存在、计数为有限正数。 */
function isUsableCount(separator: number, count: number): boolean {
  if (separator <= 0) return false;
  return Number.isFinite(count) && count > 0;
}

/** files_with_matches 行：`<path>:<count>`，count 非正或路径被过滤时跳过。 */
function readCountLine(state: ParseState, line: string): void {
  const separator = line.lastIndexOf(COUNT_SEPARATOR);
  const count = Number.parseInt(line.slice(separator + 1), 10);
  if (!isUsableCount(separator, count)) return;
  const path = outputPath(state.root, line.slice(0, separator));
  if (!state.isKept(path)) return;
  state.files.add(path);
  state.numMatches += count;
  const summary = {} as FileSystemSearchTextEntry;
  summary.path = path;
  summary.count = count;
  state.entries.push(summary);
}

function jsonParseError(cause: unknown, path: string): Error {
  const message = "Failed to parse ripgrep JSON output";
  return createFileSystemError({ cause, code: "io_error", message, path });
}

function decodeEvent(line: string, request: FileSystemSearchTextRequest): JsonEvent {
  try {
    return JSON.parse(line) as JsonEvent;
  } catch (cause) {
    throw jsonParseError(cause, request.path);
  }
}

/** 命中片段：onlyMatching 时按 submatch 切分，否则调用方只带整行文本。 */
function splitFragments(
  event: JsonEvent,
  path: string,
  lineNumber: number | undefined,
): FileSystemSearchTextEntry[] {
  const collected: FileSystemSearchTextEntry[] = [];
  for (const fragment of event.data?.submatches ?? []) {
    collected.push(...matchingFragments(path, fragment.match?.text ?? "", lineNumber));
  }
  return collected;
}

/** content 模式行：match 计入文件与计数，context 只带出上下文文本。 */
function readEventLine(
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
  const hasFragments = (event.data?.submatches ?? []).length > 0;
  if (request.onlyMatching && matched && hasFragments) {
    state.entries.push(...splitFragments(event, path, lineNumber));
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
  output: string,
  base: string,
  request: FileSystemSearchTextRequest,
): SearchHits {
  const state: ParseState = {
    entries: [],
    files: new Set<string>(),
    isKept: filter(base, request),
    numMatches: 0,
    root: base,
  };
  const counting = request.outputMode !== "content";
  for (const line of outputLines(output)) {
    if (counting) readCountLine(state, line);
    else readEventLine(state, decodeEvent(line, request), request);
  }
  const hits = {} as SearchHits;
  hits.files = [...state.files];
  hits.entries = state.entries;
  hits.numMatches = state.numMatches;
  return hits;
}

async function statMtime(path: string): Promise<{ mtimeMs: number; path: string }> {
  const mtimeMs = await stat(path).then(
    (info) => Number(info.mtimeMs),
    () => 0,
  );
  return { mtimeMs, path };
}

export async function sortFiles(candidates: string[]): Promise<string[]> {
  const unique = [...new Set(candidates)];
  const probed = await Promise.all(unique.map((path) => statMtime(path)));
  return probed.sort(recent).map((row) => row.path);
}

/** 正则类失败与权限/缺失类失败的识别词表。 */
const REGEX_HINTS = ["regex parse error", "error parsing regex", "unclosed"];
const ACCESS_HINTS = ["permission denied", "os error 13"];
const ABSENT_HINTS = ["no such file", "os error 2"];

function hasAny(haystack: string, hints: readonly string[]): boolean {
  return hints.some((hint) => haystack.includes(hint));
}

export function ripgrepFailure(diagnostics: string, path: string, expression: string): Error {
  const detail = diagnostics.trim() || `ripgrep failed while searching ${path}`;
  const haystack = detail.toLowerCase();
  if (hasAny(haystack, REGEX_HINTS)) {
    return createFileSystemError({
      code: "invalid_pattern",
      message: `Invalid grep regular expression: ${expression}`,
      path,
    });
  }
  let code = "io_error";
  if (hasAny(haystack, ACCESS_HINTS)) code = "permission_denied";
  else if (hasAny(haystack, ABSENT_HINTS)) code = "not_found";
  return createFileSystemError({ code: code as FileSystemErrorCode, message: detail, path });
}
