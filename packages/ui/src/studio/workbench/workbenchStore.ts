import { create } from "zustand";
import { leafPaneIds, type PaneWorkspaceScope, type SplitDirection } from "@/v4/paneLayoutTree.js";
import {
  decodeWorkbench,
  emptyWorkbench,
  layoutWorkbench,
  normalizeWorkbenchZoom,
  type TaskWorkbenchState,
  type WorkbenchTile,
} from "./workbenchModel.js";
import {
  autoSplitWorkbench,
  unsentWorkbenchInput,
  placeWorkbenchTile,
  untouchedWorkbenchTile,
  workbenchPaneFor,
} from "./workbenchPlacement.js";
import { useWorkbenchPreview } from "./workbenchPreviewStore.js";
import { forgetWorkbenchConnection, resetWorkbenchConnection } from "./workbenchConnection.js";

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
  /** 「添加对话」：按顺序放入空位，返回实际放入数量；已在工作台的只计为已放入。 */
  addMany(tiles: WorkbenchTile[]): number;
  show(tile: WorkbenchTile): boolean;
  /** 顶栏「新建任务」：复用待命格、自动选位；满八格时不换下任何格子，返回 false。 */
  create(): boolean;
  /** 「在此格新建任务」：原格移出工作台（会话仍在内核记录中），原位换成同内核同项目的待命格。 */
  renew(pane: string, expectedId: string): boolean;
  zoom(value: number): void;
}
/** 新待命格沿用参照格的内核与项目，不带会话与草稿。 */
function freshTile(base: WorkbenchTile): WorkbenchTile {
  return {
    id: crypto.randomUUID(),
    scope: base.scope,
    kernel: base.kernel,
    sessionId: null,
    opened: false,
    configured: false,
  };
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
      // 重新打开直接恢复上次布局（specs/knorvia-workbench-conversations-20261010.md）：
      // 各格首次渲染时由当前窗口 Host 认领，并按内核、工作区身份与会话 ID 核对真实索引，
      // 不再要求用户逐格重新加入。
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
        resetWorkbenchConnection(old.id);
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
      const board = get().board;
      const tile = board?.tiles[pane];
      if (!board || !tile) return;
      // 移出工作台只删视图引用，不停止任务、不删除会话；预览随格子释放。
      useWorkbenchPreview.getState().clear(tile.id);
      forgetWorkbenchConnection(tile.id);
      if (pane !== "workspace-main")
        return save(layoutWorkbench(board, { kind: "close", paneId: pane }));
      const other = leafPaneIds(board.layout.root).find((id) => id !== pane);
      if (!other)
        return save({ ...emptyWorkbench(tile.scope, crypto.randomUUID()), zoom: board.zoom });
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
      const placed = workbenchPaneFor(next, tile);
      if (placed) forgetWorkbenchConnection(next.tiles[placed]!.id);
      save(next);
      return true;
    },
    collect(tiles) {
      let board = get().board;
      if (!board) return;
      for (const tile of tiles) board = placeWorkbenchTile(board, tile) ?? board;
      save({ ...board, maximized: null });
    },
    addMany(tiles) {
      let board = get().board;
      if (!board) return 0;
      let placed = 0;
      for (const tile of tiles) {
        const next = placeWorkbenchTile(board, tile);
        if (!next) break;
        board = next;
        const pane = workbenchPaneFor(board, tile);
        // 用户从当前 Host 列表显式挑选，视为已核对。
        if (pane) forgetWorkbenchConnection(board.tiles[pane]!.id);
        placed++;
      }
      save({ ...board, maximized: null });
      return placed;
    },
    create() {
      const board = get().board;
      if (!board) return false;
      const ready = Object.entries(board.tiles).find(([, tile]) =>
        untouchedWorkbenchTile(tile),
      )?.[0];
      if (ready) {
        save({ ...layoutWorkbench(board, { kind: "focus", paneId: ready }), maximized: null });
        return true;
      }
      const pane = board.layout.focusedPaneId;
      const base = board.tiles[pane] ?? Object.values(board.tiles)[0]!;
      const next = autoSplitWorkbench({ ...board, maximized: null }, freshTile(base));
      if (!next) return false;
      save(next);
      return true;
    },
    renew(pane, expectedId) {
      const board = get().board,
        old = board?.tiles[pane];
      if (!board || !old || old.id !== expectedId) return false;
      if (untouchedWorkbenchTile(old)) return true;
      useWorkbenchPreview.getState().clear(old.id);
      forgetWorkbenchConnection(old.id);
      const tile = freshTile(old);
      save({
        ...board,
        tiles: { ...board.tiles, [pane]: tile },
        maximized: null,
      });
      return true;
    },
    zoom(value) {
      const board = get().board;
      if (board) save({ ...board, zoom: normalizeWorkbenchZoom(value) });
    },
    show(tile) {
      const board = get().board;
      if (!board) return false;
      const existing = workbenchPaneFor(board, tile);
      if (existing) {
        save({ ...board, maximized: existing });
        return true;
      }
      const focused = board.tiles[board.layout.focusedPaneId];
      // 满格时换下聚焦格；它若有未发送输入则拒绝，避免工作台专用草稿随格子丢失。
      const next =
        placeWorkbenchTile(board, tile) ??
        (focused && unsentWorkbenchInput(focused)
          ? null
          : placeWorkbenchTile(board, tile, board.layout.focusedPaneId));
      if (!next) return false;
      save(next);
      return true;
    },
  };
});
