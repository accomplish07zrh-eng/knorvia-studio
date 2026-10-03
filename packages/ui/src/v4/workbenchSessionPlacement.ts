import { logger } from "@/logger.js";
import {
  canAddPane, effectiveFocusedPaneId, findPaneIdForSession, paneBindingMatchesSession,
  paneWorkspaceKey, usePaneLayoutStore, V4_PRIMARY_PANE_ID,
  type PaneSplitSide, type PaneWorkspaceScope,
} from "@/v4/paneLayoutStore.js";
import {
  buildWorkbenchSessionKey, selectWorkbenchGroupActiveBinding, useWorkbenchGroupStore,
  type WorkbenchSessionBinding,
} from "@/v4/workbenchGroupStore.js";

export interface WorkbenchSessionTarget extends PaneWorkspaceScope { readonly sessionId: string; }
interface WorkbenchSplitPlacementOptions {
  readonly mode: "context-menu" | "drag";
  readonly side: PaneSplitSide;
  readonly anchorPaneId?: string;
}
type Effect =
  | { kind: "open"; binding: WorkbenchSessionBinding }
  | { kind: "focus"; paneId: string }
  | { kind: "split-pane"; anchor: string; side: PaneSplitSide; binding: WorkbenchSessionBinding }
  | { kind: "split-group"; anchor: string; side: PaneSplitSide; binding: WorkbenchSessionBinding;
      primary?: WorkbenchSessionBinding; fresh?: boolean }
  | { kind: "promote"; primary: WorkbenchSessionBinding }
  | { kind: "reset" }
  | { kind: "log"; binding: WorkbenchSessionBinding };
type Placement = { allowed: boolean; result: boolean; focus: boolean; effects: Effect[] };
const blocked = (): Placement => ({ allowed: false, result: false, focus: false, effects: [] });
const plan = (effects: Effect[], focus = false, result = true): Placement => ({ allowed: true, effects, focus, result });

function bindingOf(target: WorkbenchSessionTarget): WorkbenchSessionBinding {
  const { sessionId, ...workspaceScope } = target;
  return { workspaceScope, sessionId };
}
function draftOwns(shell: WorkbenchSessionBinding | null): boolean {
  const layout = usePaneLayoutStore.getState();
  if (Object.keys(layout.panes).length === 0) return false;
  return !shell || Object.values(layout.panes).some((binding) =>
    paneBindingMatchesSession(binding, shell.workspaceScope, shell.sessionId));
}

