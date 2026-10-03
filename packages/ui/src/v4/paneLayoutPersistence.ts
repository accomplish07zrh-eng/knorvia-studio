import {
  clampSplitRatio, leafPaneIds, MAX_WORKBENCH_PANES, paneWorkspaceKey, PRIMARY_LEAF,
  V4_PRIMARY_PANE_ID, type PaneBinding, type PaneLayoutNode, type PaneLayoutSnapshot,
  type PaneWorkspaceScope, type WorkbenchGroup, type WorkbenchGroupSnapshot,
  type WorkbenchSessionBinding,
} from "@/v4/paneLayoutTree.js";

const PANE_KEY = "knorvia-v4-pane-layout:v2";
const LEGACY_PANE_KEY = "knorvia-v4-pane-layout:v1";
const GROUP_KEY = "knorvia-v4-session-workbench-groups:v1";
type Profile = "pane" | "group";
type Data = Record<string, unknown>;

function record(value: unknown, profile: Profile): Data | null {
  return typeof value === "object" && value !== null && (profile === "pane" || !Array.isArray(value))
    ? value as Data : null;
}
function text(value: unknown, nonempty = false): value is string {
  return typeof value === "string" && (!nonempty || value.length > 0);
}
function ratio(value: unknown): number {
  return clampSplitRatio(typeof value === "number" ? value : Number.NaN);
}

// 两个既有 schema 的接纳规则不同，profile 不把 group 的空字符串或 arrays 规则改成 pane 规则。
function decodeTree(value: unknown, profile: Profile): PaneLayoutNode | null {
  type Frame = { value: unknown; phase: 0 | 1 | 2; source?: Data; first?: PaneLayoutNode | null };
  const frames: Frame[] = [{ value, phase: 0 }];
  let result: PaneLayoutNode | null = null;
  while (frames.length) {
    const frame = frames[frames.length - 1]!;
    if (frame.phase === 0) {
      const source = record(frame.value, profile);
      if (!source || source.type !== "leaf" && source.type !== "split") {
        result = null;
        frames.pop();
      } else if (source.type === "leaf") {
        result = text(source.paneId, profile === "pane") ? { type: "leaf", paneId: source.paneId } : null;
        frames.pop();
      } else if (profile === "pane" && (!text(source.id, true) ||
        source.direction !== "row" && source.direction !== "column")) {
        result = null;
        frames.pop();
      } else {
        frame.source = source;
        frame.phase = 1;
        frames.push({ value: source.first, phase: 0 });
      }
    } else if (frame.phase === 1) {
      frame.first = result;
      frame.phase = 2;
      frames.push({ value: frame.source!.second, phase: 0 });
    } else {
      const source = frame.source!;
      result = frame.first && result && text(source.id, profile === "pane") &&
        (source.direction === "row" || source.direction === "column")
        ? { type: "split", id: source.id, direction: source.direction, ratio: ratio(source.ratio),
            first: frame.first, second: result }
        : null;
      frames.pop();
    }
  }
  return result;
}

