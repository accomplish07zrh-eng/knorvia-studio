// SPDX-License-Identifier: Apache-2.0

import {
  collectVisibleKnorviaBackgroundTaskControlItems,
  getKnorviaBackgroundTaskControlItemElapsedMs,
  isActiveKnorviaBackgroundTaskControlItem,
  parseKnorviaBackgroundTaskControlItems,
  type KnorviaBackgroundTaskControlItem,
  type KnorviaBackgroundTaskControlStatus,
} from "./background-task-controls.js";

const BASH_KIND = "bash" as const;

export type KnorviaBackgroundBashJobStatus = KnorviaBackgroundTaskControlStatus;

export type KnorviaBackgroundBashJob = KnorviaBackgroundTaskControlItem & {
  readonly taskKind: typeof BASH_KIND;
};

const DEFAULT_VISIBLE_MS = 30_000;

function retainBash(payload: unknown): KnorviaBackgroundBashJob[] {
  return parseKnorviaBackgroundTaskControlItems(payload).flatMap((item) =>
    item.taskKind === BASH_KIND ? [item as KnorviaBackgroundBashJob] : [],
  );
}

export const parseKnorviaBackgroundBashJobs = (payload: unknown): KnorviaBackgroundBashJob[] =>
  retainBash(payload);

export const isActiveKnorviaBackgroundBashJob = (entry: KnorviaBackgroundBashJob): boolean =>
  isActiveKnorviaBackgroundTaskControlItem(entry);

export const getKnorviaBackgroundBashJobElapsedMs = (
  entry: KnorviaBackgroundBashJob,
  clock: number = Date.now(),
): number => getKnorviaBackgroundTaskControlItemElapsedMs(entry, clock);

export const collectVisibleKnorviaBackgroundBashJobs = (
  entries: readonly KnorviaBackgroundBashJob[],
  clock: number = Date.now(),
  thresholdMs: number = DEFAULT_VISIBLE_MS,
): Array<KnorviaBackgroundBashJob & { elapsedMs: number }> =>
  collectVisibleKnorviaBackgroundTaskControlItems(entries, clock, thresholdMs) as Array<
    KnorviaBackgroundBashJob & { elapsedMs: number }
  >;
