import { useMemo, useSyncExternalStore } from "react";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useGlobalTaskList } from "@/hooks/useGlobalTaskList.js";
import type { PaneWorkspaceScope } from "@/v4/paneLayoutTree.js";
import {
  EMPTY_CONTROLLER_WORKSPACES,
  getWindowControllerTaskListRegistry,
} from "@/v4/windowControllerTaskListRegistry.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { activeWorkbenchTasks, workbenchConversationRows } from "./workbenchTasks.js";

const nothing = () => () => {};
const empty = () => EMPTY_CONTROLLER_WORKSPACES;
export function useWorkbenchTasks(scopes: PaneWorkspaceScope[]) {
  const runtime = useStudioRuntime();
  const controller = useBaseWorkspaceServices().windowControllerService;
  const registry = useMemo(
    () => (controller ? getWindowControllerTaskListRegistry(controller) : null),
    [controller],
  );
  const sources = useSyncExternalStore(
    registry?.subscribe ?? nothing,
    registry?.getWorkspaces ?? empty,
    empty,
  );
  // Host facts take precedence over persisted remoteSessionId from an earlier connection.
  const workspaceTabs = [
    ...new Map(
      [...scopes, ...sources.workspaces]
        .filter((scope) => scope.workspacePath)
        .map((scope) => [scope.workspaceIdentity?.trim() || scope.workspacePath, scope]),
    ).values(),
  ];
  const common = {
    workspaceTabs,
    sortBy: "updated" as const,
    searchQuery: "",
    expanded: true,
    collapsedLimit: 25,
  };
  const active = useGlobalTaskList({ ...common, kind: "active" });
  const archived = useGlobalTaskList({ ...common, kind: "archived" });
  const rows = useMemo(
    () => activeWorkbenchTasks(runtime.overview, [...active.items, ...archived.items]),
    [runtime.overview, active.items, archived.items],
  );
  // 「添加对话」与任务列表共用同一次读取；归档会话不列入，与侧栏一致。
  const conversations = useMemo(
    () => workbenchConversationRows(runtime.overview, active.items),
    [runtime.overview, active.items],
  );
  const loading =
    Boolean(runtime.service && !runtime.overview && !runtime.error) ||
    active.loading ||
    archived.loading ||
    Boolean(controller && !sources.ready && !sources.error);
  const error = runtime.error || active.error || archived.error || sources.error;
  return {
    rows,
    conversations,
    loading,
    error,
    partial:
      !runtime.service ||
      !controller ||
      active.hasMore ||
      archived.hasMore ||
      sources.workspaces.some((scope) => scope.sourceAvailability !== "online"),
    refresh() {
      runtime.refresh();
      void active.refresh();
      void archived.refresh();
    },
  };
}
