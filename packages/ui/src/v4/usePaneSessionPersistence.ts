import { useEffect, useRef } from "react";
import { isRendererReloadNavigation } from "@/lib/rendererNavigation.js";

const STORAGE_PREFIX = "knorvia-v4-last-session:v1:";
interface UsePaneSessionPersistenceParams {
  workspaceKey: string;
  activeSessionId: string | null;
  draftFocusVersion: number;
  enabled?: boolean;
  selectSession: (sessionId: string) => void;
}
type View = { workspaceKey: string; activeSessionId: string | null; draftFocusVersion: number; enabled: boolean };
type RestoreCell = { pending: { sessionId: string; draftVersion: number } | null };
type Lease = { workspaceKey: string };

function remember(key: string, sessionId: string | null): void {
  try {
    if (sessionId) localStorage.setItem(`${STORAGE_PREFIX}${key}`, sessionId);
    else localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch { /* 存储不可用不影响当前选择或显式 draft。 */ }
}
function recall(key: string): string | null {
  try { return localStorage.getItem(`${STORAGE_PREFIX}${key}`); }
  catch { return null; }
}

class PaneSessionRestoreOwner {
  private readonly workspaces = new Map<string, RestoreCell>();
  private active: Lease | null = null;
  constructor(private reloadAvailable: boolean) {}

  mount(view: View, current: () => View, select: (id: string) => void): Lease | null {
    if (!view.enabled) return null;
    const lease: Lease = { workspaceKey: view.workspaceKey };
    this.active = lease;
    if (this.workspaces.has(view.workspaceKey)) return lease;
    const cell: RestoreCell = { pending: null };
    this.workspaces.set(view.workspaceKey, cell);
    const reload = this.reloadAvailable;
    this.reloadAvailable = false;
    if (!reload || view.activeSessionId !== null || view.draftFocusVersion !== 0) {
      if (view.activeSessionId === null) remember(view.workspaceKey, null);
      return lease;
    }
    const id = recall(view.workspaceKey);
    const latest = current();
    // storage 可同步切换 scope/选择；旧 mount 没有再次选择或覆写新 draft 的权限。
    if (id && this.active === lease && latest.enabled && latest.workspaceKey === view.workspaceKey &&
      latest.activeSessionId === null && latest.draftFocusVersion === view.draftFocusVersion) {
      cell.pending = { sessionId: id, draftVersion: view.draftFocusVersion };
      select(id);
    }
    return lease;
  }

  persist(view: View, current: () => View): void {
    const latest = current();
    if (!view.enabled || !latest.enabled || latest.workspaceKey !== view.workspaceKey ||
      latest.activeSessionId !== view.activeSessionId || latest.draftFocusVersion !== view.draftFocusVersion) return;
    const cell = this.workspaces.get(view.workspaceKey);
    if (!cell) return;
    if (cell.pending) {
      // 明确新建任务改变意图代次；不能无限把用户的 null 当成恢复尚未回填。
      if (view.activeSessionId === null && view.draftFocusVersion === cell.pending.draftVersion) return;
      cell.pending = null;
    }
    remember(view.workspaceKey, view.activeSessionId);
  }

  release(lease: Lease | null): void {
    if (lease && this.active === lease) this.active = null;
  }
}

export function usePaneSessionPersistence({ workspaceKey, activeSessionId, draftFocusVersion,
  enabled = true, selectSession }: UsePaneSessionPersistenceParams): void {
  const view: View = { workspaceKey, activeSessionId, draftFocusVersion, enabled };
  const latest = useRef({ view, selectSession });
  latest.current = { view, selectSession };
  const owner = useRef<PaneSessionRestoreOwner | null>(null);
  if (owner.current === null) owner.current = new PaneSessionRestoreOwner(isRendererReloadNavigation());
  const restore = owner.current;

  useEffect(() => {
    const lease = restore.mount(view, () => latest.current.view, (id) => latest.current.selectSession(id));
    return () => restore.release(lease);
    // 只在 key/enable 首次准入；选择和显式 draft 的后续变化归 persist effect。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, workspaceKey, restore]);

  useEffect(() => {
    restore.persist(view, () => latest.current.view);
  }, [activeSessionId, draftFocusVersion, enabled, workspaceKey, restore]);
}
