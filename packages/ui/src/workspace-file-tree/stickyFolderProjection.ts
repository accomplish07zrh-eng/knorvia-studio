// SPDX-License-Identifier: Apache-2.0
// Contract-authored indexed projection; source review and verification pending.
import { WORKSPACE_FILE_TREE_VIRTUAL_ROW_HEIGHT_PX as ROW_HEIGHT } from "./constants.js";
import type { WorkspaceFileTreeRow } from "./model.js";
import type { WorkspaceFileTreeStickyFolderItem } from "./types.js";

export type StickyDirectoryIndex = ReadonlyMap<
  number,
  readonly WorkspaceFileTreeStickyFolderItem[]
>;

export function indexWorkspaceStickyDirectories(
  rows: WorkspaceFileTreeRow[],
): StickyDirectoryIndex {
  const byDepth = new Map<number, WorkspaceFileTreeStickyFolderItem[]>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || row.type !== "directory" || !row.expanded) continue;
    const depthItems = byDepth.get(row.depth);
    const item = { row, index };
    if (depthItems) depthItems.push(item);
    else byDepth.set(row.depth, [item]);
  }
  return byDepth;
}

function precedingDirectory(
  items: readonly WorkspaceFileTreeStickyFolderItem[] | undefined,
  boundary: number,
): WorkspaceFileTreeStickyFolderItem | undefined {
  if (!items) return undefined;
  let lower = 0,
    upper = items.length;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (items[middle]!.index <= boundary) lower = middle + 1;
    else upper = middle;
  }
  return items[lower - 1];
}

export function projectWorkspaceStickyFolders({
  rows,
  directories,
  virtualItemCount,
  scrollOffset,
  enabled,
}: {
  rows: WorkspaceFileTreeRow[];
  directories: StickyDirectoryIndex;
  virtualItemCount: number;
  scrollOffset: number;
  enabled: boolean;
}): WorkspaceFileTreeStickyFolderItem[] {
  if (!enabled || virtualItemCount === 0 || rows.length === 0 || scrollOffset <= 0.5) return [];
  let stack: WorkspaceFileTreeStickyFolderItem[] = [];
  for (let remaining = rows.length + 1; remaining > 0; remaining -= 1) {
    const probeOffset = scrollOffset + stack.length * ROW_HEIGHT;
    const probe = Math.min(rows.length - 1, Math.floor(probeOffset / ROW_HEIGHT));
    const row = rows[probe];
    if (!row) return [];
    const ownDirectory = row.type === "directory" && row.expanded;
    let depth = row.depth - (ownDirectory ? 0 : 1);
    let boundary = probe - (ownDirectory ? 0 : 1);
    const ancestors: WorkspaceFileTreeStickyFolderItem[] = [];
    while (depth >= 0 && boundary >= 0) {
      const item = precedingDirectory(directories.get(depth), boundary);
      if (!item) break;
      ancestors.push(item);
      depth = item.row.depth - 1;
      boundary = item.index - 1;
    }
    const next = ancestors
      .reverse()
      .filter(
        (item, offset) => item.index * ROW_HEIGHT <= scrollOffset + offset * ROW_HEIGHT + 0.5,
      );
    if (next.length === stack.length) return next;
    stack = next;
  }
  return stack;
}
