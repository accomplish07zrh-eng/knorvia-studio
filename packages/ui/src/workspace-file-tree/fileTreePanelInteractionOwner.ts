// SPDX-License-Identifier: Apache-2.0
// Source-exposed interaction/reveal candidate; source and runtime review pending.
import {
  areWorkspaceFilePathsEqual, createCodeViewerSourceForWorkspaceFile,
  getWorkspaceFileAncestorDirectories, getWorkspaceFileDirectoryChildDepth,
  getWorkspaceFileGitStatus, isWorkspaceFilePathInside, isWorkspaceFileTreeDeletedFile,
  type WorkspaceFileTreeRow,
} from "./model.js";
import { getWorkspaceFileSearchDirectoryRevealPaths } from "./searchRows.js";

type Update<T> = T | ((current: T) => T);
type Snapshot = { selected: string | null; query: string; changedOnly: boolean };
export type FileTreePanelPorts = {
  workspacePath: string;
  loadDirectory: (path: string, depth: number) => Promise<void>;
  setExpanded: (update: (current: Set<string>) => Set<string>) => void;
  gitStatus: Parameters<typeof getWorkspaceFileGitStatus>[0];
  preview?: (source: ReturnType<typeof createCodeViewerSourceForWorkspaceFile>) => void;
  refreshDirectories: () => Promise<void>;
  refreshSearch: () => void;
  fileManager: (() => Promise<{ success: boolean; error?: string | null }>) | null;
  clipboardAvailable: () => boolean;
  copyPath: () => Promise<void>;
  notify: (id: string, suffix?: string) => void;
  log: (level: "info" | "warn", message: string, details: Record<string, unknown>) => void;
};

/** Local selection/reveal only. The existing tree/store continue owning all accepted data. */
export class FileTreePanelInteractionOwner {
  private snapshot: Snapshot = { selected: null, query: "", changedOnly: false };
  private readonly listeners = new Set<() => void>();
  private scope: object | null = null;
  private pendingPreview: string | null = null;
  private pendingSearch: string | null = null;
  private rootErrorMessage: string | null = null;

