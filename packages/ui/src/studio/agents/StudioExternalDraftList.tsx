import { useEffect, useMemo, useRef, useState } from "react";
import { Folder, MessageSquare, Trash2 } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioAgentStore } from "@/store/studioAgentStore.js";
import type { StudioKernelId } from "../types.js";
import { getPathLeaf } from "@/lib/path.js";
import { useStudioRuntime } from "../runtime/useStudioRuntime.js";
import { studioConversationList, type StudioConversationListItem } from "./conversationList.js";

export function StudioExternalDraftList({
  kernelId,
  selectedSessionId,
  onSelectSession,
}: {
  kernelId: StudioKernelId;
  selectedSessionId: string;
  onSelectSession: (id: string) => void;
}) {
  const { intl, locale } = useKnorviaIntl();
  const confirm = useConfirmDialog();
  const drafts = useStudioAgentStore((state) => state.drafts);
  const runtime = useStudioRuntime();
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleting = useRef(false);
  const latestSelection = useRef({ selectedSessionId, kernelId });
  latestSelection.current = { selectedSessionId, kernelId };
  const deleteDraft = useStudioAgentStore((state) => state.deleteDraft);
  const reconcileConversations = useStudioAgentStore((state) => state.reconcileConversations);
  useEffect(() => {
    if (runtime.overview) reconcileConversations(runtime.overview.conversations);
  }, [reconcileConversations, runtime.overview]);
  const items = useMemo(
    () => studioConversationList(runtime.overview?.conversations ?? [], drafts, kernelId),
    [drafts, kernelId, runtime.overview?.conversations],
  );
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );
  const remove = async (item: StudioConversationListItem) => {
    if (deleting.current || !runtime.ready) return;
    deleting.current = true;
    setDeletingId(item.sessionId);
    setError("");
    const prefix = item.persisted
      ? "studio.agents.conversationDelete"
      : "studio.agents.draftDelete";
    try {
      if (
        !(await confirm({
          title: intl.formatMessage({ id: `${prefix}Title` }),
          description: intl.formatMessage({ id: `${prefix}Description` }),
          confirmLabel: intl.formatMessage({ id: prefix }),
          cancelLabel: intl.formatMessage({ id: "studio.agents.cancel" }),
          confirmVariant: "destructive",
        }))
      )
        return;
      if (item.persisted)
        await runtime.command({ type: "delete", kind: "conversation", id: item.sessionId });
      deleteDraft(item.sessionId);
      // 删除确认期间允许切走；旧操作完成不能把新选择强制导航回一份空白草稿。
      if (
        item.sessionId === latestSelection.current.selectedSessionId &&
        kernelId === latestSelection.current.kernelId
      )
        onSelectSession(crypto.randomUUID());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      deleting.current = false;
      setDeletingId(null);
    }
  };
  if (!items.length)
    return (
      <div
        className="px-3 py-5 text-ui-sm leading-5 text-foreground-subtlest"
        data-testid="studio-external-drafts-empty"
      >
        <p role="status">
          {runtime.error ||
            intl.formatMessage({
              id: !runtime.ready
                ? runtime.service
                  ? "studio.agents.conversationsLoading"
                  : "studio.agents.runtimeUnavailable"
                : "studio.agents.conversationsEmpty",
            })}
        </p>
        {runtime.ready && (
          <p className="mt-1">{intl.formatMessage({ id: "studio.agents.draftListEmpty" })}</p>
        )}
      </div>
    );
  return (
    <div className="min-h-0 space-y-0.5 overflow-y-auto py-1" data-testid="studio-external-drafts">
      {(error || runtime.error) && (
        <p role="alert" className="break-words px-3 py-2 text-ui-sm text-destructive">
          {error || runtime.error}
        </p>
      )}
      {items.map((draft, index) => {
        const title =
          draft.title ||
          draft.text.trim().split(/\r?\n/)[0]?.slice(0, 80) ||
          intl.formatMessage({
            id: draft.persisted
              ? "studio.agents.conversationFallback"
              : "studio.agents.draftFallback",
          });
        const deleteLabel = intl.formatMessage({
          id: draft.persisted ? "studio.agents.conversationDelete" : "studio.agents.draftDelete",
        });
        return (
          <div key={draft.sessionId}>
            {index === 0 ||
            (items[index - 1]?.workspacePath ?? "") !== (draft.workspacePath ?? "") ? (
              <div
                className="mt-2 flex items-center gap-2 px-3 py-1.5 text-ui-sm text-foreground-subtle"
                title={draft.workspacePath}
              >
                <Folder className="size-3.5 shrink-0" />
                <span className="truncate">
                  {draft.workspacePath
                    ? getPathLeaf(draft.workspacePath)
                    : intl.formatMessage({ id: "studio.agents.noProject" })}
                </span>
              </div>
            ) : null}
            <div
              className={cn(
                "group flex min-w-0 items-center gap-1 rounded-lg pr-1",
                selectedSessionId === draft.sessionId ? "bg-selected" : "hover:bg-hover",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onSelectSession(draft.sessionId)}
                aria-current={selectedSessionId === draft.sessionId ? "page" : undefined}
                title={title}
              >
                <span className="flex min-w-0 items-center gap-2 text-ui-base text-foreground">
                  <MessageSquare className="size-3.5 shrink-0 text-foreground-subtle" />
                  <span className="truncate">{title}</span>
                </span>
                <span className="mt-1 block truncate pl-5 text-ui-xs text-foreground-subtlest">
                  {draft.persisted
                    ? locale.startsWith("zh")
                      ? "对话"
                      : "Conversation"
                    : intl.formatMessage({ id: "studio.agents.draftLabel" })}{" "}
                  · {dateFormat.format(draft.updatedAt)}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-foreground-subtle"
                disabled={!runtime.ready || deletingId !== null}
                onClick={() => {
                  void remove(draft);
                }}
                aria-label={`${deleteLabel}: ${title}`}
                title={deleteLabel}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
