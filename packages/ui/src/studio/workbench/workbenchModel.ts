import {
  applyPaneLayoutCommand,
  clampSplitRatio,
  INITIAL_PANE_LAYOUT,
  leafPaneIds,
  type PaneLayoutCommand,
  type PaneLayoutNode,
  type PaneLayoutSnapshot,
  type PaneWorkspaceScope,
} from "@/v4/paneLayoutTree.js";
import { isStudioKernelId, type StudioKernelId } from "../types.js";

/** 每格视图（specs/knorvia-workbench-artifact-preview-20261008.md）；缺省为聊天＋预览。 */
export const WORKBENCH_TILE_VIEWS = ["split", "chat", "preview"] as const;
export type WorkbenchTileView = (typeof WORKBENCH_TILE_VIEWS)[number];
export function workbenchTileView(tile: Pick<WorkbenchTile, "view">): WorkbenchTileView {
  return tile.view ?? "split";
}
export interface WorkbenchTile {
  id: string;
  kernel: StudioKernelId;
  scope: PaneWorkspaceScope;
  sessionId: string | null;
  opened: boolean;
  existing?: boolean;
  configured?: boolean;
  view?: WorkbenchTileView;
}
export interface TaskWorkbenchState {
  layout: PaneLayoutSnapshot;
  tiles: Record<string, WorkbenchTile>;
  maximized: string | null;
  /** 画布缩放（specs/knorvia-workbench-usability-20261008.md）；缺省 1。 */
  zoom?: number;
}
/** 最多上下两行、每行四格（specs/knorvia-workbench-usability-20261008.md）。 */
export const WORKBENCH_TILE_LIMIT = 8;
const MAX_ROWS = 2,
  MAX_COLUMNS = 4;
export const WORKBENCH_ZOOM = { min: 0.5, max: 1.5, step: 0.1 } as const;
export function normalizeWorkbenchZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  const clamped = Math.min(WORKBENCH_ZOOM.max, Math.max(WORKBENCH_ZOOM.min, value));
  return Math.round(clamped * 10) / 10;
}
/** 叶子 1×1；左右分割列相加、行取大；上下分割行相加、列取大。 */
export function workbenchGrid(node: PaneLayoutNode): { rows: number; columns: number } {
  if (node.type === "leaf") return { rows: 1, columns: 1 };
  const a = workbenchGrid(node.first),
    b = workbenchGrid(node.second);
  return node.direction === "row"
    ? { rows: Math.max(a.rows, b.rows), columns: a.columns + b.columns }
    : { rows: a.rows + b.rows, columns: Math.max(a.columns, b.columns) };
}
export function fitsWorkbenchGrid(root: PaneLayoutNode): boolean {
  const grid = workbenchGrid(root);
  return (
    grid.rows <= MAX_ROWS &&
    grid.columns <= MAX_COLUMNS &&
    leafPaneIds(root).length <= WORKBENCH_TILE_LIMIT
  );
}
/** 各叶子在画布中的数值占比，用于自动选位；不读取 DOM。 */
export function workbenchLeafRects(
  node: PaneLayoutNode,
  rect = { width: 1, height: 1 },
  out: Array<{ paneId: string; width: number; height: number }> = [],
) {
  if (node.type === "leaf") {
    out.push({ paneId: node.paneId, width: rect.width, height: rect.height });
    return out;
  }
  const ratio = clampSplitRatio(node.ratio);
  if (node.direction === "row") {
    workbenchLeafRects(node.first, { ...rect, width: rect.width * ratio }, out);
    workbenchLeafRects(node.second, { ...rect, width: rect.width * (1 - ratio) }, out);
  } else {
    workbenchLeafRects(node.first, { ...rect, height: rect.height * ratio }, out);
    workbenchLeafRects(node.second, { ...rect, height: rect.height * (1 - ratio) }, out);
  }
  return out;
}
export function emptyWorkbench(scope: PaneWorkspaceScope, id: string): TaskWorkbenchState {
  return {
    layout: INITIAL_PANE_LAYOUT,
    tiles: {
      "workspace-main": {
        id,
        scope,
        kernel: "knorvia",
        sessionId: null,
        opened: false,
        configured: false,
      },
    },
    maximized: null,
  };
}
export function layoutWorkbench(
  state: TaskWorkbenchState,
  command: PaneLayoutCommand,
  tile?: WorkbenchTile,
): TaskWorkbenchState {
  const layout = applyPaneLayoutCommand(
    state.layout,
    command.kind === "split" ? { ...command, limit: WORKBENCH_TILE_LIMIT } : command,
  );
  if (layout === state.layout || !fitsWorkbenchGrid(layout.root)) return state;
  const tiles: Record<string, WorkbenchTile> = {};
  for (const id of leafPaneIds(layout.root)) {
    const value = state.tiles[id] ?? tile;
    if (!value) return state;
    tiles[id] = value;
  }
  return {
    ...state,
    layout,
    tiles,
    maximized: state.maximized && tiles[state.maximized] ? state.maximized : null,
  };
}
/** 拖动到最小占比时仍有完整输入区；小窗口通过滚动保持可操作尺寸。 */
export function workbenchMinimumSize(node: PaneLayoutNode): { width: number; height: number } {
  if (node.type === "leaf") return { width: 360, height: 300 };
  const a = workbenchMinimumSize(node.first),
    b = workbenchMinimumSize(node.second);
  const ratio = clampSplitRatio(node.ratio);
  return node.direction === "row"
    ? {
        width: Math.max(a.width / ratio, b.width / (1 - ratio)),
        height: Math.max(a.height, b.height),
      }
    : {
        width: Math.max(a.width, b.width),
        height: Math.max(a.height / ratio, b.height / (1 - ratio)),
      };
}
function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
const text = (value: unknown, limit = 4096): value is string =>
  typeof value === "string" && value.length <= limit && !value.includes("\0");
