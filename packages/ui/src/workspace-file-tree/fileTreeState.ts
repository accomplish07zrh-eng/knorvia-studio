// SPDX-License-Identifier: Apache-2.0
// Contract-authored snapshot operations; source review and verification pending.
import { buildWorkspaceFileIgnoredPathSet, isWorkspaceFilePathInside } from "./model.js";
import type { WorkspaceFileGitStatus, WorkspaceFileTreeNode } from "./model.js";

export interface WorkspaceFileTreeSnapshot {
  childrenByDirectory: Map<string, WorkspaceFileTreeNode[]>;
  expandedPaths: Set<string>;
  loadedDirectoryPaths: Set<string>;
  loadingDirectoryPaths: Set<string>;
  errorByDirectory: Map<string, Error>;
  gitStatusByPath: Map<string, WorkspaceFileGitStatus>;
  gitStatusAvailable: boolean;
  ignoredPathSet: Set<string>;
  refreshingLoadedDirectories: boolean;
}

export function emptyWorkspaceFileTree(): WorkspaceFileTreeSnapshot {
  return {
    childrenByDirectory: new Map(),
    expandedPaths: new Set(),
    loadedDirectoryPaths: new Set(),
    loadingDirectoryPaths: new Set(),
    errorByDirectory: new Map(),
    gitStatusByPath: new Map(),
    gitStatusAvailable: false,
    ignoredPathSet: new Set(),
    refreshingLoadedDirectories: false,
  };
}

export type FileTreeSetUpdate = Set<string> | ((current: Set<string>) => Set<string>);

export function updateFileTreeSet(
  current: Set<string>,
  path: string,
  present: boolean,
): Set<string> {
  const next = new Set(current);
  if (present) next.add(path);
  else next.delete(path);
  return next;
}

export function updateFileTreeMap<T>(
  current: Map<string, T>,
  path: string,
  value?: T,
): Map<string, T> {
  const next = new Map(current);
  if (value === undefined) next.delete(path);
  else next.set(path, value);
  return next;
}

export function removeFileTreeSubtree(
  snapshot: WorkspaceFileTreeSnapshot,
  directoryPath: string,
): Partial<WorkspaceFileTreeSnapshot> {
  const retainPath = (path: string) => !isWorkspaceFilePathInside(directoryPath, path);
  const retainSet = (set: Set<string>) => new Set([...set].filter(retainPath));
  const retainMap = <T>(map: Map<string, T>) =>
    new Map([...map].filter(([path]) => retainPath(path)));
  return {
    childrenByDirectory: retainMap(snapshot.childrenByDirectory),
    errorByDirectory: retainMap(snapshot.errorByDirectory),
    expandedPaths: retainSet(snapshot.expandedPaths),
    loadedDirectoryPaths: retainSet(snapshot.loadedDirectoryPaths),
    loadingDirectoryPaths: retainSet(snapshot.loadingDirectoryPaths),
  };
}

export function replaceDirectoryIgnoredPaths(
  current: Set<string>,
  entryPaths: string[],
  ignoredPaths: string[],
): Set<string> {
  const next = new Set(current);
  for (const path of entryPaths) next.delete(path.replace(/\\/g, "/").replace(/\/+$/, ""));
  for (const path of buildWorkspaceFileIgnoredPathSet(ignoredPaths)) next.add(path);
  return next;
}
