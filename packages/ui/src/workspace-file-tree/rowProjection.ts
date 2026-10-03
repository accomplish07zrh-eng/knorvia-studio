// SPDX-License-Identifier: Apache-2.0
// Source-exposed contract implementation; retained compatibility expressions await review.
import {
  getWorkspaceDirectoryGitStatuses,
  getWorkspaceFileGitStatus,
} from "@/workspace-file-tree/gitProjection.js";
import { isWorkspaceFilePathInside } from "@/workspace-file-tree/pathProjection.js";
import type {
  WorkspaceFileGitStatus,
  WorkspaceFileTreeNode,
  WorkspaceFileTreeRow,
} from "@/workspace-file-tree/treeProjectionTypes.js";

type TreeInput = {
  rootPath: string;
  childrenByDirectory: Map<string, WorkspaceFileTreeNode[]>;
  expandedPaths: Set<string>;
  loadedDirectoryPaths: Set<string>;
  loadingDirectoryPaths: Set<string>;
  errorByDirectory: Map<string, Error>;
  flattenEmptyDirectories?: boolean;
};

export function isWorkspaceFileTreeAutoFlattenableDirectory(
  node: Pick<WorkspaceFileTreeNode, "type" | "isSymbolicLink"> | undefined,
): node is WorkspaceFileTreeNode {
  // 软链只能由用户手动进入，自动追链会无限进入 self/parent symlink。
  return node != null && node.type === "directory" && node.isSymbolicLink !== true;
}

function representNode(first: WorkspaceFileTreeNode, input: TreeInput) {
  const chain = [first];
  if (input.flattenEmptyDirectories && isWorkspaceFileTreeAutoFlattenableDirectory(first)) {
    let tail = first;
    for (;;) {
      if (!input.loadedDirectoryPaths.has(tail.path)) break;
      if (input.loadingDirectoryPaths.has(tail.path) || input.errorByDirectory.has(tail.path))
        break;
      const children = input.childrenByDirectory.get(tail.path);
      if (!children || children.length !== 1) break;
      const onlyChild = children[0];
      if (!isWorkspaceFileTreeAutoFlattenableDirectory(onlyChild)) break;
      chain.push(onlyChild);
      tail = onlyChild;
    }
  }
  const tail = chain[chain.length - 1]!;
  if (chain.length === 1) return { node: first, childOffset: 0, paths: [first.path] };
  return {
    node: { ...tail, name: chain.map((part) => part.name).join("/"), depth: first.depth },
    childOffset: tail.depth - first.depth,
    paths: chain.map((part) => part.path),
  };
}

export function flattenWorkspaceFileTreeRows(params: TreeInput): WorkspaceFileTreeRow[] {
  const result: WorkspaceFileTreeRow[] = [];
  const stack = [
    { children: params.childrenByDirectory.get(params.rootPath) ?? [], cursor: 0, offset: 0 },
  ];
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;
    if (frame.cursor >= frame.children.length) {
      stack.pop();
      continue;
    }
    const original = frame.children[frame.cursor++]!;
    const representation = representNode(
      { ...original, depth: original.depth - frame.offset },
      params,
    );
    const node = representation.node;
    const expanded = representation.paths.some((path) => params.expandedPaths.has(path));
    result.push({
      ...node,
      expanded,
      loaded: params.loadedDirectoryPaths.has(node.path),
      loading: params.loadingDirectoryPaths.has(node.path),
      error: params.errorByDirectory.get(node.path) ?? null,
      ...(representation.paths.length > 1 ? { compactedPaths: representation.paths } : {}),
    });
    if (node.type === "directory" && expanded) {
      stack.push({
        children: params.childrenByDirectory.get(node.path) ?? [],
        cursor: 0,
        offset: frame.offset + representation.childOffset,
      });
    }
  }
  return result;
}

export function filterWorkspaceFileTreeRows(params: {
  rows: WorkspaceFileTreeRow[];
  searchQuery: string;
  changedOnly: boolean;
  statusByPath: ReadonlyMap<string, WorkspaceFileGitStatus>;
}): WorkspaceFileTreeRow[] {
  const eligible = params.changedOnly
    ? params.rows.filter((row) => {
        const direct = getWorkspaceFileGitStatus(params.statusByPath, row.path);
        return (
          (direct !== null && direct !== "ignored") ||
          (row.type === "directory" &&
            getWorkspaceDirectoryGitStatuses(params.statusByPath, row.path).length > 0)
        );
      })
    : params.rows;
  const query = params.searchQuery.trim().toLocaleLowerCase();
  if (query.length === 0) return eligible;
  const matches = eligible.filter((row) => row.name.toLocaleLowerCase().includes(query));
  const keep = new Set(matches.map((row) => row.path));
  for (const match of matches) {
    for (const row of eligible) {
      if (row.type === "directory" && isWorkspaceFilePathInside(row.path, match.path))
        keep.add(row.path);
      if (match.type === "directory" && isWorkspaceFilePathInside(match.path, row.path))
        keep.add(row.path);
    }
  }
  return eligible.filter((row) => keep.has(row.path));
}
