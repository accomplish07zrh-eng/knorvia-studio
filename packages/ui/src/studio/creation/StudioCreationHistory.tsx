import { useState } from "react";
import { Image, Video } from "lucide-react";
import type { CreationJob, CreationJobStatus, CreationKind, CreationModel } from "@knorvia/services";
import { Button } from "@/components/ui/button.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { filterCreationJobs, type CreationHistoryFilter } from "./creationHistory.js";
import { StudioCreationOutput } from "./StudioCreationOutput.js";

export function StudioCreationHistory({
  jobs, models, draftKind, pendingCancel, pendingRetry, onCancel, onRetry, onReuse,
}: {
  jobs: readonly CreationJob[];
  models: readonly CreationModel[];
  draftKind: CreationKind;
  pendingCancel: string | null;
  pendingRetry: string | null;
  onCancel(job: CreationJob): void;
  onRetry(job: CreationJob): void;
  onReuse(job: CreationJob): void;
}) {
  const { intl } = useKnorviaIntl();
  const t = (key: string, values?: Record<string, string>) =>
    intl.formatMessage({ id: `studio.creation.${key}` }, values);
  const [filter, setFilter] = useState<CreationHistoryFilter>({
    kind: "all", modelId: "all", status: "all",
  });
  const visible = filterCreationJobs(jobs, filter);
  const modelIds = [...new Set(jobs.map((job) => job.modelId))];
  const EmptyIcon = draftKind === "image" ? Image : Video;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-5 md:px-8">
        {jobs.length ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-ui-sm text-foreground-subtle" aria-label={t("historyFilters")}>
            <span className="mr-1">{t("history")}</span>
            <label>
              <span className="sr-only">{t("filterKind")}</span>
              <select value={filter.kind} onChange={(event) => setFilter((current) => ({ ...current, kind: event.target.value as CreationHistoryFilter["kind"] }))}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-foreground">
                <option value="all">{t("allKinds")}</option>
                <option value="image">{t("image")}</option>
                <option value="video">{t("video")}</option>
              </select>
            </label>
            <label>
              <span className="sr-only">{t("filterModel")}</span>
              <select value={filter.modelId} onChange={(event) => setFilter((current) => ({ ...current, modelId: event.target.value }))}
                className="max-w-52 rounded-full border border-border bg-background px-3 py-1.5 text-foreground">
                <option value="all">{t("allModels")}</option>
                {modelIds.map((id) => <option key={id} value={id}>{models.find((model) => model.id === id)?.name ?? id}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">{t("filterStatus")}</span>
              <select value={filter.status} onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value as CreationHistoryFilter["status"] }))}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-foreground">
                <option value="all">{t("allStatuses")}</option>
                {(["queued", "running", "succeeded", "failed", "cancelled", "interrupted"] as CreationJobStatus[])
                  .map((status) => <option key={status} value={status}>{t(status)}</option>)}
              </select>
            </label>
          </div>
        ) : null}
        {visible.length ? (
          <section aria-label={t("history")} className="grid gap-4 pb-6 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((job) => (
              <article key={job.id} className="min-w-0 overflow-hidden rounded-xl border border-card-border bg-card shadow-xs">
                <StudioCreationOutput job={job} />
                <div className="space-y-2.5 p-3.5">
                  <p className="line-clamp-2 text-ui-base font-medium text-foreground" title={job.prompt}>{job.prompt}</p>
                  <div className="flex items-center gap-2 text-ui-sm text-foreground-subtle">
                    <span role="status">{t(job.status)}</span><span aria-hidden="true">·</span>
                    <time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString()}</time>
                  </div>
                  {job.error ? <p className="text-ui-sm text-destructive" role="alert">{job.error}</p> : null}
                  {(job.referenceName || job.firstFrameName || job.lastFrameName) ? (
                    <p className="truncate text-ui-xs text-foreground-subtle" title={[job.referenceName, job.firstFrameName, job.lastFrameName].filter(Boolean).join(" · ")}>
                      {[job.referenceName, job.firstFrameName, job.lastFrameName].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    {job.status === "queued" || job.status === "running" ? (
                      <Button variant="outline" size="sm" disabled={pendingCancel === job.id}
                        onClick={() => onCancel(job)}>{t("cancel")}</Button>
                    ) : null}
                    {job.status === "failed" ? (
                      <Button variant="outline" size="sm" disabled={pendingRetry === job.id}
                        title={t("retryCostHint")} onClick={() => onRetry(job)}>{t("retryJob")}</Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => onReuse(job)}>{t("reuse")}</Button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center text-foreground-subtle">
            <EmptyIcon className="size-8 opacity-40" aria-hidden="true" />
            <p className="text-ui-base">{jobs.length ? t("noHistoryMatches") : t("noJobs", { kind: t(draftKind) })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
