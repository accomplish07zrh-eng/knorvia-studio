import type { CreationJob, CreationJobStatus, CreationKind } from "@knorvia/services";

export interface CreationHistoryFilter {
  kind: CreationKind | "all";
  modelId: string;
  status: CreationJobStatus | "all";
}

/** Filters affect presentation only; the Host remains the owner of all job records. */
export function filterCreationJobs(jobs: readonly CreationJob[], filter: CreationHistoryFilter) {
  return jobs.filter((job) =>
    (filter.kind === "all" || job.kind === filter.kind) &&
    (filter.modelId === "all" || job.modelId === filter.modelId) &&
    (filter.status === "all" || job.status === filter.status));
}
