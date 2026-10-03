// SPDX-License-Identifier: Apache-2.0
// Source-exposed snapshot adapter; source review and verification pending.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { logger } from "@/logger.js";
import { WorkspaceFileTreeDataOwner } from "./fileTreeDataOwner.js";
import { useWorkspaceFileTreeWatchers } from "./useWorkspaceFileTreeWatchers.js";
import { useWorkspaceFileTreeRows } from "./useWorkspaceFileTreeRows.js";

export function useWorkspaceFileTreeData({
  workspacePath, workspaceIdentity, workspaceRemoteSessionId, enableWorkspaceFeatures = true,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  enableWorkspaceFeatures?: boolean;
}) {
  const { fileService, fileWatcherService, gitService } = useWorkspaceServices(
    workspacePath, workspaceRemoteSessionId, workspaceIdentity,
  );
  const owner = useMemo(() => new WorkspaceFileTreeDataOwner({
    workspacePath, enableWorkspaceFeatures, fileService, gitService,
    warn: (message, details) => logger.warn(message, details),
  }), [enableWorkspaceFeatures, fileService, gitService, workspacePath]);
  const snapshot = useSyncExternalStore(owner.subscribe, owner.read, owner.read);
  const currentOwnerRef = useRef(owner);
  const enqueueWatchRefresh = useCallback((path: string) => currentOwnerRef.current.enqueueWatchRefresh(path), []);
  useEffect(() => {
    currentOwnerRef.current = owner;
    return owner.start();
  }, [owner, workspaceIdentity, workspaceRemoteSessionId]);

  const rows = useWorkspaceFileTreeRows({ workspacePath, ...snapshot });
  const watchedDirectoryPaths = useMemo(() => enableWorkspaceFeatures
    ? new Set([workspacePath, ...snapshot.expandedPaths]) : new Set<string>(),
  [enableWorkspaceFeatures, snapshot.expandedPaths, workspacePath]);
  useWorkspaceFileTreeWatchers({
    fileWatcherService, watchedDirectoryPaths, onDirectoryChange: enqueueWatchRefresh,
  });
  return {
    rows,
    setExpandedPaths: owner.setExpandedPaths,
    loadedDirectoryPaths: snapshot.loadedDirectoryPaths,
    loadingDirectoryPaths: snapshot.loadingDirectoryPaths,
    errorByDirectory: snapshot.errorByDirectory,
    gitStatusByPath: snapshot.gitStatusByPath,
    gitStatusAvailable: snapshot.gitStatusAvailable,
    ignoredPathSet: snapshot.ignoredPathSet,
    refreshingLoadedDirectories: snapshot.refreshingLoadedDirectories,
    loadDirectory: owner.loadDirectory,
    loadGitStatus: owner.loadGitStatus,
    refreshLoadedDirectories: owner.refreshLoadedDirectories,
    setLoadedDirectoryPaths: owner.setLoadedDirectoryPaths,
    loadedDirectoryPathsRef: owner.loadedDirectoryPathsRef,
  };
}
