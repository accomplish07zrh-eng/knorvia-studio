import { create } from "zustand";
import type { KnorviaTaskClientMode } from "@knorvia/shared";
import { persistWorkbenchGroups, readPersistedWorkbenchGroups } from "@/v4/paneLayoutPersistence.js";
import {
  canAddPane, closePane, countPanes, effectiveFocusedPaneId, focusPane, INITIAL_PANE_LAYOUT,
  leafPaneIds, paneWorkspaceKey, setSplitNodeRatio, splitPaneAtSide, V4_PRIMARY_PANE_ID,
  type PaneBinding, type PaneLayoutSnapshot, type PaneSplitSide, type PaneWorkspaceScope,
  type WorkbenchGroup, type WorkbenchGroupSnapshot, type WorkbenchSessionBinding,
} from "@/v4/paneLayoutTree.js";
export type { WorkbenchGroup, WorkbenchSessionBinding } from "@/v4/paneLayoutTree.js";

interface WorkbenchGroupStore extends WorkbenchGroupSnapshot {
  configureClientMode: (clientMode: KnorviaTaskClientMode) => void;
  openSessionFromSidebar: (binding: WorkbenchSessionBinding) => void;
  splitSessionIntoGroup: (anchorPaneId: string, side: PaneSplitSide, binding: WorkbenchSessionBinding,
    fallbackPrimaryBinding?: WorkbenchSessionBinding) => void;
  promotePaneLayoutToGroup: (primaryBinding: WorkbenchSessionBinding, layout: PaneLayoutSnapshot) => boolean;
  focusPane: (groupId: string, paneId: string) => void;
  closePane: (groupId: string, paneId: string) => void;
  confirmRestoredPaneSession: (groupId: string, paneId: string) => void;
  bindPaneSession: (groupId: string, paneId: string, sessionId: string) => void;
  setSplitRatio: (groupId: string, splitId: string, ratio: number) => void;
  isSessionGrouped: (scope: PaneWorkspaceScope, sessionId: string | null | undefined) => boolean;
  getActiveContext: () => WorkbenchSessionBinding | null;
  deactivateActiveGroup: () => void;
  resetWorkbenchGroups: () => void;
}
const INITIAL: WorkbenchGroupSnapshot = { activeGroupId: null, groups: {}, sessionIndex: {} };
const client: { mode: KnorviaTaskClientMode; hydrated: boolean; epoch: number } = {
  mode: "desktop-continuous", hydrated: false, epoch: 0,
};
const enabled = () => client.mode !== "web-remote-replayable";

export function buildWorkbenchSessionKey(scope: PaneWorkspaceScope, sessionId: string): string {
  return `${paneWorkspaceKey(scope)}::${sessionId}`;
}
function key(binding: WorkbenchSessionBinding): string {
  return buildWorkbenchSessionKey(binding.workspaceScope, binding.sessionId);
}
function bindings(group: WorkbenchGroup): WorkbenchSessionBinding[] {
  return [group.primaryBinding, ...Object.values(group.panes)];
}
function viewBinding(binding: PaneBinding): WorkbenchSessionBinding | null {
  return typeof binding.sessionId === "string" ? {
    workspaceScope: binding.workspaceScope, sessionId: binding.sessionId,
    ...(binding.readOnly ? { readOnly: true } : {}),
    ...(binding.restoredUnvalidated ? { restoredUnvalidated: true } : {}),
  } : null;
}
function incomingPane(binding: WorkbenchSessionBinding): PaneBinding {
  return { workspaceScope: binding.workspaceScope, sessionId: binding.sessionId,
    ...(binding.readOnly ? { readOnly: true } : {}),
    ...(binding.restoredUnvalidated ? { restoredUnvalidated: true } : {}) };
}
function paneBindings(panes: PaneLayoutSnapshot["panes"]): Record<string, WorkbenchSessionBinding> {
  const converted: Record<string, WorkbenchSessionBinding> = {};
  for (const [id, item] of Object.entries(panes)) {
    const binding = viewBinding(item);
    if (binding) converted[id] = binding;
  }
  return converted;
}
export function selectWorkbenchGroupPaneBinding(group: WorkbenchGroup, paneId: string): WorkbenchSessionBinding | null {
  return paneId === V4_PRIMARY_PANE_ID ? group.primaryBinding : group.panes[paneId] ?? null;
}
export function selectWorkbenchGroupActiveBinding(group: WorkbenchGroup): WorkbenchSessionBinding | null {
  return selectWorkbenchGroupPaneBinding(group, group.focusedPaneId);
}
function paneFor(group: WorkbenchGroup, binding: WorkbenchSessionBinding): string | null {
  const target = key(binding);
  if (key(group.primaryBinding) === target) return V4_PRIMARY_PANE_ID;
  for (const [id, candidate] of Object.entries(group.panes)) if (key(candidate) === target) return id;
  return null;
}
function nextId(state: WorkbenchGroupSnapshot): string {
  let maximum = 0;
  for (const id of Object.keys(state.groups)) {
    const match = /^group-(\d+)$/.exec(id);
    if (match) maximum = Math.max(maximum, Number(match[1]));
  }
  return `group-${maximum + 1}`;
}

