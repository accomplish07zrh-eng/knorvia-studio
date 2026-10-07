import type { IWindowControllerService } from "@knorvia/services";
import type { CommandInput } from "../runtime/studioClient.js";
import type { StudioAttentionRow } from "./attentionRows.js";
import {
  setTaskQueryCacheUnreadOverlay,
  reconcileTaskQueryCacheUnread,
  rollbackTaskQueryCacheUnread,
  discardTaskQueryCacheUnreadMutation,
  markTaskQueryCacheScopesStale,
} from "@/store/taskQueryCacheStore.js";

/** Read receipts use the same owners and CAS boundary as explicit session selection. */
export async function readStudioAttentionRow(
  row: StudioAttentionRow,
  command: (input: CommandInput) => Promise<unknown>,
  controller: Pick<IWindowControllerService, "mutateTask"> | undefined,
  current: () => boolean,
): Promise<void> {
  if (row.source === "studio") {
    const item = row.item;
    await command({
      type: "attention-read",
      object: item.object,
      id: item.id,
      version: item.version,
    });
    return;
  }
  if (!controller || row.unavailable || typeof row.item.unreadAt !== "number")
    throw new Error("studio.attention.missing");
  const { taskId, workspacePath, workspaceIdentity, remoteSessionId, unreadAt } = row.item;
  const address = {
    taskId,
    workspacePath,
    ...(workspaceIdentity ? { workspaceIdentity } : {}),
    ...(remoteSessionId ? { remoteSessionId } : {}),
  };
  const token = setTaskQueryCacheUnreadOverlay(address, undefined, unreadAt);
  try {
    const meta = await controller.mutateTask({
      address,
      mutation: { kind: "mark-read", expectedUnreadAt: unreadAt },
    });
    // 旧连接回包不能对新 Host 的缓存写入任何阅读事实。
    if (!current()) {
      discardTaskQueryCacheUnreadMutation(address, token);
      markTaskQueryCacheScopesStale([address]);
      return;
    }
    if (!meta) throw new Error("studio.attention.missing");
    reconcileTaskQueryCacheUnread(address, meta.unreadAt, token);
  } catch (error) {
    if (!current()) {
      discardTaskQueryCacheUnreadMutation(address, token);
      markTaskQueryCacheScopesStale([address]);
      return;
    }
    rollbackTaskQueryCacheUnread(address, unreadAt, token);
    throw error;
  }
}
