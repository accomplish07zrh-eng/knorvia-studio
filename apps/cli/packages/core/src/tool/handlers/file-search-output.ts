// Shared stateless search projections; specs/knorvia-file-search-tools.md.
import { isAbsolute, relative, sep } from "node:path";
import type { FileSystemSearchTextResult, GrepOutput } from "@knorvia/contracts";

export function displaySearchPath(file: string, directory: string): string {
  const candidate = relative(directory, file);
  const canDisplayRelative =
    candidate.length > 0 && candidate.slice(0, 2) !== ".." && !isAbsolute(candidate);
  return canDisplayRelative ? candidate.split(sep).join("/") : file;
}

export function projectTextSearch(
  result: FileSystemSearchTextResult,
  directory: string,
  numbered: boolean,
): GrepOutput {
  const files = result.files.map((file) => displaySearchPath(file, directory));
  const common = {
    mode: result.mode,
    durationMs: result.durationMs,
    numFiles: files.length,
    filenames: result.mode === "files_with_matches" ? files : [],
    truncated: result.truncated,
    appliedLimit: result.appliedLimit,
    appliedOffset: result.appliedOffset,
  };
  if (result.mode !== "content" && result.mode !== "count")
    return { ...common, numMatches: result.numMatches };
  const lines = result.entries.map((entry) => {
    const file = displaySearchPath(entry.path, directory);
    if (result.mode === "count") return `${file}:${entry.count ?? 0}`;
    const prefix =
      numbered && entry.lineNumber !== undefined ? `${file}:${entry.lineNumber}:` : `${file}:`;
    return prefix + (entry.text ?? "");
  });
  return result.mode === "content"
    ? {
        ...common,
        content: lines.join("\n"),
        numLines: result.entries.length,
        numMatches: result.numMatches,
      }
    : { ...common, content: lines.join("\n"), numMatches: result.numMatches };
}
