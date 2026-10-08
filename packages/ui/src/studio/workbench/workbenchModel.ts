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

export interface WorkbenchTile {
  id: string;
  kernel: StudioKernelId;
  scope: PaneWorkspaceScope;
  sessionId: string | null;
  opened: boolean;
  existing?: boolean;
}
export interface TaskWorkbenchState {
  layout: PaneLayoutSnapshot;
  tiles: Record<string, WorkbenchTile>;
  maximized: string | null;
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
  const layout = applyPaneLayoutCommand(state.layout, command);
  if (layout === state.layout) return state;
  const tiles: Record<string, WorkbenchTile> = {};
  for (const id of leafPaneIds(layout.root)) {
    const value = state.tiles[id] ?? tile;
    if (!value) return state;
    tiles[id] = value;
  }
  return {
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
  if (!node || depth > 3) return;
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
  if (raw.length > 65536) return;
  try {
    const value = object(JSON.parse(raw));
    const layout = object(value?.layout),
      source = object(value?.tiles);
    if (value?.version !== 1 || !layout || !source) return;
    const ids = new Set<string>();
    const root = tree(layout.root, ids, new Set());
    if (!root || ids.size > 4 || !ids.has("workspace-main")) return;
    const tiles: Record<string, WorkbenchTile> = {},
      panes: Record<string, { workspaceScope: PaneWorkspaceScope; sessionId: string | null }> = {};
    const tileIds = new Set<string>();
    for (const id of ids) {
      const tile = object(source[id]),
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
      tiles[id] = {
        id: tile.id,
        scope: workspaceScope,
        kernel: tile.kernel,
        sessionId: tile.sessionId as string | null,
        opened: tile.opened === true && (tile.kernel !== "knorvia" || tile.sessionId !== null),
        existing: tile.existing === true,
      };
      panes[id] = { workspaceScope, sessionId: tiles[id]!.sessionId };
      tileIds.add(tile.id);
    }
    return {
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
