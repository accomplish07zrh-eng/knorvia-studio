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
const MODULE_TAG = "adapters.logging";
/** 年 4 位、月/日 2 位：宽度表与 `formatLocalLogDate` 的拼接顺序一一对应。 */
const DATE_WIDTHS = [4, 2, 2] as const;

/** 清理入参：目录必填，logger/now/retentionDays 均可省略。 */
export interface LogRetentionCleanupOptions {
  logger?: Logger;
  logDir: string;
  retentionDays?: number;
  now?: Date;
}

/** 清理结果：cutoff 与扫描/删除/失败清单，status 表示整轮是否失败。 */
export interface LogRetentionCleanupResult {
  status: "completed" | "failed";
  retentionDays: number;
  cutoffDate: string;
  deletedFiles: string[];
  failedFiles: string[];
  scannedFiles: number;
}

export interface LogRetentionTimer {
  unref?(): void;
}

/** 排程入参：在清理入参基础上追加延时、时间源与定时器注册函数。 */
export interface LogRetentionScheduleOptions extends Omit<LogRetentionCleanupOptions, "now"> {
  now?: () => Date;
  delayMs?: number;
  setTimeout?: (callback: () => void, delayMs: number) => LogRetentionTimer;
}

function daysToKeep(input: number | undefined): number {
  if (input === undefined || !Number.isFinite(input)) return LOG_RETENTION_DAYS;
  return Math.max(FIRST_KEPT_DAY, Math.trunc(input));
}

/** 本地日历日期：`YYYY-MM-DD`，宽度按 DATE_WIDTHS 补零。 */
export function formatLocalLogDate(date: Date): string {
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  return parts.map((value, index) => String(value).padStart(DATE_WIDTHS[index]!, "0")).join("-");
}

/** 从日志文件名取出可用的日期；形状不对或日历回卷（如 02-30）都算无效。 */
function logCalendarDate(name: string): string | undefined {
  if (!name.startsWith(LOG_PREFIX) || !name.endsWith(LOG_EXTENSION)) return undefined;
  const stamp = name.slice(LOG_PREFIX.length, -LOG_EXTENSION.length);
  if (!DATE_SHAPE.test(stamp)) return undefined;
  const [year, month, day] = stamp.split("-").map(Number);
  const parsed = new Date(year!, month! - 1, day!);
  return formatLocalLogDate(parsed) === stamp ? stamp : undefined;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function errorDetail(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { message: String(error), name: "UnknownError" };
  return { code: (error as NodeJS.ErrnoException).code, message: error.message, name: error.name };
}

interface FailureContext {
  fileName?: string;
  options: LogRetentionCleanupOptions;
  outcome: LogRetentionCleanupResult;
}

/** 清理失败：按「整轮失败」与「单文件失败」两种事件上报。 */
function reportFailure(context: FailureContext, error: unknown): void {
  const perFile = context.fileName !== undefined;
  const detail: Record<string, unknown> = {
    cutoffDate: context.outcome.cutoffDate,
    error: errorDetail(error),
    event: perFile ? "log.retention.delete.failed" : "log.retention.cleanup.failed",
    logDir: context.options.logDir,
    module: MODULE_TAG,
    retentionDays: context.outcome.retentionDays,
    status: "failed",
  };
  if (perFile) detail.fileName = context.fileName;
  const message = perFile ? "Log retention file delete failed" : "Log retention cleanup failed";
  context.options.logger?.warn(message, detail);
}

/** 单条目：算日期、记扫描数、过期就删；ENOENT 视为已不存在。 */
async function pruneEntry(
  context: FailureContext,
  dirent: { isFile(): boolean; name: string },
): Promise<void> {
  if (!dirent.isFile()) return;
  const stamp = logCalendarDate(dirent.name);
  if (stamp === undefined) return;
  context.outcome.scannedFiles += 1;
  if (stamp >= context.outcome.cutoffDate) return;
  try {
    await unlink(join(context.options.logDir, dirent.name));
    context.outcome.deletedFiles.push(dirent.name);
  } catch (error) {
    if (isMissing(error)) return;
    context.outcome.failedFiles.push(dirent.name);
    context.outcome.status = "failed";
    reportFailure({ ...context, fileName: dirent.name }, error);
  }
}

function completedDetail(
  outcome: LogRetentionCleanupResult,
  options: LogRetentionCleanupOptions,
): Record<string, unknown> {
  return {
    cutoffDate: outcome.cutoffDate,
    deletedFileCount: outcome.deletedFiles.length,
    event: "log.retention.cleanup.completed",
    failedFileCount: outcome.failedFiles.length,
    logDir: options.logDir,
    module: MODULE_TAG,
    retentionDays: outcome.retentionDays,
    scannedFiles: outcome.scannedFiles,
    status: outcome.status,
  };
}

export async function cleanupLogRetention(
  options: LogRetentionCleanupOptions,
): Promise<LogRetentionCleanupResult> {
  const keepDays = daysToKeep(options.retentionDays);
  const reference = options.now ?? new Date();
  // 保留窗口的首日按 FIRST_KEPT_DAY 对齐：cutoff 当天的文件仍然保留。
  const boundary = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() - keepDays + FIRST_KEPT_DAY,
  );
  const outcome: LogRetentionCleanupResult = {
    cutoffDate: formatLocalLogDate(boundary),
    deletedFiles: [],
    failedFiles: [],
    retentionDays: keepDays,
    scannedFiles: 0,
    status: "completed",
  };
  const context: FailureContext = { options, outcome };
  const dirents = await readdir(options.logDir, { withFileTypes: true }).catch(
    (error: unknown): undefined => {
      if (!isMissing(error)) {
        outcome.status = "failed";
        reportFailure(context, error);
      }
      return undefined;
    },
  );
  if (dirents === undefined) return outcome;
  for (const dirent of dirents) await pruneEntry(context, dirent);
  options.logger?.debug("Log retention cleanup completed", completedDetail(outcome, options));
  return outcome;
}

export function scheduleLogRetentionCleanup(
  options: LogRetentionScheduleOptions,
): LogRetentionTimer {
  const waitMs = options.delayMs ?? LOG_CLEANUP_STARTUP_DELAY_MS;
  const keepDays = daysToKeep(options.retentionDays);
  options.logger?.info("Log retention cleanup scheduled", {
    delayMs: waitMs,
    event: "log.retention.cleanup.scheduled",
    logDir: options.logDir,
    module: MODULE_TAG,
    retentionDays: keepDays,
    status: "waiting",
  });
  const runCleanup = (): void => {
    void cleanupLogRetention({
      logDir: options.logDir,
      logger: options.logger,
      now: options.now?.() ?? new Date(),
      retentionDays: keepDays,
    });
  };
  const register =
    options.setTimeout ?? ((callback: () => void, delay: number) => setTimeout(callback, delay));
  const timer = register(runCleanup, waitMs);
  timer.unref?.();
  return timer;
}