// 一次 commit 同时投影 groups、active 和由当前 groups 重建的 index，不保留第二个 membership owner。
function commit(state: WorkbenchGroupSnapshot, id: string, group: WorkbenchGroup | null): WorkbenchGroupSnapshot {
  const groups = { ...state.groups };
  if (group) groups[group.id] = group;
  else delete groups[id];
  const sessionIndex: Record<string, string> = {};
  for (const item of Object.values(groups)) for (const binding of bindings(item)) sessionIndex[key(binding)] = item.id;
  return { activeGroupId: group ? group.id : state.activeGroupId === id ? null : state.activeGroupId,
    groups, sessionIndex };
}
function adoptLayout(id: string, primaryBinding: WorkbenchSessionBinding, layout: PaneLayoutSnapshot): WorkbenchGroup | null {
  const ids = leafPaneIds(layout.root);
  if (ids.length < 2 || !ids.includes(V4_PRIMARY_PANE_ID)) return null;
  const panes: Record<string, WorkbenchSessionBinding> = {};
  for (const paneId of ids) {
    if (paneId === V4_PRIMARY_PANE_ID) continue;
    const item = layout.panes[paneId];
    const binding = item ? viewBinding(item) : null;
    if (!binding) return null;
    panes[paneId] = binding;
  }
  return { id, primaryBinding, root: layout.root, panes,
    focusedPaneId: effectiveFocusedPaneId(layout), updatedAt: Date.now() };
}
function focused(group: WorkbenchGroup, paneId: string, updatedAt = Date.now()): WorkbenchGroup {
  const next = focusPane(group, paneId);
  return next === group ? group : { ...group, focusedPaneId: next.focusedPaneId, updatedAt };
}
export function closeWorkbenchGroupPane(group: WorkbenchGroup, paneId: string, updatedAt = Date.now()): WorkbenchGroup | null {
  if (paneId === V4_PRIMARY_PANE_ID) return null;
  const next = closePane(group, paneId);
  if (next === group) return group;
  const result = { ...group, root: next.root, panes: paneBindings(next.panes),
    focusedPaneId: next.focusedPaneId, updatedAt };
  return countPanes(result) < 2 ? null : result;
}

type GroupCommand =
  | { kind: "open"; binding: WorkbenchSessionBinding }
  | { kind: "split"; anchor: string; side: PaneSplitSide; binding: WorkbenchSessionBinding; primary?: WorkbenchSessionBinding }
  | { kind: "promote"; primary: WorkbenchSessionBinding; layout: PaneLayoutSnapshot }
  | { kind: "focus" | "close" | "confirm"; groupId: string; paneId: string }
  | { kind: "bind"; groupId: string; paneId: string; sessionId: string }
  | { kind: "ratio"; groupId: string; splitId: string; ratio: number }
  | { kind: "deactivate" };

