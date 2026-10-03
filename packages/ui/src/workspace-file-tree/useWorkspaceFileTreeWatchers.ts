// SPDX-License-Identifier: Apache-2.0
// Source-exposed lifecycle adapter; source review and verification pending.
import { useEffect, useRef } from "react";
import type { IFileWatcherService } from "@knorvia/services";
import { logger } from "@/logger.js";
import { WorkspaceFileTreeWatcherRegistry } from "./watcherRegistry.js";

export function useWorkspaceFileTreeWatchers({
  fileWatcherService,
  watchedDirectoryPaths,
  onDirectoryChange,
}: {
  fileWatcherService: IFileWatcherService;
  watchedDirectoryPaths: Set<string>;
  onDirectoryChange: (path: string) => void;
}) {
  const registryRef = useRef<WorkspaceFileTreeWatcherRegistry | null>(null);
  if (registryRef.current === null) {
    registryRef.current = new WorkspaceFileTreeWatcherRegistry((operation, path, error) => {
      logger.warn(operation === "watch"
        ? "[WorkspaceFileTree] 监听目录失败"
        : "[WorkspaceFileTree] 停止监听目录失败", {
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
  const registry = registryRef.current;
  useEffect(() => {
    registry.reconcile(fileWatcherService, watchedDirectoryPaths, onDirectoryChange);
  }, [fileWatcherService, onDirectoryChange, registry, watchedDirectoryPaths]);
  useEffect(() => () => registry.dispose(), [registry]);
}
