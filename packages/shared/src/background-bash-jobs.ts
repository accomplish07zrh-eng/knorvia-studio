import {
  collectVisibleKnorviaBackgroundTaskControlItems,
  getKnorviaBackgroundTaskControlItemElapsedMs,
  isActiveKnorviaBackgroundTaskControlItem,
  parseKnorviaBackgroundTaskControlItems,
  type KnorviaBackgroundTaskControlItem,
  type KnorviaBackgroundTaskControlStatus,
} from "./background-task-controls.js";

export type KnorviaBackgroundBashJobStatus = KnorviaBackgroundTaskControlStatus;
export type KnorviaBackgroundBashJob = KnorviaBackgroundTaskControlItem & {
  taskKind: "bash";
};

export function parseKnorviaBackgroundBashJobs(value: unknown): KnorviaBackgroundBashJob[] {
  return parseKnorviaBackgroundTaskControlItems(value).filter(isBackgroundBashJob);
}

export function isActiveKnorviaBackgroundBashJob(job: KnorviaBackgroundBashJob): boolean {
  return isActiveKnorviaBackgroundTaskControlItem(job);
}

export function getKnorviaBackgroundBashJobElapsedMs(
  job: KnorviaBackgroundBashJob,
  now = Date.now(),
): number {
  return getKnorviaBackgroundTaskControlItemElapsedMs(job, now);
}

export function collectVisibleKnorviaBackgroundBashJobs(
  jobs: readonly KnorviaBackgroundBashJob[],
  now = Date.now(),
  thresholdMs = 30_000,
): Array<KnorviaBackgroundBashJob & { elapsedMs: number }> {
  return collectVisibleKnorviaBackgroundTaskControlItems(jobs, now, thresholdMs) as Array<
    KnorviaBackgroundBashJob & { elapsedMs: number }
  >;
}

function isBackgroundBashJob(job: KnorviaBackgroundTaskControlItem): job is KnorviaBackgroundBashJob {
  return job.taskKind === "bash";
}
