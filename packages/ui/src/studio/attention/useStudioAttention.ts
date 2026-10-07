import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useGlobalTaskList } from "@/hooks/useGlobalTaskList.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";
import { bumpTaskListMembershipVersion } from "@/v4/taskListMembershipVersion.js";
import { readStudioAttentionRow } from "./attentionRead.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { StudioAttentionActions } from "./attentionActions.js";
import { resolveStudioAttentionTarget } from "./attentionNavigation.js";
import { studioAttentionRows, type StudioAttentionRow } from "./attentionRows.js";

export function useStudioAttention(
  workspaceTabs: Pick<
    WorkspaceTabState,
    "workspacePath" | "workspaceIdentity" | "remoteSessionId"
  >[],
  onOpen: (row: StudioAttentionRow) => void,
) {
  const runtime = useStudioRuntime();
  const controller = useBaseWorkspaceServices().windowControllerService;
  const common = {
    workspaceTabs,
    sortBy: "updated" as const,
    searchQuery: "",
    expanded: true,
    collapsedLimit: 25,
  };
  const timeline = useGlobalTaskList({ ...common, kind: "timeline" });
  const pinned = useGlobalTaskList({ ...common, kind: "pinned" });
  const archived = useGlobalTaskList({ ...common, kind: "archived" });
  const sourceSignature = JSON.stringify(
    workspaceTabs
      .map((tab) => [
        tab.workspaceIdentity?.trim() || tab.workspacePath,
        tab.remoteSessionId ?? null,
      ])
      .sort(),
  );
  const scope = useRef({ service: runtime.service, controller, sourceSignature });
  scope.current = { service: runtime.service, controller, sourceSignature };
  const currentScope = () =>
    scope.current.service === runtime.service &&
    scope.current.controller === controller &&
    scope.current.sourceSignature === sourceSignature;
  const actions = useMemo(
    () => new StudioAttentionActions(),
    [runtime.connectionKey, controller, sourceSignature],
  );
  const state = useSyncExternalStore(actions.subscribe, actions.getSnapshot, actions.getSnapshot);
  const rows = useMemo(
    () =>
      studioAttentionRows(runtime.connectionKey, runtime.overview?.attention?.items ?? [], [
        ...timeline.items,
        ...pinned.items,
        ...archived.items,
      ]),
    [runtime.connectionKey, runtime.overview, timeline.items, pinned.items, archived.items],
  );
  const latestRows = useRef(rows);
  latestRows.current = rows;
  const refresh = useCallback(() => {
    runtime.refresh();
    void timeline.refresh();
    void pinned.refresh();
    void archived.refresh();
  }, [runtime.refresh, timeline.refresh, pinned.refresh, archived.refresh]);
  const open = (row: StudioAttentionRow) =>
    actions.perform(`open:${row.key}`, true, async (current) => {
      if (row.unavailable) throw new Error("studio.attention.missing");
      if (row.source === "studio") {
        if (!runtime.service) throw new Error("studio.attention.unavailable");
        const item = await resolveStudioAttentionTarget(runtime.service, row.item);
        if (current() && currentScope()) onOpen({ ...row, item });
      } else if (current() && currentScope()) onOpen(row);
    });
  const read = (row: StudioAttentionRow) =>
    actions.perform(`read:${row.key}`, false, async (current) => {
      await readStudioAttentionRow(row, runtime.command, controller, () => {
        if (!current() || !currentScope()) return false;
        if (row.source === "studio") return true;
        const latest = latestRows.current.find((item) => item.key === row.key);
        return latest?.source === "native" && latest.item.unreadAt === row.item.unreadAt;
      });
      // 响应只请求权威事实刷新；绝不按旧 row key 乐观删除新版本的通知。
      if (current() && currentScope()) {
        bumpTaskListMembershipVersion();
        refresh();
      }
    });
  return {
    rows,
    open,
    read,
    refresh,
    ...state,
    loading:
      Boolean(runtime.service && !runtime.overview && !runtime.error) ||
      timeline.loading ||
      pinned.loading ||
      archived.loading,
    error: state.error || runtime.error || timeline.error || pinned.error || archived.error,
    unsupported: !runtime.service || Boolean(runtime.overview && !runtime.overview.attention),
    partial: timeline.hasMore || pinned.hasMore || archived.hasMore,
  };
}
