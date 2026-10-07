// SPDX-License-Identifier: Apache-2.0
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type {
  IStudioRuntimeService,
  StudioReviewComment,
  StudioReviewDraft,
  StudioWorkspaceChange,
} from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { WorkspaceReviewController } from "./workspaceReviewController.js";

const editStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem: (key: string, value: string) => localStorage.setItem(key, value),
};

export interface WorkspaceFeedbackView {
  comments: StudioReviewComment[];
  controller: WorkspaceReviewController;
  disabled: boolean;
  renderComment(comment: StudioReviewComment): ReactNode;
}
export function StudioWorkspaceFeedback({
  service,
  targetId,
  runId,
  stepId,
  zh,
  children,
  onPersistenceRisk,
  observedDraft,
  changes,
}: {
  service: IStudioRuntimeService;
  observedDraft?: StudioReviewDraft;
  changes?: StudioWorkspaceChange[];
  targetId: string;
  runId: string;
  stepId: string;
  zh: boolean;
  children: (view: WorkspaceFeedbackView) => ReactNode;
  onPersistenceRisk: (risk: boolean) => void;
}) {
  const controller = useMemo(
    () => new WorkspaceReviewController(service, targetId, runId, stepId, editStorage),
    [service, targetId, runId, stepId],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const confirm = useConfirmDialog();
  useEffect(() => controller.observe(observedDraft), [controller, observedDraft]);
  useEffect(() => {
    controller.activate();
    return () => controller.deactivate();
  }, [controller]);
  useEffect(() => {
    onPersistenceRisk(Boolean(state.cacheError) && Object.keys(state.edits).length > 0);
    return () => onPersistenceRisk(false);
  }, [onPersistenceRisk, state.cacheError, state.edits]);
  const discard = (id: string) =>
    void (async () => {
      if (
        await confirm({
          title: zh ? "丢弃这条本机编辑？" : "Discard this local edit?",
          description: zh
            ? "只丢弃这份尚未保存的本机文字。"
            : "This removes only this device's unsaved text.",
          confirmLabel: zh ? "丢弃本机编辑" : "Discard local edit",
          cancelLabel: zh ? "取消" : "Cancel",
        })
      )
        controller.discard(id);
    })();
  const renderComment = (comment: StudioReviewComment) => (
    <div
      className="my-2 rounded-lg border border-border bg-background p-3 text-ui-sm"
      data-review-comment={comment.id}
    >
      <p>
        {comment.anchor.path} ·{" "}
        {comment.anchor.side === "old" ? (zh ? "原文件" : "Original") : zh ? "修改后" : "Changed"}{" "}
        {comment.anchor.startLine}–{comment.anchor.endLine}
      </p>
      <Textarea
        aria-label={zh ? "行内批注" : "Inline comment"}
        className="mt-2"
        maxLength={1000}
        disabled={state.busy || Boolean(state.cacheBlocked)}
        value={state.edits[comment.id]?.body ?? comment.body}
        onChange={(event) => controller.edit(comment.id, event.target.value)}
      />
      {state.edits[comment.id] && state.edits[comment.id]?.body !== comment.body && (
        <p className="mt-2 whitespace-pre-wrap break-words text-foreground-subtle">
          {zh ? "Host 已保存的正文：" : "Host saved text: "}
          {comment.body || (zh ? "（空）" : "(empty)")}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={state.busy || Boolean(state.cacheBlocked)}
          onClick={controller.save}
        >
          {zh ? "保存批注" : "Save comments"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={state.busy || Boolean(state.edits[comment.id])}
          onClick={() => controller.remove(comment.id)}
        >
          {zh ? "删除" : "Delete"}
        </Button>
        {state.edits[comment.id] && (
          <Button
            size="sm"
            variant="outline"
            disabled={state.busy}
            onClick={() => discard(comment.id)}
          >
            {zh ? "丢弃本机编辑" : "Discard local edit"}
          </Button>
        )}
        <span role="status">
          {state.edits[comment.id]
            ? zh
              ? "本机草稿，尚未保存到 Host"
              : "Local draft; not saved to Host"
            : zh
              ? "已保存到 Host"
              : "Saved to Host"}
        </span>
      </div>
    </div>
  );
  return (
    <>
      <div
        className="space-y-2 rounded-lg border border-border p-3 text-ui-sm"
        data-workspace-feedback=""
      >
        <p>
          {zh
            ? "选择差异行添加批注，保存后确认摘要并回传原 Agent。"
            : "Select diff lines to comment, then confirm the summary and return it to the original Agent."}
        </p>
        {(state.error || state.cacheError) && (
          <p role="alert" className="text-destructive">
            {state.error ?? state.cacheError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={state.busy} onClick={controller.reload}>
            {zh ? "重新读取批注" : "Reload comments"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={state.busy || !state.draft?.comments.length}
            onClick={controller.prepare}
          >
            {zh ? "预览反馈摘要" : "Preview feedback"}
          </Button>
        </div>
        {state.draft?.preview && (
          <>
            <pre
              className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-ui-sm"
              data-review-summary=""
            >
              {state.draft.preview.summary}
            </pre>
            <Button
              size="sm"
              disabled={state.busy || Object.keys(state.edits).length > 0}
              onClick={async () => {
                const draft = state.draft!;
                if (
                  await confirm({
                    title: zh ? "确认回传原 Agent" : "Return to original Agent?",
                    description: `${draft.kernel} · ${draft.stepId}\n${draft.preview!.summary}`,
                    confirmLabel: zh ? "确认并发送" : "Confirm and send",
                    cancelLabel: zh ? "取消" : "Cancel",
                  })
                )
                  controller.send();
              }}
            >
              {zh ? "确认回传原 Agent" : "Return to original Agent"}
            </Button>
          </>
        )}
        {state.draft?.lastDelivery && (
          <p role="status" data-review-delivery="">
            {zh ? "反馈运行" : "Feedback run"}: {state.draft.lastDelivery.runId} ·{" "}
            {state.draft.lastDelivery.state ?? (zh ? "正在读取状态" : "Loading status")}
            {state.draft.lastDelivery.error ? ` · ${state.draft.lastDelivery.error}` : ""}
          </p>
        )}
      </div>
      {state.draft?.comments
        .filter(
          (comment) => changes && !changes.some((change) => change.path === comment.anchor.path),
        )
        .map((comment) => (
          <div key={comment.id}>
            <p role="status">
              {zh
                ? "此文件已不在当前差异中；旧批注仍保留。"
                : "This file is absent from the current diff; the previous comment is retained."}
            </p>
            {renderComment(comment)}
          </div>
        ))}
      {Object.entries(state.edits)
        .filter(([id]) => !state.draft?.comments.some((comment) => comment.id === id))
        .map(([id, edit]) => (
          <div key={id} className="rounded-lg border border-border p-3 text-ui-sm">
            <p>
              {zh
                ? "原批注已删除；尚未保存的本机文字仍保留，可以复制或明确丢弃。"
                : "The original comment was deleted; your local text is retained for copying or explicit discard."}
            </p>
            <Textarea
              aria-label={zh ? "已删除批注的本机草稿" : "Local draft for deleted comment"}
              readOnly
              value={edit.body}
            />
            <Button size="sm" variant="outline" disabled={state.busy} onClick={() => discard(id)}>
              {zh ? "丢弃本机编辑" : "Discard local edit"}
            </Button>
          </div>
        ))}
      {children({
        controller,
        comments: state.draft?.comments ?? [],
        disabled: state.busy || !state.ready || Boolean(state.cacheError),
        renderComment,
      })}
    </>
  );
}
