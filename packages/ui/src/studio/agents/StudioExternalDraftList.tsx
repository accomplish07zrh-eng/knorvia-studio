import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioAgentStore } from "@/store/studioAgentStore.js";
import type { StudioKernelId } from "../types.js";
import { getPathLeaf } from "@/lib/path.js";
import { formatTaskRelativeTime } from "@/lib/taskListItemPresentation.js";
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
  const { intl } = useKnorviaIntl();
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
  // 侧栏只列 Host 已受理的会话（specs/knorvia-ui-polish-20261008.md）；未发送草稿不再列出，
  // 内容仍保存在草稿存储里，切回此内核时由导航恢复到输入框。
  const items = useMemo(
    () =>
      studioConversationList(runtime.overview?.conversations ?? [], drafts, kernelId).filter(
        (item) => item.persisted,
      ),
    [drafts, kernelId, runtime.overview?.conversations],
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
  // 行样式与 Knorvia 任务行同一配方：单行圆角、选中纸片、悬停显示删除、右侧相对时间；
  // 分组标题沿用侧栏分区标题的灰字样式。
  return (
    <div className="min-h-0 overflow-y-auto py-1" data-testid="studio-external-drafts">
      <div className="flex min-w-0 items-center pr-3 pb-1 pl-3">
        <span className="text-ui-xs text-foreground-subtle">
          {intl.formatMessage({ id: "studio.chatList" })}
        </span>
      </div>
      {(error || runtime.error) && (
        <p role="alert" className="break-words px-3 py-2 text-ui-sm text-destructive">
          {error || runtime.error}
        </p>
      )}
      <ul className="space-y-0.5">
        {items.map((item, index) => {
          const title =
            item.title ||
            item.text.trim().split(/\r?\n/)[0]?.slice(0, 80) ||
            intl.formatMessage({ id: "studio.agents.conversationFallback" });
          const deleteLabel = intl.formatMessage({ id: "studio.agents.conversationDelete" });
          const selected = selectedSessionId === item.sessionId;
          return (
            <li key={item.sessionId}>
              {index === 0 ||
              (items[index - 1]?.workspacePath ?? "") !== (item.workspacePath ?? "") ? (
                <div
                  className="flex h-7 min-w-0 items-center px-2.5 text-ui-base font-medium text-foreground-subtlest"
                  title={item.workspacePath}
                  data-testid="studio-external-group"
                >
                  <span className="min-w-0 truncate">
                    {item.workspacePath
                      ? getPathLeaf(item.workspacePath)
                      : intl.formatMessage({ id: "studio.agents.noProject" })}
                  </span>
                </div>
              ) : null}
              <div
                role="button"
                tabIndex={0}
                data-testid="studio-external-row"
                aria-current={selected ? "page" : undefined}
                title={title}
                onClick={() => onSelectSession(item.sessionId)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectSession(item.sessionId);
                  }
                }}
                className={cn(
                  "group/task-item flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-1 pl-2.5 transition-[background-color,border-color,box-shadow]",
                  selected ? "bg-selected" : "hover:bg-surface-hover",
                )}
              >
                <span className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-ui-base text-foreground">
                  {title}
                </span>
                <span className="mr-0.5 shrink-0 text-ui-sm text-foreground-subtle group-hover/task-item:hidden group-focus-within/task-item:hidden">
                  {formatTaskRelativeTime(item.updatedAt, intl)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden size-6 text-foreground-subtle group-hover/task-item:inline-flex group-focus-within/task-item:inline-flex"
                  disabled={!runtime.ready || deletingId !== null}
                  onClick={(event) => {
                    event.stopPropagation();
                    void remove(item);
                  }}
                  aria-label={`${deleteLabel}: ${title}`}
                  title={deleteLabel}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
