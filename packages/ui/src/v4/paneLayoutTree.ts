export const V4_PRIMARY_PANE_ID = "workspace-main";
export const MAX_WORKBENCH_PANES = 4;
const DEFAULT_SPLIT_RATIO = 0.5;

export interface PaneWorkspaceScope {
  readonly workspacePath: string;
  readonly workspaceIdentity?: string;
  readonly remoteSessionId?: string;
}
export interface PaneBinding {
  readonly workspaceScope: PaneWorkspaceScope;
  readonly sessionId: string | null;
  readonly readOnly?: boolean;
  readonly restoredUnvalidated?: boolean;
}
export type SplitDirection = "row" | "column";
export type PaneSplitSide = "left" | "right" | "up" | "down";
export type PaneLayoutNode =
  | { readonly type: "leaf"; readonly paneId: string }
  | {
      readonly type: "split";
      readonly id: string;
      readonly direction: SplitDirection;
      readonly ratio: number;
      readonly first: PaneLayoutNode;
      readonly second: PaneLayoutNode;
    };
export interface PaneLayoutSnapshot {
  readonly root: PaneLayoutNode;
  readonly panes: Readonly<Record<string, PaneBinding>>;
  readonly focusedPaneId: string;
}
export interface WorkbenchSessionBinding {
  readonly workspaceScope: PaneWorkspaceScope;
  readonly sessionId: string;
  readonly readOnly?: boolean;
  readonly restoredUnvalidated?: boolean;
}
export interface WorkbenchGroup {
  readonly id: string;
  readonly primaryBinding: WorkbenchSessionBinding;
  readonly root: PaneLayoutNode;
  readonly panes: Readonly<Record<string, WorkbenchSessionBinding>>;
  readonly focusedPaneId: string;
  readonly updatedAt: number;
}
export interface WorkbenchGroupSnapshot {
  readonly activeGroupId: string | null;
  readonly groups: Readonly<Record<string, WorkbenchGroup>>;
  readonly sessionIndex: Readonly<Record<string, string>>;
}

export const PRIMARY_LEAF: PaneLayoutNode = { type: "leaf", paneId: V4_PRIMARY_PANE_ID };
export const INITIAL_PANE_LAYOUT: PaneLayoutSnapshot = {
  root: PRIMARY_LEAF,
  panes: {},
  focusedPaneId: V4_PRIMARY_PANE_ID,
};

export function clampSplitRatio(ratio: number): number {
  return Number.isFinite(ratio) ? Math.min(0.75, Math.max(0.25, ratio)) : DEFAULT_SPLIT_RATIO;
}
export function paneWorkspaceKey(scope: PaneWorkspaceScope): string {
  return scope.workspaceIdentity?.trim() || scope.workspacePath;
}
export function paneBindingMatchesSession(
  binding: PaneBinding | null | undefined,
  scope: PaneWorkspaceScope,
  sessionId: string,
): boolean {
  return Boolean(
    binding?.sessionId === sessionId &&
    paneWorkspaceKey(binding.workspaceScope) === paneWorkspaceKey(scope),
  );
}

function* nodes(root: PaneLayoutNode): Generator<PaneLayoutNode> {
  const stack: Array<() => PaneLayoutNode> = [() => root];
  while (stack.length) {
    const node = stack.pop()!();
    yield node;
    if (node.type === "split") {
      stack.push(
        () => node.second,
        () => node.first,
      );
    }
  }
}
export function leafPaneIds(root: PaneLayoutNode): string[] {
  const ids: string[] = [];
  for (const node of nodes(root)) if (node.type === "leaf") ids.push(node.paneId);
  return ids;
}
export function countPanes(state: PaneLayoutSnapshot): number {
  return leafPaneIds(state.root).length;
}
export function canAddPane(state: PaneLayoutSnapshot): boolean {
  return countPanes(state) < MAX_WORKBENCH_PANES;
}
function contains(root: PaneLayoutNode, paneId: string): boolean {
  for (const node of nodes(root)) {
    if (node.type === "leaf" && node.paneId === paneId) return true;
  }
  return false;
}
export function effectiveFocusedPaneId(state: PaneLayoutSnapshot): string {
  return contains(state.root, state.focusedPaneId) ? state.focusedPaneId : V4_PRIMARY_PANE_ID;
}