// 先只读准入并生成有序 effects；菜单与 native drag 共用选择，执行阶段重新取得稳定 action ports。
function resolve(shell: WorkbenchSessionBinding | null, target: WorkbenchSessionTarget,
  options: WorkbenchSplitPlacementOptions): Placement {
  const groups = useWorkbenchGroupStore.getState();
  const layout = usePaneLayoutStore.getState();
  const group = groups.activeGroupId ? groups.groups[groups.activeGroupId] : undefined;
  const focused = group?.focusedPaneId ?? effectiveFocusedPaneId(layout);
  const pane = !group && focused !== V4_PRIMARY_PANE_ID ? layout.panes[focused] : undefined;
  const current = group ? selectWorkbenchGroupActiveBinding(group)
    : pane?.sessionId ? { workspaceScope: pane.workspaceScope, sessionId: pane.sessionId } : shell;
  const binding = bindingOf(target);
  const anchor = options.anchorPaneId ?? focused;
  const side = options.side;
  if (paneBindingMatchesSession(current, target, target.sessionId)) return blocked();
  if (groups.sessionIndex[buildWorkbenchSessionKey(target, target.sessionId)]) return plan([{ kind: "open", binding }], true);
  const existing = findPaneIdForSession(layout, target, target.sessionId);
  if (existing) return plan([{ kind: "focus", paneId: existing }, { kind: "open", binding }], true);
  if (!canAddPane(group ?? layout)) return blocked();
  if (group) return plan([{ kind: "split-group", anchor, side, binding }]);
  if (draftOwns(shell) || !shell) return plan([
    { kind: "split-pane", anchor, side, binding }, { kind: "log", binding },
  ], false, false);
  return Object.keys(layout.panes).length > 0
    ? plan([{ kind: "promote", primary: shell }, { kind: "reset" },
        { kind: "split-group", anchor, side, binding, fresh: true }])
    : plan([{ kind: "split-group", anchor: V4_PRIMARY_PANE_ID, side, binding, primary: shell }]);
}
function admitted(placement: Placement, mode: WorkbenchSplitPlacementOptions["mode"]): boolean {
  return placement.allowed && (mode === "context-menu" || !placement.focus);
}
export function canPlaceWorkbenchSessionInSplit(shell: WorkbenchSessionBinding | null,
  target: WorkbenchSessionTarget, options: WorkbenchSplitPlacementOptions): boolean {
  return admitted(resolve(shell, target, options), options.mode);
}
export function placeWorkbenchSessionInSplit(shell: WorkbenchSessionBinding | null,
  target: WorkbenchSessionTarget, options: WorkbenchSplitPlacementOptions): boolean {
  const placement = resolve(shell, target, options);
  if (!admitted(placement, options.mode)) return false;
  const groups = useWorkbenchGroupStore.getState();
  const layout = usePaneLayoutStore.getState();
  for (const effect of placement.effects) {
    switch (effect.kind) {
      case "open": groups.openSessionFromSidebar(effect.binding); break;
      case "focus": layout.focusPane(effect.paneId); break;
      case "split-pane": layout.splitPaneWithBinding(effect.anchor, effect.side,
        { workspaceScope: effect.binding.workspaceScope, sessionId: effect.binding.sessionId }); break;
      case "split-group": {
        const owner = effect.fresh ? useWorkbenchGroupStore.getState() : groups;
        if ("primary" in effect) owner.splitSessionIntoGroup(effect.anchor, effect.side, effect.binding, effect.primary);
        else owner.splitSessionIntoGroup(effect.anchor, effect.side, effect.binding);
        break;
      }
      case "promote": if (!groups.promotePaneLayoutToGroup(effect.primary, layout)) return false; break;
      case "reset": layout.resetToPrimaryPane(); break;
      case "log": logger.debug("[v4-workbench] session split beside primary draft", {
        sessionId: effect.binding.sessionId, workspaceKey: paneWorkspaceKey(effect.binding.workspaceScope),
      }); break;
    }
  }
  return placement.result;
}
export function selectWorkbenchSession(shell: WorkbenchSessionBinding | null, target: WorkbenchSessionTarget): void {
  const groups = useWorkbenchGroupStore.getState();
  const layout = usePaneLayoutStore.getState();
  const binding = bindingOf(target);
  if (!groups.activeGroupId && !groups.sessionIndex[buildWorkbenchSessionKey(target, target.sessionId)] && draftOwns(shell)) {
    const existing = findPaneIdForSession(layout, target, target.sessionId);
    const focused = existing ?? effectiveFocusedPaneId(layout);
    if (existing) layout.focusPane(existing);
    else if (focused !== V4_PRIMARY_PANE_ID && layout.panes[focused]) {
      const previousSessionId = layout.panes[focused]?.sessionId ?? null;
      // primary draft 仍由 shell 拥有；先替换 secondary 的完整 binding，再进入普通 session 选择。
      layout.replacePaneBinding(focused, { workspaceScope: binding.workspaceScope, sessionId: binding.sessionId });
      logger.debug("[v4-workbench] draft split focused pane replaced", { paneId: focused, previousSessionId,
        sessionId: binding.sessionId, workspaceKey: paneWorkspaceKey(binding.workspaceScope) });
    }
  }
  groups.openSessionFromSidebar(binding);
}
