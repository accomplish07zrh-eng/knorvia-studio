import { create } from "zustand";
import { leafPaneIds, type PaneWorkspaceScope, type SplitDirection } from "@/v4/paneLayoutTree.js";
import {
  decodeWorkbench,
  emptyWorkbench,
  layoutWorkbench,
  type TaskWorkbenchState,
  type WorkbenchTile,
} from "./workbenchModel.js";
import {
  placeWorkbenchTile,
  untouchedWorkbenchTile,
  workbenchPaneFor,
} from "./workbenchPlacement.js";
import { forgetWorkbenchConnection } from "./workbenchConnection.js";

const key = "knorvia-task-workbench:v1";
interface Store {
  board: TaskWorkbenchState | null;
  storageError: boolean;
  initialize(scope: PaneWorkspaceScope): void;
  update(pane: string, patch: Partial<WorkbenchTile>, expectedId: string): void;
  split(pane: string, direction: SplitDirection): void;
  close(pane: string): void;
  ratio(splitId: string, ratio: number): void;
  maximize(pane: string): void;
  focus(pane: string): void;
  add(tile: WorkbenchTile): boolean;
  collect(tiles: WorkbenchTile[]): void;
  show(tile: WorkbenchTile): boolean;
}
export const useTaskWorkbench = create<Store>((set, get) => {
  const save = (board: TaskWorkbenchState) => {
    board = {
      ...board,
      layout: {
        ...board.layout,
        panes: Object.fromEntries(
          Object.entries(board.tiles).map(([pane, tile]) => [
            pane,
            { workspaceScope: tile.scope, sessionId: tile.sessionId },
          ]),
        ),
      },
    };
    let storageError = false;
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, ...board }));
    } catch {
      storageError = true;
    }
    set({ board, storageError });
  };
  return {
    board: null,
    storageError: false,
    initialize(scope) {
      if (get().board) return;
      let saved: TaskWorkbenchState | undefined;
      try {
        saved = decodeWorkbench(localStorage.getItem(key) ?? "");
      } catch {
        set({ storageError: true });
      }
      set({ board: saved ?? emptyWorkbench(scope, crypto.randomUUID()) });
    },
    update(pane, patch, expectedId) {
      const board = get().board,
        old = board?.tiles[pane];
      if (!board || !old || old.id !== expectedId) return;
      // 目录选择器返回太晚时不能把已打开的输入重绑；只有已确认的会话交接可换目标。
      if (old.opened && (patch.kernel || patch.scope) && !patch.existing) return;
      if (
        (patch.kernel && patch.kernel !== old.kernel) ||
        (patch.scope && patch.scope !== old.scope)
      )
        forgetWorkbenchConnection(old.id);
      save({ ...board, tiles: { ...board.tiles, [pane]: { ...old, ...patch, id: old.id } } });
    },
    split(pane, direction) {
      const board = get().board;
      if (!board) return;
      const scope = board.tiles[pane]!.scope;
      save(
        layoutWorkbench(
          board,
          {
            kind: "split",
            anchor: pane,
            direction,
            before: false,
            binding: { workspaceScope: scope, sessionId: null },
          },
          {
            id: crypto.randomUUID(),
            scope,
            kernel: board.tiles[pane]!.kernel,
            sessionId: null,
            opened: false,
            configured: false,
          },
        ),
      );
    },
    close(pane) {
      let board = get().board;
      const tile = board?.tiles[pane];
      if (!board || !tile) return;
      if (!untouchedWorkbenchTile(tile)) {
        if (board.shelved.length >= 64) return;
        board = { ...board, shelved: [...board.shelved, tile] };
      }
      if (pane !== "workspace-main")
        return save(layoutWorkbench(board, { kind: "close", paneId: pane }));
      const other = leafPaneIds(board.layout.root).find((id) => id !== pane);
      if (!other)
        return save({ ...emptyWorkbench(tile.scope, crypto.randomUUID()), shelved: board.shelved });
      const next = layoutWorkbench(board, { kind: "close", paneId: other });
      save({ ...next, tiles: { ...next.tiles, [pane]: board.tiles[other]! }, maximized: null });
    },
    ratio(splitId, ratio) {
      const board = get().board;
      if (board) save(layoutWorkbench(board, { kind: "ratio", splitId, ratio }));
    },
    maximize(pane) {
      const board = get().board;
      if (board) save({ ...board, maximized: board.maximized === pane ? null : pane });
    },
    focus(pane) {
      const board = get().board;
      if (board && board.layout.focusedPaneId !== pane)
        save(layoutWorkbench(board, { kind: "focus", paneId: pane }));
    },
    add(tile) {
      const board = get().board;
      if (!board) return false;
      const existing = workbenchPaneFor(board, tile);
      if (existing) {
        // 单聊的显式重新加入已核对当前 Host；自动汇总/收起恢复不清除连接归属。
        forgetWorkbenchConnection(board.tiles[existing]!.id);
        save({ ...board, maximized: existing });
        return true;
      }
      const next = placeWorkbenchTile(board, tile);
      if (!next) return false;
      save(next);
      return true;
    },
    collect(tiles) {
      let board = get().board;
      if (!board) return;
      for (const tile of tiles) board = placeWorkbenchTile(board, tile) ?? board;
      save({ ...board, maximized: null });
    },
    show(tile) {
      const board = get().board;
      if (!board) return false;
      const existing = workbenchPaneFor(board, tile);
      if (existing) {
        save({ ...board, maximized: existing });
        return true;
      }
      const next =
        placeWorkbenchTile(board, tile) ??
        placeWorkbenchTile(board, tile, board.layout.focusedPaneId);
      if (!next) return false;
      save(next);
      return true;
    },
  };
});