type TreeFrame = { node: PaneLayoutNode; phase: 0 | 1 | 2; first?: PaneLayoutNode };
type TreeEdit = (node: PaneLayoutNode) => PaneLayoutNode | null | undefined;

// continuation 保存已完成的 first；塌缩立即返回原 sibling，不扫描被裁掉的分支。
function editTree(root: PaneLayoutNode, edit: TreeEdit): PaneLayoutNode | null {
  const frames: TreeFrame[] = [{ node: root, phase: 0 }];
  let result: PaneLayoutNode | null = root;
  while (frames.length) {
    const frame = frames[frames.length - 1]!;
    const node = frame.node;
    if (frame.phase === 0) {
      const replacement = edit(node);
      if (replacement !== undefined || node.type === "leaf") {
        result = replacement === undefined ? node : replacement;
        frames.pop();
      } else {
        frame.phase = 1;
        frames.push({ node: node.first, phase: 0 });
      }
    } else if (node.type === "split" && frame.phase === 1) {
      if (result === null) {
        result = node.second;
        frames.pop();
      } else {
        frame.first = result;
        frame.phase = 2;
        frames.push({ node: node.second, phase: 0 });
      }
    } else if (node.type === "split") {
      result =
        result === null
          ? node.first
          : frame.first === node.first && result === node.second
            ? node
            : { ...node, first: frame.first!, second: result };
      frames.pop();
    }
  }
  return result;
}

function nextIds(root: PaneLayoutNode): { pane: string; split: string } {
  let pane = 0;
  let split = 0;
  for (const node of nodes(root)) {
    const match =
      node.type === "leaf" ? /^pane-(\d+)$/.exec(node.paneId) : /^n(\d+)$/.exec(node.id);
    if (!match) continue;
    if (node.type === "leaf") pane = Math.max(pane, Number(match[1]));
    else split = Math.max(split, Number(match[1]));
  }
  return { pane: `pane-${pane + 1}`, split: `n${split + 1}` };
}

export type PaneLayoutCommand =
  | {
      kind: "split";
      anchor: string;
      direction: SplitDirection;
      before: boolean;
      binding: PaneBinding;
      /** 显式容量（工作台为 8）；缺省沿用常规分屏的 MAX_WORKBENCH_PANES。 */
      limit?: number;
    }
  | { kind: "close" | "focus" | "confirm"; paneId: string }
  | { kind: "bind"; paneId: string; sessionId: string }
  | { kind: "replace"; paneId: string; binding: PaneBinding }
  | { kind: "ratio"; splitId: string; ratio: number };

// 唯一纯转移入口；返回原引用表示没有业务变化，Zustand action 不另持有布局。
export function applyPaneLayoutCommand(
  state: PaneLayoutSnapshot,
  command: PaneLayoutCommand,
): PaneLayoutSnapshot {
  switch (command.kind) {
    case "split": {
      if (
        !contains(state.root, command.anchor) ||
        countPanes(state) >= (command.limit ?? MAX_WORKBENCH_PANES)
      )
        return state;
      const ids = nextIds(state.root);
      const oldLeaf: PaneLayoutNode = { type: "leaf", paneId: command.anchor };
      const added: PaneLayoutNode = { type: "leaf", paneId: ids.pane };
      const split: PaneLayoutNode = {
        type: "split",
        id: ids.split,
        direction: command.direction,
        ratio: DEFAULT_SPLIT_RATIO,
        first: command.before ? added : oldLeaf,
        second: command.before ? oldLeaf : added,
      };
      const root = editTree(state.root, (node) =>
        node.type === "leaf" && node.paneId === command.anchor ? split : undefined,
      )!;
      return {
        root,
        panes: { ...state.panes, [ids.pane]: command.binding },
        focusedPaneId: ids.pane,
      };
    }
    case "close": {
      if (command.paneId === V4_PRIMARY_PANE_ID || !contains(state.root, command.paneId))
        return state;
      const root =
        editTree(state.root, (node) =>
          node.type === "leaf" && node.paneId === command.paneId ? null : undefined,
        ) ?? PRIMARY_LEAF;
      const panes = { ...state.panes };
      delete panes[command.paneId];
      return {
        root,
        panes,
        focusedPaneId:
          state.focusedPaneId === command.paneId ? V4_PRIMARY_PANE_ID : state.focusedPaneId,
      };
    }
    case "focus":
      return state.focusedPaneId === command.paneId || !contains(state.root, command.paneId)
        ? state
        : { ...state, focusedPaneId: command.paneId };
    case "ratio": {
      const ratio = clampSplitRatio(command.ratio);
      const root = editTree(state.root, (node) =>
        node.type === "split" && node.id === command.splitId
          ? node.ratio === ratio
            ? node
            : { ...node, ratio }
          : undefined,
      )!;
      return root === state.root ? state : { ...state, root };
    }
    case "replace":
      if (command.paneId === V4_PRIMARY_PANE_ID || !state.panes[command.paneId]) return state;
      return {
        ...state,
        panes: { ...state.panes, [command.paneId]: command.binding },
        focusedPaneId: command.paneId,
      };
    case "bind":
    case "confirm": {
      const binding = state.panes[command.paneId];
      if (!binding) return state;
      // 聚合 kind 的联合成员不能靠排除 confirm 收窄；只有 bind 契约携带 sessionId。
      if (
        command.kind === "bind"
          ? binding.sessionId === command.sessionId && !binding.restoredUnvalidated
          : !binding.restoredUnvalidated
      )
        return state;
      const sessionId = command.kind === "bind" ? command.sessionId : binding.sessionId;
      return {
        ...state,
        panes: {
          ...state.panes,
          [command.paneId]: { workspaceScope: binding.workspaceScope, sessionId },
        },
      };
    }
  }
}

