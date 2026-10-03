// SPDX-License-Identifier: Apache-2.0
// Source-exposed projection adapter; source review and verification pending.
import { useMemo } from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import type { WorkspaceFileTreeRow } from "./model.js";
import {
  indexWorkspaceStickyDirectories,
  projectWorkspaceStickyFolders,
} from "./stickyFolderProjection.js";

export function useWorkspaceFileTreeStickyFolders({
  rows,
  virtualItems,
  scrollDirection,
  scrollOffset,
  enabled,
}: {
  rows: WorkspaceFileTreeRow[];
  virtualItems: VirtualItem[];
  scrollDirection: "forward" | "backward" | null;
  scrollOffset: number;
  enabled: boolean;
}) {
  const directories = useMemo(() => indexWorkspaceStickyDirectories(rows), [rows]);
  // The visual overlay leaves the virtual rows and native scroll position in place.
  return useMemo(
    () =>
      projectWorkspaceStickyFolders({
        rows,
        directories,
        virtualItemCount: virtualItems.length,
        scrollOffset,
        enabled,
      }),
    [directories, enabled, rows, scrollDirection, scrollOffset, virtualItems],
  );
}
