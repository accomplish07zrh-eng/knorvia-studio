import { isAbsolute, relative } from "node:path";
import type { GitFileChange } from "@knorvia/shared";
import { normalizeGitPath, normalizeWorkspaceInRepoPath } from "./config.js";

type SessionScopeInput = {
  workspacePath: string;
  repoRoot: string;
  workspaceInRepoPath: string;
  currentSessionFilePaths?: readonly string[];
};

type ScopeNode = {
  terminal: boolean;
  children: Map<string, ScopeNode>;
};

function scopeSpelling(path: string): string {
  return normalizeGitPath(path.trim())
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");
}

function admittedRelative(path: string): boolean {
  const spelling = normalizeGitPath(path);
  return (
    spelling.length > 0 &&
    !isAbsolute(spelling) &&
    spelling !== ".." &&
    !spelling.startsWith("../")
  );
}

function* sessionAliases(input: SessionScopeInput): Generator<string> {
  const paths = input.currentSessionFilePaths?.flatMap((source) => {
    const path = source.trim();
    return path ? [path] : [];
  }) ?? [];
  if (paths.length === 0) return;
  const workspacePrefix = normalizeWorkspaceInRepoPath(input.workspaceInRepoPath);
  for (const path of paths) {
    yield path;
    if (isAbsolute(path)) {
      for (const root of [input.repoRoot, input.workspacePath]) {
        const alias = relative(root, path);
        if (admittedRelative(alias)) yield alias;
      }
    } else {
      const spelling = scopeSpelling(path);
      if (workspacePrefix !== "." && !spelling.startsWith(`${workspacePrefix}/`)) {
        yield `${workspacePrefix}/${spelling}`;
      }
    }
  }
}

class ExactSessionScope {
  private readonly root: ScopeNode = { terminal: false, children: new Map() };

  constructor(aliases: Iterable<string>) {
    for (const alias of aliases) {
      const spelling = scopeSpelling(alias);
      if (!spelling) continue;
      let node = this.root;
      for (const segment of spelling.split("/")) {
        let child = node.children.get(segment);
        if (!child) {
          child = { terminal: false, children: new Map() };
          node.children.set(segment, child);
        }
        node = child;
      }
      node.terminal = true;
    }
  }

  includes(file: GitFileChange): boolean {
    if (this.root.children.size === 0) return true;
    return [file.path, file.repoRelativePath, file.workspaceRelativePath].some((path) => {
      let node = this.root;
      for (const segment of scopeSpelling(path).split("/")) {
        const child = node.children.get(segment);
        if (!child) return false;
        node = child;
      }
      return node.terminal;
    });
  }
}

export function filterCommitMessageFilesByCurrentSession(params: {
  files: readonly GitFileChange[];
  workspacePath: string;
  repoRoot: string;
  workspaceInRepoPath: string;
  currentSessionFilePaths?: readonly string[];
}): GitFileChange[] {
  const scope = new ExactSessionScope(sessionAliases(params));
  return params.files.filter((file) => scope.includes(file));
}
