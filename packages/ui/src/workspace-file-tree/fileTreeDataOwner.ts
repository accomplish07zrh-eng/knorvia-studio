// SPDX-License-Identifier: Apache-2.0
// Source-exposed contract owner; source review and verification pending.
import type { IFileService, IGitService } from "@knorvia/services";
import {
  WORKSPACE_FILE_TREE_WATCH_BULK_REFRESH_THRESHOLD,
  WORKSPACE_FILE_TREE_WATCH_DEBOUNCE_MS,
  WORKSPACE_FILE_TREE_REFRESH_DIRECTORY_TIMEOUT_MS,
  WORKSPACE_FILE_TREE_REFRESH_GIT_TIMEOUT_MS,
} from "./constants.js";
import {
  getWorkspaceFileDirectoryChildDepth,
  getWorkspaceFileParentDirectory,
  isWorkspaceFileTreeAutoFlattenableDirectory,
  isWorkspaceFilePathInside,
} from "./model.js";
import { toError } from "./helpers.js";
import { loadWorkspaceFileTreeGitStatus } from "./gitStatus.js";
import { getWorkspaceFileTreeRefreshDirectoryPaths } from "./refreshDirectories.js";
import { WorkspaceFileTreeRequestLedger } from "./fileTreeRequestLedger.js";
import { refreshFileTreePaths, withFileTreeDeadline } from "./fileTreeRefreshScheduling.js";
import {
  emptyWorkspaceFileTree,
  removeFileTreeSubtree,
  replaceDirectoryIgnoredPaths,
  updateFileTreeMap,
  updateFileTreeSet,
  type FileTreeSetUpdate,
  type WorkspaceFileTreeSnapshot,
} from "./fileTreeState.js";

export type FileTreeDirectoryLoadResult = "loaded" | "stale" | "failed";
type DirectoryLoadOptions = { force?: boolean; silent?: boolean; workspaceGeneration?: number };
type OwnerOptions = {
  workspacePath: string;
  enableWorkspaceFeatures: boolean;
  fileService: Pick<IFileService, "readdir">;
  gitService: Pick<IGitService, "getIgnoredPaths" | "refresh">;
  warn: (
    message: string,
    details: { path?: string; workspacePath?: string; error: string },
  ) => void;
  onWatchRefresh?: () => void;
};

/** One accepted snapshot. React and compatibility refs read this owner's facts directly. */
export class WorkspaceFileTreeDataOwner {
  private snapshot = emptyWorkspaceFileTree();
  private listeners = new Set<() => void>();
  private requests = new WorkspaceFileTreeRequestLedger();
  private watchPaths = new Set<string>();
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly loadedDirectoryPathsRef: { current: Set<string> };

  constructor(private readonly options: OwnerOptions) {
    const readLoadedPaths = () => this.snapshot.loadedDirectoryPaths;
    const writeLoadedPaths = (paths: Set<string>) => this.setLoadedDirectoryPaths(paths);
    this.loadedDirectoryPathsRef = {
      get current() {
        return readLoadedPaths();
      },
      set current(paths) {
        writeLoadedPaths(paths);
      },
    };
  }

  read = (): WorkspaceFileTreeSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(change: Partial<WorkspaceFileTreeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }

  setExpandedPaths = (update: FileTreeSetUpdate): void => {
    const expandedPaths =
      typeof update === "function" ? update(this.snapshot.expandedPaths) : update;
    if (expandedPaths !== this.snapshot.expandedPaths) this.publish({ expandedPaths });
  };

  setLoadedDirectoryPaths = (update: FileTreeSetUpdate): void => {
    const loadedDirectoryPaths =
      typeof update === "function" ? update(this.snapshot.loadedDirectoryPaths) : update;
    if (loadedDirectoryPaths !== this.snapshot.loadedDirectoryPaths)
      this.publish({ loadedDirectoryPaths });
  };

  start(): () => void {
    this.clearWatchQueue();
    const generation = this.requests.openScope();
    this.publish(emptyWorkspaceFileTree());
    void this.loadDirectory(this.options.workspacePath, 0, {
      force: true,
      workspaceGeneration: generation,
    });
    void this.loadGitStatus({ workspaceGeneration: generation });
    return () => {
      if (!this.requests.acceptsScope(generation)) return;
      this.requests.closeScope();
      this.clearWatchQueue();
    };
  }

