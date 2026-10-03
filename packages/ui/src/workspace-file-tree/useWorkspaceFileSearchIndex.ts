// SPDX-License-Identifier: Apache-2.0
// Source-exposed lifecycle adapter; source review and verification pending.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { WorkspaceFileEntry } from "@knorvia/shared";
import {
  packWorkspaceFileEntries,
  unpackWorkspaceFileEntries,
} from "@knorvia/shared/workspaceFileEntriesCodec";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { fetchWorkspaceFileEntriesPacked } from "@/workspace-file-search/fetchWorkspaceFileEntries.js";
import { useWorkspaceFileSearchFilterEntries } from "@/workspace-file-search/useWorkspaceFileSearchFilter.js";
import {
  emptyWorkspaceFileSearchIndex,
  reduceWorkspaceFileSearchIndex,
  WorkspaceFileSearchIndexRequests,
} from "./searchIndexState.js";

interface WorkspaceFileSearchIndexState {
  entries: WorkspaceFileEntry[];
  loading: boolean;
  loaded: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useWorkspaceFileSearchIndex({
  workspacePath,
  workspaceIdentity,
  workspaceRemoteSessionId,
  enabled,
}: {
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
  enabled: boolean;
}): WorkspaceFileSearchIndexState {
  const { fileService } = useWorkspaceServices(
    workspacePath,
    workspaceRemoteSessionId,
    workspaceIdentity,
  );
  const [snapshot, publish] = useReducer(
    reduceWorkspaceFileSearchIndex,
    undefined,
    emptyWorkspaceFileSearchIndex,
  );
  const requestsRef = useRef<WorkspaceFileSearchIndexRequests | null>(null);
  if (requestsRef.current === null)
    requestsRef.current = new WorkspaceFileSearchIndexRequests(publish);
  const requests = requestsRef.current;
  const [refreshVersion, setRefreshVersion] = useState(0);
  const refresh = useCallback(() => setRefreshVersion((version) => version + 1), []);

  useEffect(() => {
    requests.invalidate();
    publish({ type: "reset" });
  }, [requests, workspaceIdentity, workspacePath, workspaceRemoteSessionId]);

  useEffect(() => {
    if (!enabled) {
      publish({ type: "paused" });
      return;
    }
    return requests.start(async (isCurrent) => {
      // Length/Range 会复用 Host 的旧缓存；先通过已有强刷命令更新唯一 Host 索引。
      await fileService.searchWorkspaceFiles({
        rootPath: workspacePath,
        query: "",
        limit: 1,
        refresh: true,
      });
      // 强刷命令已交 Host，scope 失效只能撤权；此时不再发起后续分块读取。
      if (!isCurrent()) return "";
      return fetchWorkspaceFileEntriesPacked(fileService, workspacePath);
    });
  }, [
    enabled,
    fileService,
    refreshVersion,
    requests,
    workspaceIdentity,
    workspacePath,
    workspaceRemoteSessionId,
  ]);

  const entries = useMemo(
    () => unpackWorkspaceFileEntries(snapshot.packed, workspacePath),
    [snapshot.packed, workspacePath],
  );
  return {
    entries,
    loading: snapshot.loading,
    loaded: snapshot.loaded,
    error: snapshot.error,
    refresh,
  };
}

export function useWorkspaceFileSearchResults({
  entries,
  query,
  workspacePath,
}: {
  entries: WorkspaceFileEntry[];
  query: string;
  workspacePath: string;
}): WorkspaceFileEntry[] {
  const packed = useMemo(() => packWorkspaceFileEntries(entries), [entries]);
  const { items } = useWorkspaceFileSearchFilterEntries(
    packed,
    query,
    { requireQuery: true },
    workspacePath,
  );
  return items;
}
