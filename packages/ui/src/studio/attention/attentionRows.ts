import type {
  StudioAttentionItem,
  StudioKernelId,
  WindowHostControllerTaskListItem,
} from "@knorvia/services";

export type StudioAttentionRow = {
  key: string;
  category: StudioAttentionItem["category"];
  unread: boolean;
  title: string;
  workspacePath: string;
  kernels: StudioKernelId[];
  state: string;
  unavailable: boolean;
} & (
  | { source: "studio"; item: StudioAttentionItem }
  | { source: "native"; item: WindowHostControllerTaskListItem }
);

export function studioAttentionRows(
  connection: number,
  studio: StudioAttentionItem[],
  native: WindowHostControllerTaskListItem[],
): StudioAttentionRow[] {
  const rows: StudioAttentionRow[] = studio.map((item) => ({
    key: JSON.stringify([connection, item.workspacePath, item.object, item.id]),
    source: "studio",
    item,
    category: item.category,
    unread: item.unread,
    title: item.title,
    workspacePath: item.workspacePath,
    kernels: item.kernels,
    state: item.state,
    unavailable: item.targetDeleted,
  }));
  for (const item of new Map(
    native.map((item) => [
      JSON.stringify([
        item.remoteSessionId,
        item.workspaceIdentity?.trim() || item.workspacePath,
        item.taskId,
      ]),
      item,
    ]),
  ).values()) {
    const pending = item.activity?.pendingInteractions;
    const needsInput = (pending?.permissionCount ?? 0) + (pending?.userInputCount ?? 0) > 0;
    const unread = typeof item.unreadAt === "number";
    if (!needsInput && !unread && !["completed", "error"].includes(item.status ?? "")) continue;
    rows.push({
      key: JSON.stringify([
        connection,
        item.remoteSessionId,
        item.workspaceIdentity?.trim() || item.workspacePath,
        "native",
        item.taskId,
      ]),
      source: "native",
      item,
      category: needsInput ? "pending" : item.status === "error" ? "failed" : "completed",
      unread,
      title: item.title,
      workspacePath: item.workspacePath,
      kernels: ["knorvia"],
      state: needsInput ? "waiting" : (item.status ?? "unknown"),
      unavailable: item.sourceAvailability !== "online",
    });
  }
  return rows;
}