  loadDirectory = async (
    path: string,
    childDepth: number,
    options: DirectoryLoadOptions = {},
  ): Promise<FileTreeDirectoryLoadResult> => {
    const generation = options.workspaceGeneration ?? this.requests.generation;
    if (!this.requests.acceptsScope(generation)) return "stale";
    if (
      !options.force &&
      (this.snapshot.loadedDirectoryPaths.has(path) ||
        this.snapshot.loadingDirectoryPaths.has(path))
    ) {
      return "loaded";
    }
    const ticket = this.requests.reserveDirectory(path, generation);
    this.publish({
      errorByDirectory: updateFileTreeMap(this.snapshot.errorByDirectory, path),
      ...(options.silent
        ? {}
        : {
            loadingDirectoryPaths: updateFileTreeSet(
              this.snapshot.loadingDirectoryPaths,
              path,
              true,
            ),
          }),
    });
    try {
      const entries = await this.options.fileService.readdir({ path, includeHidden: true });
      if (!this.requests.acceptsDirectory(ticket)) return "stale";
      if (this.options.enableWorkspaceFeatures) {
        const entryPaths = entries.map((entry) => entry.path);
        void this.options.gitService
          .getIgnoredPaths({ workspacePath: this.options.workspacePath, paths: entryPaths })
          .then((ignoredPaths) => {
            if (this.requests.acceptsDirectory(ticket))
              this.publish({
                ignoredPathSet: replaceDirectoryIgnoredPaths(
                  this.snapshot.ignoredPathSet,
                  entryPaths,
                  ignoredPaths,
                ),
              });
          })
          .catch((error) =>
            this.warn("[WorkspaceFileTree] 读取 Git ignored 状态失败", error, path, true),
          );
      }
      const children = entries.map((entry) => ({
        path: entry.path,
        name: entry.name,
        type: entry.type,
        isSymbolicLink: entry.isSymbolicLink === true,
        depth: childDepth,
      }));
      this.publish({
        childrenByDirectory: updateFileTreeMap(this.snapshot.childrenByDirectory, path, children),
        loadedDirectoryPaths: updateFileTreeSet(this.snapshot.loadedDirectoryPaths, path, true),
      });
      if (entries.length === 1 && isWorkspaceFileTreeAutoFlattenableDirectory(entries[0])) {
        void this.loadDirectory(entries[0].path, childDepth + 1, {
          silent: true,
          workspaceGeneration: generation,
        });
      }
      return "loaded";
    } catch (error) {
      if (!this.requests.acceptsDirectory(ticket)) return "stale";
      const nextError = toError(error);
      this.warn("[WorkspaceFileTree] 读取目录失败", nextError, path);
      this.publish({
        errorByDirectory: updateFileTreeMap(this.snapshot.errorByDirectory, path, nextError),
      });
      return "failed";
    } finally {
      if (this.requests.acceptsDirectory(ticket))
        this.publish({
          loadingDirectoryPaths: updateFileTreeSet(
            this.snapshot.loadingDirectoryPaths,
            path,
            false,
          ),
        });
    }
  };

  loadGitStatus = async (options: { workspaceGeneration?: number } = {}): Promise<void> => {
    const generation = options.workspaceGeneration ?? this.requests.generation;
    if (!this.requests.acceptsScope(generation)) return;
    if (!this.options.enableWorkspaceFeatures) {
      this.publish({ gitStatusByPath: new Map(), gitStatusAvailable: false });
      return;
    }
    const ticket = this.requests.reserveGit(generation);
    try {
      const gitStatus = await loadWorkspaceFileTreeGitStatus({
        gitService: this.options.gitService,
        workspacePath: this.options.workspacePath,
      });
      if (this.requests.acceptsGit(ticket))
        this.publish({
          gitStatusAvailable: gitStatus.available,
          gitStatusByPath: gitStatus.statusByPath,
        });
    } catch (error) {
      if (!this.requests.acceptsGit(ticket)) return;
      this.warn("[WorkspaceFileTree] 读取 Git 状态失败", error, undefined, true);
      this.publish({ gitStatusAvailable: false, gitStatusByPath: new Map() });
    }
  };

  private prune(path: string): void {
    this.requests.invalidateDirectories((candidate) => isWorkspaceFilePathInside(path, candidate));
    this.publish(removeFileTreeSubtree(this.snapshot, path));
  }

