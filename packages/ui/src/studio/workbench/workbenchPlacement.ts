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
/**
 * 已打开输入但尚未被 Host 受理（原生无会话 ID，外部内核只有草稿 ID）；
 * 首次受理后 `existing` 才置位，因此以它为准。
 */
export function unsentWorkbenchInput(tile: WorkbenchTile): boolean {
  return tile.opened && !tile.existing;
}
export function untouchedWorkbenchTile(tile: WorkbenchTile): boolean {
  return !tile.opened && !tile.configured && tile.sessionId === null;
}
/**
 * 汇总只填余位；显式指定位置时才换下已有格，布局比例不变。
 * 被换下的格子只离开工作台，会话仍在原内核记录中（specs/knorvia-workbench-conversations-20261010.md）。
 */
export function placeWorkbenchTile(
  board: TaskWorkbenchState,
  tile: WorkbenchTile,
  replacePane?: string,
): TaskWorkbenchState | null {
  if (workbenchPaneFor(board, tile)) return board;
  const pane =
    replacePane ??
    Object.entries(board.tiles).find(([, value]) => untouchedWorkbenchTile(value))?.[0];
  if (pane) {
    if (!board.tiles[pane]) return null;
    return {
      ...board,
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
  return autoSplitWorkbench({ ...board, maximized: null }, tile);
}
