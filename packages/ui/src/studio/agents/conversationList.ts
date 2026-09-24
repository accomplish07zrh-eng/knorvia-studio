import type { StudioConversation, StudioKernelId } from "@knorvia/services";
import type { StudioExternalDraft } from "./agentDrafts.js";

export interface StudioConversationListItem {
  sessionId: string;
  kernelId: StudioKernelId;
  text: string;
  title?: string;
  workspacePath?: string;
  updatedAt: number;
  persisted: boolean;
}

/** Local drafts own unsent text; accepted conversation metadata stays owned by the Host. */
export function studioConversationList(
  conversations: readonly StudioConversation[],
  drafts: Record<string, StudioExternalDraft>,
  kernel: StudioKernelId,
): StudioConversationListItem[] {
  const items = new Map<string, StudioConversationListItem>(
    Object.values(drafts).map((draft) => [draft.sessionId, { ...draft, persisted: false }]),
  );
  for (const conversation of conversations) {
    const draft = drafts[conversation.id];
    const matchingDraft = draft?.kernelId === conversation.kernel ? draft : undefined;
    // 正式项目与内核不能被遗留草稿覆盖，草稿时间也不能使活跃对话退回旧位置。
    items.set(conversation.id, {
      sessionId: conversation.id,
      kernelId: conversation.kernel,
      title: conversation.title,
      text: matchingDraft?.text ?? "",
      workspacePath: conversation.workspacePath,
      updatedAt: Math.max(conversation.updatedAt, matchingDraft?.updatedAt ?? 0),
      persisted: true,
    });
  }
  return [...items.values()]
    .filter((item) => item.kernelId === kernel)
    .sort(
      (first, second) =>
        (first.workspacePath ?? "").localeCompare(second.workspacePath ?? "") ||
        second.updatedAt - first.updatedAt,
    );
}
