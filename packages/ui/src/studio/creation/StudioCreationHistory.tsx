import { useState } from "react";
import { Image, Video } from "lucide-react";
import type {
  CreationJob,
  CreationJobStatus,
  CreationKind,
  CreationModel,
  CreationVerification,
} from "@knorvia/services";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { filterCreationJobs, type CreationHistoryFilter } from "./creationHistory.js";
import { creationEntryStates } from "./creationEntries.js";
import type { CreationActionPending, CreationActionRequest } from "./creationActions.js";
import { StudioCreationJobCard } from "./StudioCreationJobCard.js";

export function StudioCreationHistory({
  jobs,
  models,
  draftKind,
  pendingCancel,
  pendingRetry,
  pendingAction,
  verifications,
  actionErrors,
  onCancel,
  onRetry,
  onAction,
}: {
  jobs: readonly CreationJob[];
  models: readonly CreationModel[];
  draftKind: CreationKind;
  pendingCancel: string | null;
  pendingRetry: string | null;
  pendingAction: CreationActionPending | null;
  verifications: Record<string, CreationVerification>;
  actionErrors: Record<string, string>;
  onCancel(job: CreationJob): void;
  onRetry(job: CreationJob): void;
  onAction(request: CreationActionRequest): void;
}) {
  const { intl } = useKnorviaIntl();
  const t = (key: string, values?: Record<string, string>) =>
    intl.formatMessage({ id: `studio.creation.${key}` }, values);
  const [filter, setFilter] = useState<CreationHistoryFilter>({
    kind: "all",
    modelId: "all",
    status: "all",
  });
  const visible = filterCreationJobs(jobs, filter);
  const modelIds = [...new Set(jobs.map((job) => job.modelId))];
  const EmptyIcon = draftKind === "image" ? Image : Video;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-5 md:px-8">
        {jobs.length ? (
          <div
            className="mb-4 flex flex-wrap items-center gap-2 text-ui-sm text-foreground-subtle"
            aria-label={t("historyFilters")}
          >
            <span className="mr-1">{t("history")}</span>
            <label>
              <span className="sr-only">{t("filterKind")}</span>
              <select
                value={filter.kind}
                onChange={(event) =>
                  setFilter((current) => ({
                    ...current,
                    kind: event.target.value as CreationHistoryFilter["kind"],
                  }))
                }
                className="rounded-full border border-border bg-background px-3 py-1.5 text-foreground"
              >
                <option value="all">{t("allKinds")}</option>
                <option value="image">{t("image")}</option>
                <option value="video">{t("video")}</option>
              </select>
            </label>
            <label>
              <span className="sr-only">{t("filterModel")}</span>
              <select
                value={filter.modelId}
                onChange={(event) =>
                  setFilter((current) => ({ ...current, modelId: event.target.value }))
                }
                className="max-w-52 rounded-full border border-border bg-background px-3 py-1.5 text-foreground"
              >
                <option value="all">{t("allModels")}</option>
                {modelIds.map((id) => (
                  <option key={id} value={id}>
                    {models.find((model) => model.id === id)?.name ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t("filterStatus")}</span>
              <select
                value={filter.status}
                onChange={(event) =>
                  setFilter((current) => ({
                    ...current,
                    status: event.target.value as CreationHistoryFilter["status"],
                  }))
                }
                className="rounded-full border border-border bg-background px-3 py-1.5 text-foreground"
              >
                <option value="all">{t("allStatuses")}</option>
                {(
                  [
                    "queued",
                    "running",
                    "succeeded",
                    "failed",
                    "cancelled",
                    "interrupted",
                  ] as CreationJobStatus[]
                ).map((status) => (
                  <option key={status} value={status}>
                    {t(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {visible.length ? (
          <section
            aria-label={t("history")}
            className="grid gap-4 pb-6 sm:grid-cols-2 xl:grid-cols-3"
          >
            {visible.map((job) => {
              const model = models.find((item) => item.id === job.modelId);
              return (
                <StudioCreationJobCard
                  key={job.id}
                  job={job}
                  entries={creationEntryStates(job, model)}
                  pending={pendingAction}
                  pendingCancel={pendingCancel}
                  pendingRetry={pendingRetry}
                  verification={verifications[job.id]}
                  actionError={actionErrors[job.id]}
                  onCancel={onCancel}
                  onRetry={onRetry}
                  onAction={onAction}
                />
              );
            })}
          </section>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center text-foreground-subtle">
            <EmptyIcon className="size-8 opacity-40" aria-hidden="true" />
            <p className="text-ui-base">
              {jobs.length ? t("noHistoryMatches") : t("noJobs", { kind: t(draftKind) })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