export function splitPaneAt(
  state: PaneLayoutSnapshot,
  anchorPaneId: string,
  direction: SplitDirection,
  binding: PaneBinding,
): PaneLayoutSnapshot {
  return applyPaneLayoutCommand(state, {
    kind: "split",
    anchor: anchorPaneId,
    direction,
    before: false,
    binding,
  });
}
export function splitPaneAtSide(
  state: PaneLayoutSnapshot,
  anchorPaneId: string,
  side: PaneSplitSide,
  binding: PaneBinding,
): PaneLayoutSnapshot {
  return applyPaneLayoutCommand(state, {
    kind: "split",
    anchor: anchorPaneId,
    binding,
    direction: side === "left" || side === "right" ? "row" : "column",
    before: side === "left" || side === "up",
  });
}
export function closePane(state: PaneLayoutSnapshot, paneId: string): PaneLayoutSnapshot {
  return applyPaneLayoutCommand(state, { kind: "close", paneId });
}
export function focusPane(state: PaneLayoutSnapshot, paneId: string): PaneLayoutSnapshot {
  return applyPaneLayoutCommand(state, { kind: "focus", paneId });
}
export function bindPaneSession(
  state: PaneLayoutSnapshot,
  paneId: string,
  sessionId: string,
): PaneLayoutSnapshot {
  return applyPaneLayoutCommand(state, { kind: "bind", paneId, sessionId });
}
export function confirmRestoredPaneSession(
  state: PaneLayoutSnapshot,
  paneId: string,
): PaneLayoutSnapshot {
  return applyPaneLayoutCommand(state, { kind: "confirm", paneId });
}
export function replacePaneBinding(
  state: PaneLayoutSnapshot,
  paneId: string,
  binding: PaneBinding,
): PaneLayoutSnapshot {
  return applyPaneLayoutCommand(state, { kind: "replace", paneId, binding });
}
export function setSplitNodeRatio(
  state: PaneLayoutSnapshot,
  splitId: string,
  ratio: number,
): PaneLayoutSnapshot {
  return applyPaneLayoutCommand(state, { kind: "ratio", splitId, ratio });
}
export function findPaneIdForSession(
  state: PaneLayoutSnapshot,
  scope: PaneWorkspaceScope,
  sessionId: string,
): string | null {
  for (const [id, binding] of Object.entries(state.panes)) {
    if (paneBindingMatchesSession(binding, scope, sessionId)) return id;
  }
  return null;
}
export function openSessionInNewPane(
  state: PaneLayoutSnapshot,
  scope: PaneWorkspaceScope,
  sessionId: string,
): PaneLayoutSnapshot {
  const key = paneWorkspaceKey(scope);
  for (const [id, binding] of Object.entries(state.panes)) {
    if (binding.sessionId === sessionId && paneWorkspaceKey(binding.workspaceScope) === key)
      return focusPane(state, id);
  }
  return splitPaneAt(state, effectiveFocusedPaneId(state), "row", {
    workspaceScope: scope,
    sessionId,
  });
}
