// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30.
// Reimplemented calendar/cleanup adapter; source review remains open.

import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "@knorvia/contracts";

export const LOG_RETENTION_DAYS = 7;
export const LOG_CLEANUP_STARTUP_DELAY_MS = 60_000;
const FIRST_KEPT_DAY = 1;
const LOG_PREFIX = "knorvia-";
const LOG_EXTENSION = ".jsonl";
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export interface LogRetentionCleanupOptions {
  logDir: string;
  logger?: Logger;
  now?: Date;
  retentionDays?: number;
}

export interface LogRetentionCleanupResult {
  cutoffDate: string;
  deletedFiles: string[];
  failedFiles: string[];
  retentionDays: number;
  scannedFiles: number;
  status: "completed" | "failed";
}

export interface LogRetentionTimer {
  unref?(): void;
}

export interface LogRetentionScheduleOptions extends Omit<LogRetentionCleanupOptions, "now"> {
  delayMs?: number;
  now?: () => Date;
  setTimeout?: (callback: () => void, delayMs: number) => LogRetentionTimer;
}

function daysToKeep(input: number | undefined): number {
  return input === undefined || !Number.isFinite(input)
    ? LOG_RETENTION_DAYS
    : Math.max(FIRST_KEPT_DAY, Math.trunc(input));
}

export function formatLocalLogDate(date: Date): string {
  const calendar = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  return calendar.map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0")).join("-");
}

function logCalendarDate(name: string): string | undefined {
  if (!name.startsWith(LOG_PREFIX) || !name.endsWith(LOG_EXTENSION)) return undefined;
  const date = name.slice(LOG_PREFIX.length, -LOG_EXTENSION.length);
  if (!DATE_SHAPE.test(date)) return undefined;
  const [year, month, day] = date.split("-").map(Number);
  const calendar = new Date(year!, month! - 1, day!);
  return formatLocalLogDate(calendar) === date ? date : undefined;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function failure(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error), name: "UnknownError" };
  return { code: (error as NodeJS.ErrnoException).code, message: error.message, name: error.name };
}

function reportFailure(
  options: LogRetentionCleanupOptions,
  result: LogRetentionCleanupResult,
  error: unknown,
  fileName?: string,
): void {
  const detail = {
    cutoffDate: result.cutoffDate,
    error: failure(error),
    event: fileName === undefined ? "log.retention.cleanup.failed" : "log.retention.delete.failed",
    ...(fileName === undefined ? {} : { fileName }),
    logDir: options.logDir,
    module: "adapters.logging",
    retentionDays: result.retentionDays,
    status: "failed" as const,
  };
  options.logger?.warn(
    fileName === undefined ? "Log retention cleanup failed" : "Log retention file delete failed",
    detail,
  );
}

export async function cleanupLogRetention(
  options: LogRetentionCleanupOptions,
): Promise<LogRetentionCleanupResult> {
  const retentionDays = daysToKeep(options.retentionDays);
  const now = options.now ?? new Date();
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - retentionDays + FIRST_KEPT_DAY,
  );
  const result: LogRetentionCleanupResult = {
    cutoffDate: formatLocalLogDate(cutoff),
    deletedFiles: [],
    failedFiles: [],
    retentionDays,
    scannedFiles: 0,
    status: "completed",
  };
  let directory;
  try {
    directory = await readdir(options.logDir, { withFileTypes: true });
  } catch (error) {
    if (!isMissing(error)) {
      result.status = "failed";
      reportFailure(options, result, error);
    }
    return result;
  }
  for (const entry of directory) {
    if (!entry.isFile()) continue;
    const date = logCalendarDate(entry.name);
    if (date === undefined) continue;
    result.scannedFiles++;
    if (date >= result.cutoffDate) continue;
    try {
      await unlink(join(options.logDir, entry.name));
      result.deletedFiles.push(entry.name);
    } catch (error) {
      if (isMissing(error)) continue;
      result.failedFiles.push(entry.name);
      result.status = "failed";
      reportFailure(options, result, error, entry.name);
    }
  }
  options.logger?.debug("Log retention cleanup completed", {
    cutoffDate: result.cutoffDate,
    deletedFileCount: result.deletedFiles.length,
    event: "log.retention.cleanup.completed",
    failedFileCount: result.failedFiles.length,
    logDir: options.logDir,
    module: "adapters.logging",
    retentionDays,
    scannedFiles: result.scannedFiles,
    status: result.status,
  });
  return result;
}

export function scheduleLogRetentionCleanup(
  options: LogRetentionScheduleOptions,
): LogRetentionTimer {
  const delayMs = options.delayMs ?? LOG_CLEANUP_STARTUP_DELAY_MS;
  const retentionDays = daysToKeep(options.retentionDays);
  options.logger?.info("Log retention cleanup scheduled", {
    delayMs,
    event: "log.retention.cleanup.scheduled",
    logDir: options.logDir,
    module: "adapters.logging",
    retentionDays,
    status: "waiting",
  });
  const callback = () => {
    void cleanupLogRetention({
      logDir: options.logDir,
      logger: options.logger,
      retentionDays,
      now: options.now?.() ?? new Date(),
    });
  };
  const register = options.setTimeout ?? ((fn: () => void, delay: number) => setTimeout(fn, delay));
  const timer = register(callback, delayMs);
  timer.unref?.();
  return timer;
}
