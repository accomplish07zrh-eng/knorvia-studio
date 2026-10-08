import { leafPaneIds } from "@/v4/paneLayoutTree.js";
import { layoutWorkbench, type TaskWorkbenchState, type WorkbenchTile } from "./workbenchModel.js";

export function sameWorkbenchTarget(a: WorkbenchTile, b: WorkbenchTile): boolean {
  return a.sessionId !== null && workbenchTargetKey(a) === workbenchTargetKey(b);
}
export function workbenchTargetKey(tile: WorkbenchTile): string | null {
  return tile.sessionId === null
    ? null
    : JSON.stringify([
        tile.kernel,
        tile.scope.workspaceIdentity?.trim() || tile.scope.workspacePath,
        tile.scope.workspacePath,
        tile.scope.remoteSessionId ?? null,
        tile.sessionId,
      ]);
}
export function workbenchPaneFor(
  board: TaskWorkbenchState,
  tile: WorkbenchTile,
): string | undefined {
  return Object.entries(board.tiles).find(
    ([, value]) => value.id === tile.id || sameWorkbenchTarget(value, tile),
  )?.[0];
}
export function untouchedWorkbenchTile(tile: WorkbenchTile): boolean {
  return !tile.opened && !tile.configured && tile.sessionId === null;
}
/** 汇总只填余位；显式指定位置时才换出已有格，始终保留草稿引用与布局比例。 */
export function placeWorkbenchTile(
  board: TaskWorkbenchState,
  incoming: WorkbenchTile,
  replacePane?: string,
): TaskWorkbenchState | null {
  if (workbenchPaneFor(board, incoming)) return board;
  const stored = board.shelved.find(
    (tile) => tile.id === incoming.id || sameWorkbenchTarget(tile, incoming),
  );
  const tile = stored ?? incoming;
  const shelved = board.shelved.filter((value) => value !== stored);
  const pane =
    replacePane ??
    Object.entries(board.tiles).find(([, value]) => untouchedWorkbenchTile(value))?.[0];
  if (pane) {
    const old = board.tiles[pane];
    if (!old) return null;
    if (!untouchedWorkbenchTile(old)) {
      if (shelved.length >= 64) return null;
      shelved.push(old);
    }
    return {
      ...board,
      shelved,
      tiles: { ...board.tiles, [pane]: tile },
      maximized: null,
      layout: {
        ...board.layout,
        panes: {
          ...board.layout.panes,
          [pane]: { workspaceScope: tile.scope, sessionId: tile.sessionId },
        },
      },
    };
  }
  if (leafPaneIds(board.layout.root).length >= 4) return null;
  return layoutWorkbench(
    { ...board, shelved, maximized: null },
    {
      kind: "split",
      anchor: board.layout.focusedPaneId,
      direction: "row",
      before: false,
      binding: { workspaceScope: tile.scope, sessionId: tile.sessionId },
    },
    tile,
  );
}