function tree(
  value: unknown,
  ids: Set<string>,
  splits: Set<string>,
  depth = 0,
): PaneLayoutNode | undefined {
  const node = object(value);
  // 两行四列约束下最深为 4 层分割；校验上限留 1 层余量，最终仍以 fitsWorkbenchGrid 为准。
  if (!node || depth > 5) return;
  if (
    node.type === "leaf" &&
    typeof node.paneId === "string" &&
    /^(workspace-main|pane-\d{1,5})$/.test(node.paneId) &&
    !ids.has(node.paneId)
  ) {
    ids.add(node.paneId);
    return { type: "leaf", paneId: node.paneId };
  }
  if (
    node.type !== "split" ||
    typeof node.id !== "string" ||
    !/^n\d{1,5}$/.test(node.id) ||
    splits.has(node.id) ||
    !["row", "column"].includes(String(node.direction))
  )
    return;
  splits.add(node.id);
  const first = tree(node.first, ids, splits, depth + 1),
    second = tree(node.second, ids, splits, depth + 1);
  if (!first || !second) return;
  return {
    type: "split",
    id: node.id,
    direction: node.direction as "row" | "column",
    ratio: clampSplitRatio(Number(node.ratio)),
    first,
    second,
  };
}
/** 只恢复有界布局和会话引用；Host 句柄、状态、批准和提示词从不持久化于此。 */
export function decodeWorkbench(raw: string): TaskWorkbenchState | undefined {
  if (raw.length > 1024 * 1024) return;
  try {
    const value = object(JSON.parse(raw));
    const layout = object(value?.layout),
      source = object(value?.tiles);
    if (value?.version !== 1 || !layout || !source) return;
    const ids = new Set<string>();
    const root = tree(layout.root, ids, new Set());
    if (
      !root ||
      ids.size > WORKBENCH_TILE_LIMIT ||
      !ids.has("workspace-main") ||
      !fitsWorkbenchGrid(root)
    )
      return;
    const tiles: Record<string, WorkbenchTile> = {},
      panes: Record<string, { workspaceScope: PaneWorkspaceScope; sessionId: string | null }> = {};
    const tileIds = new Set<string>();
    const readTile = (value: unknown): WorkbenchTile | undefined => {
      const tile = object(value),
        scope = object(tile?.scope);
      if (
        !tile ||
        !scope ||
        !text(tile.id, 100) ||
        !tile.id ||
        tileIds.has(tile.id) ||
        !text(scope.workspacePath) ||
        !isStudioKernelId(tile.kernel)
      )
        return;
      if (
        tile.sessionId !== null &&
        (!text(tile.sessionId, 180) ||
          !/^[\w:-]+$/.test(tile.sessionId) ||
          ["__proto__", "constructor", "prototype"].includes(tile.sessionId))
      )
        return;
      if (scope.workspaceIdentity !== undefined && !text(scope.workspaceIdentity)) return;
      if (scope.remoteSessionId !== undefined && !text(scope.remoteSessionId, 180)) return;
      const workspaceScope = {
        workspacePath: scope.workspacePath,
        workspaceIdentity: scope.workspaceIdentity as string | undefined,
        remoteSessionId: scope.remoteSessionId as string | undefined,
      };
      tileIds.add(tile.id);
      return {
        id: tile.id,
        scope: workspaceScope,
        kernel: tile.kernel,
        sessionId: tile.sessionId as string | null,
        opened: tile.opened === true,
        existing: tile.existing === true,
        // 旧布局没有记录是否改过待命配置；保守保留，不让汇总替换用户选择。
        configured: tile.configured !== false,
        // 未知视图值按默认处理，不让单个字段导致整套布局被拒绝。
        ...(tile.view === "chat" || tile.view === "preview" ? { view: tile.view } : {}),
      };
    };
    for (const id of ids) {
      const tile = readTile(source[id]);
      if (!tile) return;
      tiles[id] = tile;
      panes[id] = { workspaceScope: tile.scope, sessionId: tile.sessionId };
    }
    // 旧版「已收起」列表不再读取（specs/knorvia-workbench-conversations-20261010.md）：
    // 收起项只是视图引用，会话仍在各内核记录中，可从「添加对话」重新放回。
    return {
      zoom: normalizeWorkbenchZoom(value.zoom ?? 1),
      layout: {
        root,
        panes,
        focusedPaneId:
          typeof layout.focusedPaneId === "string" && ids.has(layout.focusedPaneId)
            ? layout.focusedPaneId
            : "workspace-main",
      },
      tiles,
      maximized:
        typeof value.maximized === "string" && ids.has(value.maximized) ? value.maximized : null,
    };
  } catch {
    return;
  }
}