function scope(value: unknown, profile: Profile): PaneWorkspaceScope | null {
  const source = record(value, profile);
  if (!source || !text(source.workspacePath, profile === "pane")) return null;
  if (profile === "group") return {
    workspacePath: source.workspacePath,
    workspaceIdentity: text(source.workspaceIdentity) ? source.workspaceIdentity : undefined,
    remoteSessionId: text(source.remoteSessionId) ? source.remoteSessionId : undefined,
  };
  return {
    workspacePath: source.workspacePath,
    ...(text(source.workspaceIdentity) && source.workspaceIdentity.trim().length > 0
      ? { workspaceIdentity: source.workspaceIdentity } : {}),
    ...(text(source.remoteSessionId, true) ? { remoteSessionId: source.remoteSessionId } : {}),
  };
}
function binding(value: unknown, profile: "pane"): PaneBinding | null;
function binding(value: unknown, profile: "group"): WorkbenchSessionBinding | null;
function binding(value: unknown, profile: Profile): PaneBinding | WorkbenchSessionBinding | null {
  const source = record(value, profile);
  if (!source || profile === "group" && (!text(source.sessionId) || source.readOnly === true)) return null;
  const workspaceScope = scope(source.workspaceScope, profile);
  if (!workspaceScope) return null;
  const sessionId = profile === "group" ? source.sessionId as string
    : text(source.sessionId, true) ? source.sessionId : null;
  return { workspaceScope, sessionId,
    ...(profile === "group" || sessionId !== null ? { restoredUnvalidated: true } : {}) };
}
function validLeaves(root: PaneLayoutNode): string[] | null {
  const ids = leafPaneIds(root);
  return ids.length <= MAX_WORKBENCH_PANES && new Set(ids).size === ids.length &&
    ids.includes(V4_PRIMARY_PANE_ID) ? ids : null;
}
function decodePane(value: unknown): PaneLayoutSnapshot | null {
  const source = record(value, "pane");
  if (!source) return null;
  const root = decodeTree(source.root, "pane");
  const ids = root && validLeaves(root);
  if (!root || !ids) return null;
  const input = record(source.panes, "pane") ?? {};
  const panes: Record<string, PaneBinding> = {};
  for (const id of ids) {
    if (id === V4_PRIMARY_PANE_ID) continue;
    const restored = binding(input[id], "pane");
    if (!restored) return null;
    panes[id] = restored;
  }
  return { root, panes, focusedPaneId: text(source.focusedPaneId) && ids.includes(source.focusedPaneId)
    ? source.focusedPaneId : V4_PRIMARY_PANE_ID };
}
function decodeLegacyPane(value: unknown): PaneLayoutSnapshot | null {
  const source = record(value, "pane");
  const split = source?.splitPane as { workspaceKey?: unknown; sessionId?: unknown } | null | undefined;
  const key = split?.workspaceKey;
  if (!source || !text(key, true) || !(key.startsWith("/") || /^[A-Za-z]:[\\/]/.test(key))) return null;
  const storedSession = split?.sessionId;
  const sessionId = text(storedSession, true) ? storedSession : null;
  return {
    root: { type: "split", id: "n1", direction: "row", ratio: ratio(source.splitRatio),
      first: PRIMARY_LEAF, second: { type: "leaf", paneId: "split" } },
    panes: { split: { workspaceScope: { workspacePath: key }, sessionId,
      ...(sessionId !== null ? { restoredUnvalidated: true } : {}) } },
    focusedPaneId: source.focusedPaneId === "split" ? "split" : V4_PRIMARY_PANE_ID,
  };
}
export function readPersistedPaneLayout(): PaneLayoutSnapshot | null {
  try {
    const current = localStorage.getItem(PANE_KEY);
    if (current) return decodePane(JSON.parse(current));
    const legacy = localStorage.getItem(LEGACY_PANE_KEY);
    return legacy ? decodeLegacyPane(JSON.parse(legacy)) : null;
  } catch { return null; }
}

function encodeTree(root: PaneLayoutNode): Data {
  let result: Data = {};
  const pending: Array<{ read: () => PaneLayoutNode; write: (encoded: Data) => void }> = [
    { read: () => root, write(value) { result = value; } },
  ];
  while (pending.length) {
    const { read, write } = pending.pop()!;
    const node = read();
    if (node.type === "leaf") write({ type: "leaf", paneId: node.paneId });
    else {
      const encoded: Data = { type: "split", id: node.id, direction: node.direction,
        ratio: node.ratio, first: undefined, second: undefined };
      write(encoded);
      pending.push({ read: () => node.second, write(value) { encoded.second = value; } },
        { read: () => node.first, write(value) { encoded.first = value; } });
    }
  }
  return result;
}
let lastPaneWrite: string | null = null;
export function persistPaneLayout(snapshot: PaneLayoutSnapshot): void {
  const panes: Data = {};
  for (const [id, item] of Object.entries(snapshot.panes)) {
    panes[id] = { workspaceScope: { workspacePath: item.workspaceScope.workspacePath,
      ...(item.workspaceScope.workspaceIdentity ? { workspaceIdentity: item.workspaceScope.workspaceIdentity } : {}),
      ...(item.workspaceScope.remoteSessionId ? { remoteSessionId: item.workspaceScope.remoteSessionId } : {}) },
      sessionId: item.sessionId };
  }
  const payload = { root: encodeTree(snapshot.root), panes, focusedPaneId: snapshot.focusedPaneId };
  try {
    const serialized = JSON.stringify(payload);
    if (serialized === lastPaneWrite) return;
    localStorage.setItem(PANE_KEY, serialized);
    lastPaneWrite = serialized;
  } catch { /* 存储失败只失去恢复能力，当前 renderer 布局仍由 store 拥有。 */ }
}