  private refreshDirectory = async (
    path: string,
    generation: number,
    manual: boolean,
  ): Promise<void> => {
    if (
      !this.requests.acceptsScope(generation) ||
      !isWorkspaceFilePathInside(this.options.workspacePath, path)
    )
      return;
    const read = this.loadDirectory(
      path,
      getWorkspaceFileDirectoryChildDepth(this.options.workspacePath, path),
      {
        force: true,
        silent: true,
        workspaceGeneration: generation,
      },
    );
    if (manual) {
      try {
        await withFileTreeDeadline(
          read,
          WORKSPACE_FILE_TREE_REFRESH_DIRECTORY_TIMEOUT_MS,
          `workspace file tree refresh ${path}`,
        );
      } catch (error) {
        if (!this.requests.acceptsScope(generation)) return;
        this.requests.invalidateDirectory(path);
        this.warn("[WorkspaceFileTree] 手动刷新目录超时或失败", error, path);
        this.publish({
          errorByDirectory: updateFileTreeMap(this.snapshot.errorByDirectory, path, toError(error)),
        });
      }
      return;
    }
    const result = await read;
    if (result !== "failed" || !this.requests.acceptsScope(generation)) return;
    this.prune(path);
    const parent = getWorkspaceFileParentDirectory(this.options.workspacePath, path);
    if (parent)
      await this.loadDirectory(
        parent,
        getWorkspaceFileDirectoryChildDepth(this.options.workspacePath, parent),
        {
          force: true,
          silent: true,
          workspaceGeneration: generation,
        },
      );
  };

  refreshLoadedDirectories = async (): Promise<void> => {
    if (
      this.snapshot.refreshingLoadedDirectories ||
      !this.requests.acceptsScope(this.requests.generation)
    )
      return;
    const ticket = this.requests.refreshTicket(true);
    this.publish({ refreshingLoadedDirectories: true });
    const paths = getWorkspaceFileTreeRefreshDirectoryPaths({
      workspacePath: this.options.workspacePath,
      expandedPaths: this.snapshot.expandedPaths,
      loadedDirectoryPaths: this.snapshot.loadedDirectoryPaths,
    });
    try {
      await refreshFileTreePaths(
        paths,
        () => this.requests.acceptsRefresh(ticket),
        (path) => this.refreshDirectory(path, ticket.generation, true),
      );
      if (!this.requests.acceptsRefresh(ticket)) return;
      try {
        await withFileTreeDeadline(
          this.loadGitStatus({ workspaceGeneration: ticket.generation }),
          WORKSPACE_FILE_TREE_REFRESH_GIT_TIMEOUT_MS,
          "workspace file tree git refresh",
        );
      } catch (error) {
        if (!this.requests.acceptsRefresh(ticket)) return;
        this.requests.invalidateGit();
        this.warn("[WorkspaceFileTree] 手动刷新 Git 状态超时或失败", error, undefined, true);
      }
    } finally {
      if (this.requests.acceptsRefresh(ticket))
        this.publish({ refreshingLoadedDirectories: false });
    }
  };

  enqueueWatchRefresh = (path: string): void => {
    if (
      !this.requests.acceptsScope(this.requests.generation) ||
      !isWorkspaceFilePathInside(this.options.workspacePath, path)
    )
      return;
    this.watchPaths.add(path);
    if (this.watchTimer !== null) clearTimeout(this.watchTimer);
    this.watchTimer = setTimeout(() => {
      this.watchTimer = null;
      void this.flushWatchRefreshQueue();
    }, WORKSPACE_FILE_TREE_WATCH_DEBOUNCE_MS);
  };

  private async flushWatchRefreshQueue(): Promise<void> {
    const paths = [...this.watchPaths];
    this.watchPaths.clear();
    if (paths.length === 0) return;
    const refreshPaths =
      paths.length > WORKSPACE_FILE_TREE_WATCH_BULK_REFRESH_THRESHOLD
        ? [this.options.workspacePath, ...this.snapshot.expandedPaths]
        : paths;
    const ticket = this.requests.refreshTicket();
    await refreshFileTreePaths(
      refreshPaths,
      () => this.requests.acceptsRefresh(ticket),
      (path) => this.refreshDirectory(path, ticket.generation, false),
    );
    if (!this.requests.acceptsRefresh(ticket)) return;
    // 目录已因 watch 更新，搜索仍持有旧索引；仅有效批次通过原刷新入口同步索引。
    this.options.onWatchRefresh?.();
    // 刷新命令可能同步切换 scope，旧批次不能继续调度新 scope 的 Git 读取。
    if (this.requests.acceptsRefresh(ticket))
      void this.loadGitStatus({ workspaceGeneration: ticket.generation });
  }

  private clearWatchQueue(): void {
    if (this.watchTimer !== null) clearTimeout(this.watchTimer);
    this.watchTimer = null;
    this.watchPaths.clear();
  }

  private warn(message: string, error: unknown, path?: string, workspace = false): void {
    this.options.warn(message, {
      ...(path === undefined ? {} : { path }),
      ...(workspace ? { workspacePath: this.options.workspacePath } : {}),
      error: toError(error).message,
    });
  }
}
