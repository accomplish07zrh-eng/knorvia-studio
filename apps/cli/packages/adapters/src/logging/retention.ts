// SPDX-License-Identifier: Apache-2.0
// Modified by Knorvia Studio contributors, 2026-09-30.
// Reimplemented calendar/cleanup adapter; source review remains open.

import type { Dirent } from "node:fs";
import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Logger } from "@knorvia/contracts";

/** 目录项：readdir 的重载在当前 Node 类型下会落到 Buffer 变体，这里显式收窄。 */
type DirectoryEntry = Dirent<string>;

/**
 * 日志保留策略：
 * - 文件名形如 `knorvia-YYYY-MM-DD.jsonl`，日期按本地日历校验（拒绝 02-30 这类回卷）；
 * - 保留窗口 = 今天往前 `retentionDays - 1` 天，cutoff 当天的文件仍然保留；
 * - 单文件删除失败只标记 `failedFiles` 并上报，不影响其余文件；目录读不到时整轮退出。
 */

export const LOG_RETENTION_DAYS = 7;
export const LOG_CLEANUP_STARTUP_DELAY_MS = 60_000;

/** 私有常量按字母序排列：宽度表与 `formatLocalLogDate` 的拼接顺序一一对应。 */
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_WIDTHS = [4, 2, 2] as const;
const FIRST_KEPT_DAY = 1;
const LOG_EXTENSION = ".jsonl";
const LOG_PREFIX = "knorvia-";
const MODULE_TAG = "adapters.logging";

/** 目标日志目录与可选 logger：清理与排程共用。 */
type LogTarget = { logDir: string; logger?: Logger };

/** 扫描计数：扫描/删除/失败三个清单。 */
type CleanupCounters = { deletedFiles: string[]; failedFiles: string[]; scannedFiles: number };

/** 清理入参：目录必填，retentionDays/now 可省略。 */
export interface LogRetentionCleanupOptions extends LogTarget {
  retentionDays?: number;
  now?: Date;
}

/** 清理结果：cutoff 与计数清单，status 表示整轮是否失败。 */
export interface LogRetentionCleanupResult extends CleanupCounters {
  status: "completed" | "failed";
  retentionDays: number;
  cutoffDate: string;
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

function daysToKeep(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return LOG_RETENTION_DAYS;
  return Math.max(FIRST_KEPT_DAY, Math.trunc(requested));
}

/** 本地日历日期：`YYYY-MM-DD`，宽度按 DATE_WIDTHS 补零。 */
export function formatLocalLogDate(moment: Date): string {
  const parts = [moment.getFullYear(), moment.getMonth() + 1, moment.getDate()];
  return parts.map((value, index) => String(value).padStart(DATE_WIDTHS[index]!, "0")).join("-");
}

/** 保留窗口的首日：cutoff 当天的文件仍然保留。 */
function cutoffDate(reference: Date, keepDays: number): Date {
  const dayOfMonth = reference.getDate() - keepDays + FIRST_KEPT_DAY;
  return new Date(reference.getFullYear(), reference.getMonth(), dayOfMonth);
}

function isLogFile(fileName: string): boolean {
  return fileName.startsWith(LOG_PREFIX) && fileName.endsWith(LOG_EXTENSION);
}

/** 从日志文件名取出可用的日期；形状不对或日历回卷（如 02-30）都算无效。 */
function logCalendarDate(fileName: string): string | undefined {
  if (!isLogFile(fileName)) return undefined;
  const stamp = fileName.slice(LOG_PREFIX.length, -LOG_EXTENSION.length);
  if (!DATE_SHAPE.test(stamp)) return undefined;
  const [year, month, day] = stamp.split("-").map(Number);
  const parsed = new Date(year!, month! - 1, day!);
  return formatLocalLogDate(parsed) === stamp ? stamp : undefined;
}

function isMissing(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  return (cause as NodeJS.ErrnoException).code === "ENOENT";
}

function errorDetail(cause: unknown): Record<string, unknown> {
  if (!(cause instanceof Error)) return { message: String(cause), name: "UnknownError" };
  return { code: (cause as NodeJS.ErrnoException).code, message: cause.message, name: cause.name };
}

/** 三处事件载荷共享的三项：目录、模块、保留天数。 */
function commonDetail(logDir: string, keepDays: number): Record<string, unknown> {
  return { logDir, module: MODULE_TAG, retentionDays: keepDays };
}

interface FailureContext {
  fileName?: string;
  options: LogRetentionCleanupOptions;
  outcome: LogRetentionCleanupResult;
}

/** 清理失败：按「整轮失败」与「单文件失败」两种事件上报。 */
function reportFailure(context: FailureContext, cause: unknown): void {
  const perFile = context.fileName !== undefined;
  const common = commonDetail(context.options.logDir, context.outcome.retentionDays);
  const detail: Record<string, unknown> = {} as Record<string, unknown>;
  Object.assign(detail, common);
  detail.cutoffDate = context.outcome.cutoffDate;
  detail.error = errorDetail(cause);
  detail.event = perFile ? "log.retention.delete.failed" : "log.retention.cleanup.failed";
  detail.status = "failed";
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
  } catch (cause) {
    if (isMissing(cause)) return;
    context.outcome.failedFiles.push(dirent.name);
    context.outcome.status = "failed";
    reportFailure({ ...context, fileName: dirent.name }, cause);
  }
}

