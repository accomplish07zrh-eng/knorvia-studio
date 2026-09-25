import type { CreationJob, CreationVerification } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { cn } from "@/components/lib/utils.js";
import {
  creationDisabledEntries,
  creationHistoryDetail,
  creationReferenceOutput,
  creationTimeText,
  creationVerificationView,
  type CreationEntryKey,
  type CreationEntryStates,
} from "./creationEntries.js";
import type { CreationActionPending, CreationActionRequest } from "./creationActions.js";
import { StudioCreationOutput } from "./StudioCreationOutput.js";

type Translate = (key: string, values?: Record<string, string>) => string;

/** 快照与来源关系：只显示记录里确实存在的白名单字段，缺失时明确显示不可还原。 */
function CreationHistoryDetails({ job, t }: { job: CreationJob; t: Translate }) {
  const detail = creationHistoryDetail(job);
  return (
    <details className="rounded-lg border border-border/60 bg-surface/40 px-2.5 py-2">
      <summary className="cursor-pointer text-ui-xs text-foreground-subtle">
        {t("detailsSummary")}
      </summary>
      <div className="mt-2 space-y-1.5 text-ui-xs text-foreground-subtle">
        <p className="font-medium text-foreground">
          {t(detail.reconstructible ? "snapshotReconstructible" : "snapshotNotReconstructible")}
        </p>
        {detail.reconstructible ? null : (
          <>
            <p>{t("snapshotMissingNote")}</p>
            {detail.missing.length ? (
              <p>{t("snapshotMissingFields", { fields: detail.missing.join(" · ") })}</p>
            ) : null}
          </>
        )}
        {detail.snapshot.length ? (
          <dl className="space-y-1">
            <dt className="text-foreground">{t("snapshotTitle")}</dt>
            {detail.snapshot.map((row) => (
              <div key={row.label} className="flex gap-2">
                <dt className="shrink-0">{t(row.label)}</dt>
                <dd className="min-w-0 break-words text-foreground">
                  {row.messageId ? t(row.messageId) : row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {detail.provenance.length ? (
          <dl className="space-y-1">
            <dt className="text-foreground">{t("provenanceTitle")}</dt>
            {detail.provenance.map((row) => (
              <div key={row.label} className="flex gap-2">
                <dt className="shrink-0">{t(row.label)}</dt>
                <dd className="min-w-0 break-all text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </details>
  );
}

export function StudioCreationJobCard({
  job,
  entries,
  pending,
  pendingCancel,
  pendingRetry,
  verification,
  actionError,
  onCancel,
  onRetry,
  onAction,
}: {
  job: CreationJob;
  entries: CreationEntryStates;
  pending: CreationActionPending | null;
  pendingCancel: string | null;
  pendingRetry: string | null;
  verification: CreationVerification | undefined;
  actionError: string | undefined;
  onCancel(job: CreationJob): void;
  onRetry(job: CreationJob): void;
  onAction(request: CreationActionRequest): void;
}) {
  const { intl } = useKnorviaIntl();
  const t: Translate = (key, values) =>
    intl.formatMessage({ id: `studio.creation.${key}` }, values);
  const output = creationReferenceOutput(job);
  const unknown = job.status === "interrupted" || job.status === "cancelled";
  const busy = pending?.jobId === job.id;
  const view = verification ? creationVerificationView(verification) : null;
  // 核验只在结果未知时才有意义，其他状态直接不渲染该入口。
  const actions: Array<{ key: CreationEntryKey; onClick: () => void }> = [
    { key: "reuse", onClick: () => onAction({ action: "reuse", job }) },
    {
      key: "reference",
      onClick: () => {
        if (output) onAction({ action: "reference", job, output });
      },
    },
    { key: "variant", onClick: () => onAction({ action: "variant", job }) },
    ...(unknown
      ? [{ key: "verify" as CreationEntryKey, onClick: () => onAction({ action: "verify", job }) }]
      : []),
  ];
  // 只针对真正渲染出来的入口给不可用原因，避免拿别的状态说明来凑数。
  const visibleEntries = Object.fromEntries(
    actions.map((item) => [item.key, entries[item.key]]),
  ) as CreationEntryStates;
  const blocked = creationDisabledEntries(visibleEntries);
  const actionTone: Record<CreationEntryKey, "ghost" | "outline" | "secondary"> = {
    reuse: "ghost",
    reference: "outline",
    variant: "outline",
    verify: "secondary",
  };

  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-card-border bg-card shadow-xs">
      <StudioCreationOutput job={job} />
      <div className="space-y-2.5 p-3.5">
        <p className="line-clamp-2 text-ui-base font-medium text-foreground" title={job.prompt}>
          {job.prompt}
        </p>
        <div className="flex items-center gap-2 text-ui-sm text-foreground-subtle">
          <span role="status">{t(job.status)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={job.createdAt}>{creationTimeText(job.createdAt)}</time>
        </div>
        {job.error ? (
          <p
            className={cn(
              "text-ui-sm",
              job.status === "failed" ? "text-destructive" : "text-foreground-subtle",
            )}
            role={job.status === "failed" ? "alert" : "status"}
          >
            {job.error}
          </p>
        ) : null}
        {unknown || job.checkedAt ? (
          <p className="text-ui-xs text-foreground-subtle">
            {job.checkedAt
              ? t("checkedAt", { time: creationTimeText(job.checkedAt) })
              : t("checkedNever")}
          </p>
        ) : null}
        {view ? (
          <p
            className={cn(
              "text-ui-xs",
              view.tone === "failure" ? "text-destructive" : "text-foreground",
            )}
            role="status"
          >
            {t(view.label)}
            {view.message && view.message !== job.error ? ` · ${view.message}` : ""}
          </p>
        ) : null}
        {actionError ? (
          <p className="text-ui-sm text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}
        {job.referenceName || job.firstFrameName || job.lastFrameName ? (
          <p
            className="truncate text-ui-xs text-foreground-subtle"
            title={[job.referenceName, job.firstFrameName, job.lastFrameName]
              .filter(Boolean)
              .join(" · ")}
          >
            {[job.referenceName, job.firstFrameName, job.lastFrameName].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {job.status === "queued" || job.status === "running" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pendingCancel === job.id || busy}
              onClick={() => onCancel(job)}
            >
              {t("cancel")}
            </Button>
          ) : null}
          {job.status === "failed" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pendingRetry === job.id || busy}
              title={t("retryCostHint")}
              onClick={() => onRetry(job)}
            >
              {t("retryJob")}
            </Button>
          ) : null}
          {actions.map((item) => {
            const state = entries[item.key];
            return (
              <Button
                key={item.key}
                variant={actionTone[item.key]}
                size="sm"
                disabled={!state.enabled || busy}
                title={state.reason ? t(state.reason) : state.note ? t(state.note) : undefined}
                aria-label={
                  state.enabled ? undefined : `${t(state.label)}：${t(state.reason as string)}`
                }
                onClick={item.onClick}
              >
                {t(state.label)}
              </Button>
            );
          })}
        </div>
        {blocked.length ? (
          <p className="text-ui-xs text-foreground-subtle">
            {t("disabledActions", {
              items: blocked
                .map(
                  (group) =>
                    `${group.labels.map((label) => t(label)).join("／")}：${t(group.reason)}`,
                )
                .join(" · "),
            })}
          </p>
        ) : null}
        <CreationHistoryDetails job={job} t={t} />
      </div>
    </article>
  );
}