function transition(state: WorkbenchGroupSnapshot, command: GroupCommand): WorkbenchGroupSnapshot {
  if (command.kind === "deactivate") return state.activeGroupId === null ? state : { ...state, activeGroupId: null };
  if (command.kind === "open") {
    const id = state.sessionIndex[key(command.binding)];
    if (!id) return state.activeGroupId === null ? state : { ...state, activeGroupId: null };
    const group = state.groups[id];
    if (!group) return { ...state, activeGroupId: null };
    const paneId = paneFor(group, command.binding);
    return paneId ? commit(state, id, focused(group, paneId)) : state;
  }
  if (command.kind === "promote") {
    const group = adoptLayout(nextId(state), command.primary, command.layout);
    if (!group) return state;
    const keys = bindings(group).map(key);
    return new Set(keys).size !== keys.length || keys.some((value) => Boolean(state.sessionIndex[value]))
      ? state : commit(state, group.id, group);
  }
  if (command.kind === "split") {
    const sessionKey = key(command.binding);
    if (state.sessionIndex[sessionKey]) return state;
    const group = state.activeGroupId ? state.groups[state.activeGroupId] : undefined;
    if (group) {
      const updatedAt = Date.now();
      const containmentKey = key(command.binding);
      if (bindings(group).some((item) => key(item) === containmentKey) || !canAddPane(group)) return state;
      const next = splitPaneAtSide(group, command.anchor, command.side, incomingPane(command.binding));
      return next === group ? state : commit(state, group.id, { ...group, root: next.root,
        panes: paneBindings(next.panes), focusedPaneId: next.focusedPaneId, updatedAt });
    }
    if (!command.primary || key(command.primary) === sessionKey || state.sessionIndex[key(command.primary)]) return state;
    const id = nextId(state);
    const layout = splitPaneAtSide(INITIAL_PANE_LAYOUT, V4_PRIMARY_PANE_ID, command.side, incomingPane(command.binding));
    return commit(state, id, { id, primaryBinding: command.primary, root: layout.root,
      panes: paneBindings(layout.panes), focusedPaneId: layout.focusedPaneId, updatedAt: Date.now() });
  }
  const group = state.groups[command.groupId];
  if (!group) return state;
  let next: WorkbenchGroup | null = group;
  switch (command.kind) {
    case "focus":
      next = focused(group, command.paneId);
      if (next === group && state.activeGroupId === command.groupId) return state;
      break;
    case "close":
      next = closeWorkbenchGroupPane(group, command.paneId);
      if (next === group) return state;
      break;
    case "ratio": {
      const layout = setSplitNodeRatio(group, command.splitId, command.ratio);
      if (layout.root === group.root) return state;
      next = { ...group, root: layout.root, updatedAt: Date.now() };
      break;
    }
    case "confirm": {
      const item = selectWorkbenchGroupPaneBinding(group, command.paneId);
      if (!item?.restoredUnvalidated) return state;
      const { restoredUnvalidated: _marker, ...confirmed } = item;
      next = command.paneId === V4_PRIMARY_PANE_ID ? { ...group, primaryBinding: confirmed }
        : { ...group, panes: { ...group.panes, [command.paneId]: confirmed } };
      break;
    }
    case "bind": {
      const item = selectWorkbenchGroupPaneBinding(group, command.paneId);
      if (!item || item.sessionId === command.sessionId) return state;
      const replacement: WorkbenchSessionBinding = { workspaceScope: item.workspaceScope,
        sessionId: command.sessionId, ...(item.readOnly ? { readOnly: true } : {}) };
      const existing = state.sessionIndex[key(replacement)];
      if (existing && existing !== command.groupId || existing === command.groupId && key(item) !== key(replacement)) return state;
      next = command.paneId === V4_PRIMARY_PANE_ID ? { ...group, primaryBinding: replacement, updatedAt: Date.now() }
        : { ...group, panes: { ...group.panes, [command.paneId]: replacement }, updatedAt: Date.now() };
      break;
    }
  }
  return commit(state, command.groupId, next);
}

export const useWorkbenchGroupStore = create<WorkbenchGroupStore>()((set, get) => {
  const dispatch = (command: GroupCommand) => { if (enabled()) set((state) => transition(state, command)); };
  return {
    ...INITIAL,
    configureClientMode(mode) {
      if (mode !== client.mode || mode === "web-remote-replayable") client.epoch += 1;
      client.mode = mode;
      if (!enabled()) {
        client.hydrated = false;
        set(INITIAL);
      } else if (!client.hydrated) {
        client.hydrated = true;
        const epoch = client.epoch;
        const restored = readPersistedWorkbenchGroups();
        // getItem 可同步重入 mode/reset；旧 hydration 不得把已清掉的 desktop group 放回 remote。
        if (restored && enabled() && epoch === client.epoch) set(restored);
      }
    },
    openSessionFromSidebar(binding) { dispatch({ kind: "open", binding }); },
    splitSessionIntoGroup(anchor, side, binding, primary) { dispatch({ kind: "split", anchor, side, binding, primary }); },
    promotePaneLayoutToGroup(primary, layout) {
      if (!enabled()) return false;
      const current = get();
      const next = transition(current, { kind: "promote", primary, layout });
      if (current === next) return false;
      set(next);
      return true;
    },
    focusPane(groupId, paneId) { dispatch({ kind: "focus", groupId, paneId }); },
    closePane(groupId, paneId) { dispatch({ kind: "close", groupId, paneId }); },
    confirmRestoredPaneSession(groupId, paneId) { dispatch({ kind: "confirm", groupId, paneId }); },
    bindPaneSession(groupId, paneId, sessionId) { dispatch({ kind: "bind", groupId, paneId, sessionId }); },
    setSplitRatio(groupId, splitId, ratio) { dispatch({ kind: "ratio", groupId, splitId, ratio }); },
    isSessionGrouped(workspaceScope, sessionId) { return enabled() && Boolean(sessionId && get().sessionIndex[buildWorkbenchSessionKey(workspaceScope, sessionId)]); },
    getActiveContext() {
      if (!enabled()) return null;
      const current = get();
      const group = current.activeGroupId ? current.groups[current.activeGroupId] : undefined;
      return group ? selectWorkbenchGroupActiveBinding(group) : null;
    },
    deactivateActiveGroup() { dispatch({ kind: "deactivate" }); },
    resetWorkbenchGroups() { client.epoch += 1; set(INITIAL); },
  };
});
useWorkbenchGroupStore.subscribe((state) => { if (enabled()) persistWorkbenchGroups(state); });
