import { stat } from "node:fs/promises";
import { isAbsolute, normalize, join } from "node:path";
import {
  createFileSystemError,
  type FileSystemSearchTextEntry,
  type FileSystemSearchTextRequest,
  type FileSystemSearchTextResult,
} from "@knorvia/contracts";
import { filter, recent } from "./file-search-paths.js";
import { matchingFragments } from "./text-search-lines.js";

const DEFAULT_HEAD_LIMIT = 250;
export interface SearchHits {
  files: string[];
  entries: FileSystemSearchTextEntry[];
  numMatches: number;
}
function limit<T>(items: T[], request: FileSystemSearchTextRequest) {
  const offset = request.offset ?? 0,
    maximum = request.headLimit ?? DEFAULT_HEAD_LIMIT;
  const truncated = maximum !== 0 && items.length - offset > maximum;
  return {
    items: maximum === 0 ? items.slice(offset) : items.slice(offset, offset + maximum),
    truncated,
    appliedLimit: truncated ? maximum : undefined,
    appliedOffset: offset > 0 ? offset : undefined,
  };
}
export function finish(
  request: FileSystemSearchTextRequest,
  startedAt: number,
  hits: SearchHits,
): FileSystemSearchTextResult {
  const mode = request.outputMode ?? "files_with_matches";
  const selected = limit(
    mode === "files_with_matches" ? hits.files : (hits.entries as unknown[]),
    request,
  );
  return {
    path: request.path,
    pattern: request.pattern.trim(),
    mode,
    durationMs: Math.max(0, Date.now() - startedAt),
    files: mode === "files_with_matches" ? (selected.items as string[]) : hits.files,
    entries: mode === "files_with_matches" ? [] : (selected.items as FileSystemSearchTextEntry[]),
    numMatches: hits.numMatches,
    truncated: selected.truncated,
    appliedLimit: selected.appliedLimit,
    appliedOffset: selected.appliedOffset,
  };
}
interface JsonEvent {
  type?: string;
  data?: {
    path?: { text?: string };
    lines?: { text?: string };
    line_number?: number;
    submatches?: { match?: { text?: string } }[];
  };
}
function outputLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line, index, all) => line.length > 0 || index < all.length - 1);
}
function outputPath(root: string, value: string): string {
  return normalize(
    isAbsolute(value) ? value : join(root, value.startsWith("./") ? value.slice(2) : value),
  );
}
export function parseOutput(
  text: string,
  root: string,
  request: FileSystemSearchTextRequest,
): SearchHits {
  const keep = filter(root, request),
    files = new Set<string>(),
    entries: FileSystemSearchTextEntry[] = [];
  let numMatches = 0;
  for (const line of outputLines(text)) {
    if (request.outputMode !== "content") {
      const separator = line.lastIndexOf(":"),
        count = Number.parseInt(line.slice(separator + 1), 10);
      if (separator <= 0 || !Number.isFinite(count) || count <= 0) continue;
      const path = outputPath(root, line.slice(0, separator));
      if (!keep(path)) continue;
      files.add(path);
      numMatches += count;
      entries.push({ path, count });
      continue;
    }
    let event: JsonEvent;
    try {
      event = JSON.parse(line) as JsonEvent;
    } catch (cause) {
      throw createFileSystemError({
        code: "io_error",
        path: request.path,
        message: "Failed to parse ripgrep JSON output",
        cause,
      });
    }
    if (event.type !== "match" && event.type !== "context") continue;
    const source = event.data?.path?.text;
    if (!source) continue;
    const path = outputPath(root, source);
    if (!keep(path)) continue;
    const matched = event.type === "match";
    if (matched) {
      files.add(path);
      numMatches++;
    }
    const lineNumber =
      typeof event.data?.line_number === "number" ? event.data.line_number : undefined;
    const fragments = event.data?.submatches ?? [];
    if (request.onlyMatching && matched && fragments.length) {
      for (const fragment of fragments)
        entries.push(...matchingFragments(path, fragment.match?.text ?? "", lineNumber));
    } else
      entries.push({
        path,
        lineNumber,
        text: (event.data?.lines?.text ?? "").replace(/\r?\n$/, ""),
        matched,
      });
  }
  return { files: [...files], entries, numMatches };
}
export async function sortFiles(paths: string[]): Promise<string[]> {
  const rows = await Promise.all(
    [...new Set(paths)].map(async (path) => {
      try {
        return { path, mtimeMs: Number((await stat(path)).mtimeMs) };
      } catch {
        return { path, mtimeMs: 0 };
      }
    }),
  );
  return rows.sort(recent).map((row) => row.path);
}
export function ripgrepFailure(stderr: string, path: string, pattern: string): Error {
  const message = stderr.trim() || `ripgrep failed while searching ${path}`,
    lowered = message.toLowerCase();
  if (
    ["regex parse error", "error parsing regex", "unclosed"].some((part) => lowered.includes(part))
  )
    return createFileSystemError({
      code: "invalid_pattern",
      path,
      message: `Invalid grep regular expression: ${pattern}`,
    });
  const code = ["permission denied", "os error 13"].some((part) => lowered.includes(part))
    ? "permission_denied"
    : ["no such file", "os error 2"].some((part) => lowered.includes(part))
      ? "not_found"
      : "io_error";
  return createFileSystemError({ code, path, message });
}