function completedDetail(
  outcome: LogRetentionCleanupResult,
  options: LogRetentionCleanupOptions,
): Record<string, unknown> {
  const common = commonDetail(options.logDir, outcome.retentionDays);
  const detail: Record<string, unknown> = {} as Record<string, unknown>;
  Object.assign(detail, common);
  detail.cutoffDate = outcome.cutoffDate;
  detail.deletedFileCount = outcome.deletedFiles.length;
  detail.event = "log.retention.cleanup.completed";
  detail.failedFileCount = outcome.failedFiles.length;
  detail.scannedFiles = outcome.scannedFiles;
  detail.status = outcome.status;
  return detail;
}

function emptyOutcome(boundary: string, keepDays: number): LogRetentionCleanupResult {
  const outcome = {} as LogRetentionCleanupResult;
  outcome.status = "completed";
  outcome.retentionDays = keepDays;
  outcome.cutoffDate = boundary;
  outcome.deletedFiles = [];
  outcome.failedFiles = [];
  outcome.scannedFiles = 0;
  return outcome;
}

/** 读目录：ENOENT 视为「没有日志目录」，其余失败置 status 并上报。 */
async function readLogDirectory(context: FailureContext): Promise<DirectoryEntry[] | undefined> {
  return await (
    readdir(context.options.logDir, { withFileTypes: true }) as Promise<DirectoryEntry[]>
  ).catch((cause: unknown): undefined => {
    if (!isMissing(cause)) {
      context.outcome.status = "failed";
      reportFailure(context, cause);
    }
    return undefined;
  });
}

export async function cleanupLogRetention(
  options: LogRetentionCleanupOptions,
): Promise<LogRetentionCleanupResult> {
  const keepDays = daysToKeep(options.retentionDays);
  const reference = options.now ?? new Date();
  const boundary = cutoffDate(reference, keepDays);
  const outcome = emptyOutcome(formatLocalLogDate(boundary), keepDays);
  const context: FailureContext = { options, outcome };
  const dirents = await readLogDirectory(context);
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
  const scheduled: Record<string, unknown> = {} as Record<string, unknown>;
  Object.assign(scheduled, commonDetail(options.logDir, keepDays));
  scheduled.delayMs = waitMs;
  scheduled.event = "log.retention.cleanup.scheduled";
  scheduled.status = "waiting";
  options.logger?.info("Log retention cleanup scheduled", scheduled);
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