  constructor(private readonly ports: () => FileTreePanelPorts) {}
  read = (): Snapshot => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private change<K extends keyof Snapshot>(key: K, update: Update<Snapshot[K]>): void {
    if (!this.scope) return;
    const value = typeof update === "function" ? (update as (current: Snapshot[K]) => Snapshot[K])(this.snapshot[key]) : update;
    if (Object.is(this.snapshot[key], value)) return;
    this.publish({ ...this.snapshot, [key]: value });
  }
  private publish(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
  select = (value: Update<string | null>) => this.change("selected", value);
  search = (value: Update<string>) => this.change("query", value);
  changed = (value: Update<boolean>) => this.change("changedOnly", value);
  resetFilters = () => {
    if (!this.scope || (this.snapshot.selected === null && !this.snapshot.query && !this.snapshot.changedOnly)) return;
    this.publish({ selected: null, query: "", changedOnly: false });
  };

  activate(): () => void {
    const scope = {};
    this.scope = scope;
    return () => {
      if (this.scope !== scope) return;
      this.scope = null;
      this.pendingPreview = null;
      this.pendingSearch = null;
    };
  }

  private expand(paths: readonly string[], ports: FileTreePanelPorts): void {
    ports.setExpanded((current) => {
      const next = new Set(current);
      for (const path of paths) next.add(path);
      return next;
    });
  }
  private async load(paths: readonly string[], ports: FileTreePanelPorts, accepts: () => boolean, ordinalDepth: boolean): Promise<void> {
    for (let index = 0; index < paths.length; index += 1) {
      if (!accepts()) return;
      const path = paths[index]!;
      await ports.loadDirectory(path, ordinalDepth ? index + 1 : getWorkspaceFileDirectoryChildDepth(ports.workspacePath, path));
    }
  }

  revealPreview(active: string | null | undefined, requested: string | null | undefined): (() => void) | undefined {
    const path = requested?.trim() || active?.trim(), scope = this.scope;
    if (!scope || !path) return;
    const ports = this.ports();
    if (!isWorkspaceFilePathInside(ports.workspacePath, path)) return;
    const ancestors = getWorkspaceFileAncestorDirectories(ports.workspacePath, path);
    const paths = requested?.trim() ? [...ancestors, path] : ancestors;
    let activeRequest = true;
    this.pendingPreview = path;
    this.select(path);
    this.expand(paths, ports);
    void this.load(paths, ports, () => activeRequest && this.scope === scope, true);
    return () => { activeRequest = false; };
  }
  revealVisiblePreview(rows: readonly WorkspaceFileTreeRow[], active: string | null | undefined, requested: string | null | undefined, scroll: (index: number) => void): void {
    const path = requested?.trim() || active?.trim();
    if (!this.scope || !path || !this.pendingPreview || !isWorkspaceFilePathInside(this.ports().workspacePath, path)
      || !areWorkspaceFilePathsEqual(this.pendingPreview, path)) return;
    const index = rows.findIndex((row) => areWorkspaceFilePathsEqual(row.path, path));
    if (index < 0) return;
    scroll(index);
    this.pendingPreview = null;
  }
  revealVisibleSearch(rows: readonly WorkspaceFileTreeRow[], searching: boolean, scroll: (index: number) => void): void {
    if (!this.scope || searching || !this.pendingSearch) return;
    const path = this.pendingSearch;
    const index = rows.findIndex((row) => areWorkspaceFilePathsEqual(row.path, path));
    if (index < 0) return;
    scroll(index);
    this.pendingSearch = null;
  }

  toggle = (row: WorkspaceFileTreeRow): void => {
    if (!this.scope || row.type !== "directory") return;
    const ports = this.ports();
    ports.setExpanded((current) => {
      const next = new Set(current);
      if (current.has(row.path)) for (const path of row.compactedPaths ?? [row.path]) next.delete(path);
      else next.add(row.path);
      return next;
    });
    // compacted 的视觉 depth 不用于目录写入；沿用物理 path depth。
    if (!row.expanded) void ports.loadDirectory(row.path, getWorkspaceFileDirectoryChildDepth(ports.workspacePath, row.path));
  };
  private revealSearch(row: WorkspaceFileTreeRow): void {
    const scope = this.scope, ports = this.ports();
    if (!scope || row.type !== "directory") return;
    const paths = getWorkspaceFileSearchDirectoryRevealPaths({ workspacePath: ports.workspacePath, directoryPath: row.path });
    if (paths.length === 0) return;
    this.pendingSearch = row.path;
    this.select(row.path);
    this.expand(paths, ports);
    this.search("");
    void this.load(paths, ports, () => this.scope === scope, false);
  }
  directory = (row: WorkspaceFileTreeRow): void => {
    if (this.snapshot.query.trim()) this.revealSearch(row);
    else this.toggle(row);
  };
  preview = (row: WorkspaceFileTreeRow): void => {
    if (!this.scope) return;
    if (row.type === "directory") { this.directory(row); return; }
    const ports = this.ports();
    if (!isWorkspaceFileTreeDeletedFile(row, getWorkspaceFileGitStatus(ports.gitStatus, row.path))) {
      ports.preview?.(createCodeViewerSourceForWorkspaceFile(row.path));
    }
  };
  keyDown = (event: { key: string; preventDefault: () => void }, row: WorkspaceFileTreeRow): void => {
    const commands: Record<string, { accepts: () => boolean; execute: () => void }> = {
      Enter: { accepts: () => true, execute: () => this.preview(row) },
      ArrowRight: { accepts: () => row.type === "directory", execute: () => { if (row.type === "directory" && (!row.expanded || this.snapshot.query.trim())) this.directory(row); } },
      ArrowLeft: { accepts: () => row.type === "directory" && row.expanded, execute: () => this.toggle(row) },
    };
    const command = commands[event.key];
    if (!this.scope || !command?.accepts?.()) return;
    event.preventDefault();
    command.execute();
  };
  refresh = (): void => {
    if (!this.scope) return;
    const ports = this.ports();
    void ports.refreshDirectories();
    if (this.snapshot.query.trim()) ports.refreshSearch();
  };
  openFileManager = async (): Promise<void> => {
    if (!this.scope) return;
    const ports = this.ports();
    if (!ports.fileManager) return;
    const result = await ports.fileManager();
    if (!result.success) {
      ports.log("warn", "[WorkspaceFileTree] 打开 workspace 路径失败", { path: ports.workspacePath, error: result.error ?? "unknown-error" });
      ports.notify("appHeader.openInFileManagerFailed");
    }
  };
  copyPath = async (): Promise<void> => {
    if (!this.scope) return;
    const ports = this.ports(), path = ports.workspacePath;
    const failed = (error: unknown) => ports.log("warn", "[WorkspaceFileTree] 复制 workspace 路径失败", { path, error });
    if (!ports.clipboardAvailable()) { failed("clipboard-unavailable"); return; }
    try {
      await ports.copyPath();
      ports.log("info", "[WorkspaceFileTree] workspace 路径已复制", { path });
    } catch (error) { failed(error instanceof Error ? error.message : String(error)); }
  };
  noticeRootError(loaded: boolean, error: Error | null): void {
    if (!this.scope) return;
    if (!loaded || !error) { this.rootErrorMessage = null; return; }
    if (this.rootErrorMessage === error.message) return;
    this.rootErrorMessage = error.message;
    this.ports().notify("workspaceFileTree.readFailed", error.message);
  }
}
