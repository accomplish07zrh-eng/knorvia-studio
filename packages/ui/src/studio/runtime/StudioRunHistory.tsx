import { useEffect, useMemo, useSyncExternalStore } from "react";
import { studioRestartDisplay, type StudioRunStepOutcome } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { useStudioRuntime } from "./useStudioRuntime.js";
import { studioRunStepLabel } from "./studioRunStepLabel.js";
import { StudioRunHistoryActions, studioReviewApplying } from "./studioRunHistoryActions.js";
import { studioReviewApplicablePaths } from "./studioWorkspaceDiff.js";
import { StudioWorkspaceReviewCard } from "./StudioWorkspaceReviewCard.js";

export function StudioRunHistory({
  targetId,
  compact = false,
}: {
  targetId: string;
  compact?: boolean;
}) {
  const runtime = useStudioRuntime(targetId);
  const { intl, locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const confirm = useConfirmDialog();
  const actions = useMemo(() => new StudioRunHistoryActions(), [targetId, runtime.service]);
  const { error, busy, review } = useSyncExternalStore(
    actions.subscribe,
    actions.getSnapshot,
    actions.getSnapshot,
  );
  const deliveryLabel = (step: StudioRunStepOutcome | undefined) => {
    if (!step) return "";
    const outcome = intl.formatMessage({ id: `studio.delivery.outcome.${step.outcome}` });
    const restart = step.restart
      ? ` · ${intl.formatMessage({ id: `studio.delivery.restart.${step.restart}` })}`
      : "";
    return ` · ${outcome}${restart}`;
  };
  const states: Record<string, string> = zh
    ? {
        queued: "排队中",
        running: "运行中",
        waiting: "等待回答",
        succeeded: "已完成",
        failed: "失败",
        cancelled: "已停止",
        interrupted: "已中断",
        skipped: "已跳过",
      }
    : {
        queued: "Queued",
        running: "Running",
        waiting: "Waiting for input",
        succeeded: "Completed",
        failed: "Failed",
        cancelled: "Stopped",
        interrupted: "Interrupted",
        skipped: "Skipped",
      };
  const runs = runtime.timeline?.runs ?? [];
  useEffect(() => actions.observeRuns(runs), [actions, runs]);
  const reviewStep = review?.run.outcome?.steps.find((item) => item.stepId === review.stepId);
  const reviewChanges = review?.changes ?? [];
  // 重启后显示：验收记录 + 本次复核读取到的冲突（等价于"当前哈希 ≠ 已接受哈希"）。
  const restartState = review
    ? (studioRestartDisplay({
        acceptances: reviewStep?.acceptance ? [reviewStep.acceptance] : [],
        observedChanges: reviewChanges,
      }) ??
      reviewStep?.restart ??
      null)
    : null;
  return (
    <div className="space-y-2 p-2 text-ui-sm">
      {(compact ? runs.slice(0, 3) : runs).map((run) => (
        <details
          key={run.id}
          data-studio-run-history={run.id}
          className="rounded-lg border border-border px-3 py-2"
          open={!compact || run.state === "failed" || run.state === "interrupted"}
        >
          <summary className="cursor-pointer text-foreground-subtle">
            {run.cancelRequested && ["queued", "running", "waiting"].includes(run.state)
              ? zh
                ? "正在停止"
                : "Stopping"
              : states[run.state]}{" "}
            ·{" "}
            {new Date(run.createdAt).toLocaleTimeString(locale, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </summary>
          {run.error && (
            <p
              role={run.state === "cancelled" ? "status" : "alert"}
              className={`mt-2 whitespace-pre-wrap break-words ${run.state === "cancelled" ? "text-foreground-subtle" : "text-destructive"}`}
            >
              {run.error}
            </p>
          )}
          {run.input && !compact && (
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap">{run.input}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {["queued", "running", "waiting"].includes(run.state) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !runtime.service ||
                  run.cancelRequested ||
                  busy.has(`stop:${run.id}:${run.attempt}`)
                }
                onClick={() =>
                  void actions.action(
                    `stop:${run.id}:${run.attempt}`,
                    () => runtime.command({ type: "cancel", runId: run.id }),
                    true,
                  )
                }
              >
                {run.cancelRequested || busy.has(`stop:${run.id}:${run.attempt}`)
                  ? zh
                    ? "正在停止"
                    : "Stopping"
                  : zh
                    ? "停止"
                    : "Stop"}
              </Button>
            ) : null}
            {["interrupted", "failed"].includes(run.state) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!runtime.service || busy.has(`retry:${run.id}:${run.attempt}`)}
                onClick={() =>
                  void actions.action(`retry:${run.id}:${run.attempt}`, async (isCurrent) => {
                    const uncertain = run.state === "interrupted" && run.resultKnown !== true;
                    const accepted =
                      !uncertain ||
                      (await confirm({
                        title: zh ? "检查后重试未完成步骤" : "Retry unfinished steps",
                        description: zh
                          ? "上次操作可能已经修改文件或产生费用。请检查项目后再重试；已完成步骤会保留。"
                          : "The previous attempt may have changed files or incurred usage. Review the project before retrying. Completed steps are preserved.",
                        confirmLabel: zh ? "已检查，重试" : "Reviewed, retry",
                        cancelLabel: zh ? "取消" : "Cancel",
                      }));
                    if (accepted && isCurrent())
                      await runtime.command({
                        type: "resume",
                        runId: run.id,
                        retryUncertain: uncertain,
                      });
                  })
                }
              >
                {zh ? "重试未完成步骤" : "Retry unfinished steps"}
              </Button>
            ) : null}
          </div>
          {[
            ...new Set([...Object.keys(run.checkpoint.steps), ...(run.workspaceStepIds ?? [])]),
          ].map((stepId) => {
            const step = run.checkpoint.steps[stepId];
            const label = studioRunStepLabel(run, stepId, locale);
            return (
              <div
                key={stepId}
                id={`studio-run-step-${run.id}-${stepId}`}
                className="mt-2 border-t border-border pt-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate" title={label}>
                    {label}
                    {step ? ` · ${states[step.status]}` : ""}
                    {deliveryLabel(run.outcome?.steps.find((item) => item.stepId === stepId))}
                  </span>
                  {run.kind !== "chat" && !["queued", "running", "waiting"].includes(run.state) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!runtime.service}
                      onClick={() =>
                        void actions.openReview(run, stepId, () =>
                          runtime.service!.workspaceChanges({
                            runId: run.id,
                            stepId,
                          }),
                        )
                      }
                    >
                      {zh ? "查看修改" : "Review changes"}
                    </Button>
                  )}
                </div>
                {step?.error && <p className="mt-1 text-destructive">{step.error}</p>}
              </div>
            );
          })}
        </details>
      ))}
      {!runs.length && !compact && (
        <p className="px-3 py-8 text-center text-foreground-subtle">
          {zh ? "暂无运行记录" : "No runs yet"}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Dialog
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open) actions.closeReview();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{zh ? "检查项目修改" : "Review project changes"}</DialogTitle>
            <DialogDescription>
              {zh
                ? "对照当前项目检查差异，再应用所需文件；冲突文件不会被覆盖。"
                : "Review changes before applying them. Files with conflicts will not be overwritten."}
            </DialogDescription>
          </DialogHeader>
          {review?.loading && (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {zh ? "正在读取修改…" : "Loading changes…"}
            </p>
          )}
          {review?.error && (
            <p role="alert" className="whitespace-pre-wrap break-words text-ui-sm text-destructive">
              {review.readAfterApplyFailed &&
                (zh
                  ? "文件已应用。暂时无法重新读取修改，请稍后重试读取。\n"
                  : "The file was applied. Changes could not be reloaded; please retry loading them.\n")}
              {review.error}
            </p>
          )}
          {review && (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={review.loading || Boolean(review.applying)}
              onClick={() =>
                void actions.reloadReview(() =>
                  runtime.service!.workspaceChanges({
                    runId: review.run.id,
                    stepId: review.stepId,
                  }),
                )
              }
            >
              {zh ? "重新读取修改" : "Reload changes"}
            </Button>
          )}
          {!review?.loading && review?.changes?.length === 0 && (
            <p className="text-ui-sm text-foreground-subtle">
              {zh ? "没有文件修改" : "No changed files"}
            </p>
          )}
          {reviewChanges.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={review!.loading || Boolean(review!.applying)}
                onClick={() =>
                  actions.setReviewSelection(studioReviewApplicablePaths(reviewChanges))
                }
              >
                {intl.formatMessage({ id: "studio.delivery.selectAll" })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!review!.selected.length || Boolean(review!.applying)}
                onClick={() => actions.setReviewSelection([])}
              >
                {intl.formatMessage({ id: "studio.delivery.clearSelection" })}
              </Button>
              <span className="text-ui-sm text-foreground-subtle">
                {intl.formatMessage(
                  { id: "studio.delivery.selectedCount" },
                  { count: review!.selected.length },
                )}
              </span>
              <Button
                size="sm"
                disabled={!review!.selected.length || review!.loading || Boolean(review!.applying)}
                onClick={() =>
                  void actions.applyReviewSelection(
                    async (paths) => {
                      await runtime.service!.applyWorkspaceChanges({
                        runId: review!.run.id,
                        stepId: review!.stepId,
                        paths,
                      });
                    },
                    () =>
                      runtime.service!.workspaceChanges({
                        runId: review!.run.id,
                        stepId: review!.stepId,
                      }),
                  )
                }
              >
                {intl.formatMessage(
                  { id: "studio.delivery.batchApply" },
                  { count: review!.selected.length },
                )}
              </Button>
            </div>
          )}
          {restartState && (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {intl.formatMessage({ id: `studio.delivery.restart.${restartState}` })}
            </p>
          )}
          {review?.changes?.map((change) => (
            <StudioWorkspaceReviewCard
              key={change.path}
              change={change}
              zh={zh}
              busy={review.loading || Boolean(review.applying)}
              applying={studioReviewApplying(review, change.path)}
              selected={review.selected.includes(change.path)}
              onToggle={() => actions.toggleReviewSelection(change.path)}
              onApply={() =>
                void actions.applyReview(
                  change.path,
                  () =>
                    runtime.service!.applyWorkspaceChanges({
                      runId: review.run.id,
                      stepId: review.stepId,
                      paths: [change.path],
                    }),
                  () =>
                    runtime.service!.workspaceChanges({
                      runId: review.run.id,
                      stepId: review.stepId,
                    }),
                )
              }
            />
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
