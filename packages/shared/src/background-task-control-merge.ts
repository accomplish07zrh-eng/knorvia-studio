import type { KnorviaBackgroundTaskControlItem } from "./background-task-controls.js";

export function mergeKnorviaBackgroundTaskControlItems(
  current: readonly KnorviaBackgroundTaskControlItem[],
  updates: readonly KnorviaBackgroundTaskControlItem[],
): KnorviaBackgroundTaskControlItem[] {
  const jobsById = new Map(current.map((job) => [job.jobId, job] as const));
  for (const job of updates) {
    jobsById.set(job.jobId, job);
  }
  return Array.from(jobsById.values());
}
