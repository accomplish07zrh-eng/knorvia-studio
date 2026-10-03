import { rm } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import type { GitCheckpointDiff, GitCheckpointFileDiff } from "@knorvia/shared";
import { normalizeGitPath, toWorkspaceRelativeGitPath } from "../config.js";
import { getWorkspaceHash } from "../../paths.js";

interface GitCheckpointNameStatusEntry {
  kind: GitCheckpointFileDiff["kind"];
  path: string;
  originalPath: string | null;
}

interface GitTreeEntry {
  mode: string;
  type: string;
  objectId: string;
  path: string;
}

export function toAbsolutePath(repoRoot: string, repoRelativePath: string): string {
  return resolve(repoRoot, ...normalizeGitPath(repoRelativePath).split("/"));
}

export function getWorkspacePathspec(workspaceInRepoPath: string): string {
  return workspaceInRepoPath === "." ? "." : workspaceInRepoPath;
}

export function getCheckpointRefName(workspacePath: string, checkpointId: string): string {
  return `refs/knorvia/checkpoints/${getWorkspaceHash(workspacePath)}/${checkpointId}`;
}

export function parseNameStatus(stdout: string): GitCheckpointNameStatusEntry[] {
  const records = stdout.split("\0").filter(Boolean);
  const entries: GitCheckpointNameStatusEntry[] = [];
  let cursor = 0;
  while (cursor < records.length) {
    const status = records[cursor++]?.[0] ?? "M";
    if (status === "R" || status === "C") {
      const originalPath = records[cursor++];
      const path = records[cursor++];
      if (originalPath && path) {
        entries.push({
          kind: "renamed",
          originalPath: normalizeGitPath(originalPath),
          path: normalizeGitPath(path),
        });
      }
      continue;
    }
    const path = records[cursor++];
    if (!path) continue;
    const kind = status === "A" ? "added" : status === "D" ? "deleted" : "modified";
    entries.push({ kind, originalPath: null, path: normalizeGitPath(path) });
  }
  return entries;
}

export function parseNumstat(stdout: string): Map<string, { added: number; removed: number }> {
  const records = stdout.split("\0").filter(Boolean);
  const result = new Map<string, { added: number; removed: number }>();
  let cursor = 0;
  while (cursor < records.length) {
    const fields = (records[cursor++] ?? "").split("\t");
    if (fields.length < 3) continue;
    const added = fields[0] === "-" ? 0 : parseInt(fields[0] ?? "0", 10) || 0;
    const removed = fields[1] === "-" ? 0 : parseInt(fields[1] ?? "0", 10) || 0;
    const path = fields.slice(2).join("\t");
    if (path) {
      result.set(normalizeGitPath(path), { added, removed });
      continue;
    }
    const originalPath = records[cursor++];
    const newPath = records[cursor++];
    if (!newPath) continue;
    result.set(normalizeGitPath(newPath), { added, removed });
    if (originalPath) result.set(normalizeGitPath(originalPath), { added, removed });
  }
  return result;
}

export function parseLsTree(stdout: string): Map<string, GitTreeEntry> {
  const result = new Map<string, GitTreeEntry>();
  for (const record of stdout.split("\0").filter(Boolean)) {
    const separator = record.indexOf("\t");
    if (separator < 0) continue;
    const header = record.slice(0, separator).split(" ");
    if (header.length < 3) continue;
    const path = normalizeGitPath(record.slice(separator + 1));
    result.set(path, {
      mode: header[0] ?? "100644",
      type: header[1] ?? "blob",
      objectId: header[2] ?? "",
      path,
    });
  }
  return result;
}

export function mergeCheckpointDiff(params: {
  repoRoot: string;
  workspaceInRepoPath: string;
  fromCheckpointId: string;
  toCheckpointId: string;
  nameStatusEntries: GitCheckpointNameStatusEntry[];
  numstat: Map<string, { added: number; removed: number }>;
}): GitCheckpointDiff {
  const files: GitCheckpointFileDiff[] = params.nameStatusEntries.map((entry) => {
    const stat = params.numstat.get(entry.path) ??
      params.numstat.get(entry.originalPath ?? "") ?? { added: 0, removed: 0 };
    return {
      path: toAbsolutePath(params.repoRoot, entry.path),
      repoRelativePath: entry.path,
      workspaceRelativePath: toWorkspaceRelativeGitPath(entry.path, params.workspaceInRepoPath),
      originalPath: entry.originalPath ? toAbsolutePath(params.repoRoot, entry.originalPath) : null,
      kind: entry.kind,
      added: stat.added,
      removed: stat.removed,
    };
  });
  return {
    fromCheckpointId: params.fromCheckpointId,
    toCheckpointId: params.toCheckpointId,
    files,
  };
}

export function buildAffectedRepoPaths(files: GitCheckpointFileDiff[]): string[] {
  const paths = new Set<string>();
  for (const file of files) {
    paths.add(file.repoRelativePath);
    if (file.originalPath) paths.add(file.originalPath);
  }
  return [...paths];
}

export function buildCheckpointEnv(tempIndexPath: string): NodeJS.ProcessEnv {
  return {
    GIT_INDEX_FILE: tempIndexPath,
    GIT_AUTHOR_NAME: "Knorvia Studio Checkpoint",
    GIT_AUTHOR_EMAIL: "checkpoint@knorvia.local",
    GIT_COMMITTER_NAME: "Knorvia Studio Checkpoint",
    GIT_COMMITTER_EMAIL: "checkpoint@knorvia.local",
  };
}

export async function removeFileIfExists(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true });
}

export function normalizeAffectedRepoPath(repoRoot: string, path: string): string {
  return normalizeGitPath(isAbsolute(path) ? path.replace(`${repoRoot}${sep}`, "") : path);
}
