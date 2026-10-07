import type { IStudioRuntimeService, StudioAttentionItem } from "@knorvia/services";

/** Only readonly facts are fetched; navigation cannot execute or approve a task. */
export async function resolveStudioAttentionTarget(
  service: IStudioRuntimeService,
  item: StudioAttentionItem,
): Promise<StudioAttentionItem> {
  const overview = await service.overview();
  const current = overview.attention?.items.find(
    (row) => row.object === item.object && row.id === item.id,
  );
  if (!current || current.version !== item.version) throw new Error("studio.attention.changed");
  if (current.targetDeleted || !current.workspacePath) throw new Error("studio.attention.missing");
  const timeline = await service.timeline(current.targetId, undefined, current.runId);
  if (!timeline.runs.some((run) => run.id === current.runId && run.targetId === current.targetId))
    throw new Error("studio.attention.missing");
  return current;
}

/** Frozen source coordinates select the existing target, never a new conversation. */
export function studioAttentionRoute(
  item: StudioAttentionItem,
): Partial<import("../useStudioNavigation.js").StudioRoute> {
  const focus = { focusTargetId: item.targetId, focusRunId: item.runId };
  if (item.targetKind === "chat" && !item.kernels[0]) throw new Error("studio.attention.missing");
  if (item.targetKind === "chat")
    return {
      ...focus,
      view: "external-chat",
      chatMode: "single",
      kernelId: item.kernels[0]!,
      externalSessionId: item.targetId,
    };
  if (item.targetKind === "group")
    return { ...focus, view: "groups", chatMode: "groups", groupId: item.targetId };
  return { ...focus, view: "workflows", workflowId: item.targetId };
}

/** An SSH chat path belongs to its kernel; group/workflow paths identify orchestration projects. */
export function studioAttentionProjectToActivate(item: StudioAttentionItem): string | undefined {
  return item.targetKind === "chat" && item.kernels.some((kernel) => kernel.startsWith("ssh:"))
    ? undefined
    : item.workspacePath;
}
