// SPDX-License-Identifier: Apache-2.0
// Source-exposed behavior-contract candidate; no MIT or completed-review claim.
import type { GitFileChange, GitRepositorySummary } from "@knorvia/shared";
import { getPathLeaf } from "@/lib/path.js";
import {
  getWorkspaceFileDirectoryChildDepth,
  getWorkspaceFileParentDirectory,
  workspaceFilePathKey,
} from "@/workspace-file-tree/pathProjection.js";
import type {
  WorkspaceFileGitStatus,
  WorkspaceFileTreeNode,
  WorkspaceFileTreeRow,
} from "@/workspace-file-tree/treeProjectionTypes.js";

const fileOrder: readonly WorkspaceFileGitStatus[] = [
  "ignored",
  "modified",
  "renamed",
  "deleted",
  "added",
  "untracked",
];

function directoryRank(status: WorkspaceFileGitStatus): number {
  if (status === "ignored") return 3;
  return status === "modified" ? 2 : 1;
}

export function buildWorkspaceFileGitStatusByPath(
  changes: readonly Pick<GitFileChange, "path" | "isUntracked" | "kind" | "section">[],
): Map<string, WorkspaceFileGitStatus> {
  const result = new Map<string, WorkspaceFileGitStatus>();
  for (const change of changes) {
    const key = workspaceFilePathKey(change.path);
    const status = change.isUntracked || change.section === "untracked" ? "untracked" : change.kind;
    const previous = result.get(key);
    if (previous === undefined || fileOrder.indexOf(status) > fileOrder.indexOf(previous)) {
      result.set(key, status);
    }
  }
  return result;
}

export function isWorkspaceFileTreeGitStatusAvailable(
  summary: Pick<GitRepositorySummary, "isGitAvailable" | "isRepository">,
): boolean {
  // 非 Git 项目的空改动列表不代表状态可用，仍以服务 summary 的两个事实为准。
  return summary.isGitAvailable && summary.isRepository;
}

export function getWorkspaceFileGitStatus(
  statusByPath: ReadonlyMap<string, WorkspaceFileGitStatus>,
  filePath: string,
): WorkspaceFileGitStatus | null {
  return statusByPath.get(workspaceFilePathKey(filePath)) ?? null;
}

export function buildWorkspaceFileIgnoredPathSet(paths: readonly string[]): Set<string> {
  const ignored = new Set<string>();
  for (const path of paths) ignored.add(workspaceFilePathKey(path));
  return ignored;
}

export function isWorkspaceFileGitIgnored(
  ignoredPathSet: ReadonlySet<string>,
  filePath: string,
): boolean {
  return ignoredPathSet.has(workspaceFilePathKey(filePath));
}

export function isWorkspaceFileTreeDeletedFile(
  row: Pick<WorkspaceFileTreeRow, "type">,
  gitStatus: WorkspaceFileGitStatus | null | undefined,
): boolean {
  return gitStatus === "deleted" && row.type !== "directory";
}

export function getWorkspaceDirectoryGitStatuses(
  statusByPath: ReadonlyMap<string, WorkspaceFileGitStatus>,
  directoryPath: string,
): WorkspaceFileGitStatus[] {
  const prefix = workspaceFilePathKey(directoryPath) + "/";
  const unique = new Set<WorkspaceFileGitStatus>();
  for (const [path, status] of statusByPath) {
    if (workspaceFilePathKey(path).slice(0, prefix.length) === prefix) unique.add(status);
  }
  return Array.from(unique).sort((left, right) => directoryRank(right) - directoryRank(left));
}

export function addDeletedGitStatusRowsToWorkspaceFileTree(params: {
  rootPath: string;
  childrenByDirectory: Map<string, WorkspaceFileTreeNode[]>;
  statusByPath: ReadonlyMap<string, WorkspaceFileGitStatus>;
}): Map<string, WorkspaceFileTreeNode[]> {
  const additions = new Map<string, { nodes: WorkspaceFileTreeNode[]; known: Set<string> }>();
  for (const [path, status] of params.statusByPath) {
    if (status !== "deleted") continue;
    const parent = getWorkspaceFileParentDirectory(params.rootPath, path);
    if (!parent) continue;
    const children = params.childrenByDirectory.get(parent);
    if (!children) continue;
    let directory = additions.get(parent);
    const key = workspaceFilePathKey(path);
    if (!directory) {
      const known = new Set(children.map((child) => workspaceFilePathKey(child.path)));
      if (known.has(key)) continue;
      directory = { nodes: [...children], known };
      additions.set(parent, directory);
    }
    if (directory.known.has(key)) continue;
    directory.known.add(key);
    // deleted 文件不再存在于 readdir；仅为已有父级补投影，不伪造目录加载事实。
    directory.nodes.push({
      path,
      name: getPathLeaf(path),
      type: "file",
      depth: getWorkspaceFileDirectoryChildDepth(params.rootPath, parent),
    });
  }
  if (additions.size === 0) return params.childrenByDirectory;
  const result = new Map(params.childrenByDirectory);
  for (const [parent, directory] of additions) {
    directory.nodes.sort((left, right) => {
      if (left.type === right.type) return left.name.localeCompare(right.name);
      return left.type === "directory" ? -1 : 1;
    });
    result.set(parent, directory.nodes);
  }
  return result;
}