function groupFromStorage(value: unknown): WorkbenchGroup | null {
  const source = record(value, "group");
  if (!source || !text(source.id)) return null;
  const primaryBinding = binding(source.primaryBinding, "group");
  const root = decodeTree(source.root, "group");
  const ids = root && validLeaves(root);
  if (!primaryBinding || !root || !ids || ids.length < 2) return null;
  const input = record(source.panes, "group") ?? {};
  const panes: Record<string, WorkbenchSessionBinding> = {};
  for (const id of ids) {
    if (id === V4_PRIMARY_PANE_ID) continue;
    const restored = binding(input[id], "group");
    if (!restored) return null;
    panes[id] = restored;
  }
  return { id: source.id, primaryBinding, root, panes,
    focusedPaneId: text(source.focusedPaneId) && ids.includes(source.focusedPaneId)
      ? source.focusedPaneId : V4_PRIMARY_PANE_ID,
    updatedAt: typeof source.updatedAt === "number" ? source.updatedAt : 0 };
}
function groupStorage(): Storage | null {
  try { return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage; }
  catch { return null; }
}
function sessionKeys(group: WorkbenchGroup): string[] {
  return [group.primaryBinding, ...Object.values(group.panes)].map((item) =>
    `${paneWorkspaceKey(item.workspaceScope)}::${item.sessionId}`);
}
export function readPersistedWorkbenchGroups(): WorkbenchGroupSnapshot | null {
  const storage = groupStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(GROUP_KEY);
    if (!raw) return null;
    const source = record(JSON.parse(raw), "group");
    if (!source) return null;
    const groups: Record<string, WorkbenchGroup> = {};
    const sessionIndex: Record<string, string> = {};
    for (const rawGroup of Object.values(record(source.groups, "group") ?? {})) {
      const group = groupFromStorage(rawGroup);
      if (!group || groups[group.id]) continue;
      const keys = sessionKeys(group);
      if (keys.some((key) => Boolean(sessionIndex[key]))) continue;
      groups[group.id] = group;
      for (const key of keys) sessionIndex[key] = group.id;
    }
    if (!Object.keys(groups).length) return null;
    return { activeGroupId: text(source.activeGroupId) && groups[source.activeGroupId] ? source.activeGroupId : null,
      groups, sessionIndex };
  } catch { return null; }
}
export function persistWorkbenchGroups(snapshot: WorkbenchGroupSnapshot): void {
  const storage = groupStorage();
  if (!storage) return;
  try {
    const groups = Object.fromEntries(Object.entries(snapshot.groups).map(([id, group]) => {
      const { restoredUnvalidated: _primary, ...primaryBinding } = group.primaryBinding;
      const panes = Object.fromEntries(Object.entries(group.panes).map(([paneId, item]) => {
        const { restoredUnvalidated: _restored, ...persisted } = item;
        return [paneId, persisted];
      }));
      return [id, { ...group, primaryBinding, panes }];
    }));
    storage.setItem(GROUP_KEY, JSON.stringify({ version: 1, activeGroupId: snapshot.activeGroupId,
      groups, sessionIndex: snapshot.sessionIndex }));
  } catch { /* 保留 group v1 的字段，不把 storage 失败转换为业务状态。 */ }
}
