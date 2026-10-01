// Source-exposed path rules and public API retained; key compilation/indexing replaced.
import { isAbsolute, relative } from "node:path";
import type { GitFileChange } from "@knorvia/shared";
import { normalizeGitPath, normalizeWorkspaceInRepoPath } from "./config.js";

function scopeKey(path: string): string {
  const text = normalizeGitPath(path.trim());
  const start = text.startsWith("./") ? 2 : text.startsWith("/") ? 1 : 0;
  let end = text.length;
  while (end > start && text[end - 1] === "/") end--;
  return text.slice(start, end);
}

function compileScopeKeys(params: {
  workspacePath: string;
  repoRoot: string;
  workspaceInRepoPath: string;
  currentSessionFilePaths?: readonly string[];
}): string[] {
  const sourcePaths = params.currentSessionFilePaths
    ?.map((path) => path.trim())
    .filter((path) => path.length > 0);
  if (!sourcePaths?.length) return [];

  const prefix = normalizeWorkspaceInRepoPath(params.workspaceInRepoPath);
  const aliases: string[] = [];
  for (const source of sourcePaths) {
    const key = scopeKey(source);
    aliases.push(key);
    if (isAbsolute(source)) {
      for (const base of [params.repoRoot, params.workspacePath]) {
        const spelling = normalizeGitPath(relative(base, source));
        if (spelling && spelling.split("/", 1)[0] !== ".." && !isAbsolute(spelling)) {
          aliases.push(scopeKey(spelling));
        }
      }
    } else if (prefix !== "." && !key.startsWith(`${prefix}/`)) {
      aliases.push(scopeKey(`${prefix}/${key}`));
    }
  }
  aliases.sort();
  return aliases.filter((key, index) => key.length > 0 && key !== aliases[index - 1]);
}

function hasScopeKey(keys: readonly string[], key: string): boolean {
  let start = 0;
  let end = keys.length;
  while (start < end) {
    const middle = start + Math.floor((end - start) / 2);
    if (keys[middle]! < key) start = middle + 1;
    else end = middle;
  }
  return keys[start] === key;
}

export function filterCommitMessageFilesByCurrentSession(params: {
  files: readonly GitFileChange[];
  workspacePath: string;
  repoRoot: string;
  workspaceInRepoPath: string;
  currentSessionFilePaths?: readonly string[];
}): GitFileChange[] {
  const keys = compileScopeKeys({
    workspacePath: params.workspacePath,
    repoRoot: params.repoRoot,
    workspaceInRepoPath: params.workspaceInRepoPath,
    currentSessionFilePaths: params.currentSessionFilePaths,
  });
  return params.files.filter((file) => {
    if (keys.length === 0) return true;
    const paths = [file.path, file.repoRelativePath, file.workspaceRelativePath];
    for (const path of paths) {
      if (hasScopeKey(keys, scopeKey(path))) return true;
    }
    return false;
  });
}
