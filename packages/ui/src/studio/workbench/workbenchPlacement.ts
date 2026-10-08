import type { SplitDirection } from "@/v4/paneLayoutTree.js";
import {
  layoutWorkbench,
  workbenchLeafRects,
  type TaskWorkbenchState,
  type WorkbenchTile,
} from "./workbenchModel.js";

// 自动选位按 16:9 画布估算格子长边（specs/knorvia-workbench-usability-20261008.md）。
const CANVAS_ASPECT = 16 / 9;
/**
 * 在两行四列约束内选最大的格子分割：同面积优先沿长边，再优先聚焦格。
 * 返回新布局（新格聚焦）；没有合法位置时返回 null。
 */
export function autoSplitWorkbench(
  board: TaskWorkbenchState,
  tile: WorkbenchTile,
): TaskWorkbenchState | null {
  const focused = board.layout.focusedPaneId;
  let best: { state: TaskWorkbenchState; score: number[] } | null = null;
  for (const leaf of workbenchLeafRects(board.layout.root)) {
    const longer: SplitDirection = leaf.width * CANVAS_ASPECT >= leaf.height ? "row" : "column";
    for (const direction of ["row", "column"] as const) {
      const state = layoutWorkbench(
        board,
        {
          kind: "split",
          anchor: leaf.paneId,
          direction,
          before: false,
          binding: { workspaceScope: tile.scope, sessionId: tile.sessionId },
        },
        tile,
      );
      if (state === board) continue;
      const score = [
        Math.round(leaf.width * leaf.height * 1000),
        direction === longer ? 1 : 0,
        leaf.paneId === focused ? 1 : 0,
      ];
      if (!best || compareScore(score, best.score) > 0) best = { state, score };
    }
  }
  return best?.state ?? null;
}
function compareScore(a: number[], b: number[]): number {
  for (let index = 0; index < a.length; index += 1)
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  return 0;
}
/** 能否按指定方向分割该格且仍满足两行四列。 */
export function canSplitWorkbenchPane(
  board: TaskWorkbenchState,
  pane: string,
  direction: SplitDirection,
): boolean {
  const tile = board.tiles[pane];
  if (!tile) return false;
  return (
    layoutWorkbench(
      board,
      {
        kind: "split",
        anchor: pane,
        direction,
        before: false,
        binding: { workspaceScope: tile.scope, sessionId: null },
      },
      tile,
    ) !== board
  );
}

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
  return autoSplitWorkbench({ ...board, shelved, maximized: null }, tile);
}
