// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import path from "node:path";
import type { ExecutionRequest } from "@knorvia/contracts";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";

/** 执行适配器默认值：集中定义，再按原名逐个导出（导出名与数值逐字保留）。 */
const EXEC_DEFAULTS = {
  timeoutMs: 300_000,
  inlineOutputBytes: 10 * 1024 * 1024,
  maxPersistedOutputBytes: 50 * 1024 * 1024,
  bashRuntimeOutputLimitBytes: 5 * 1024 * 1024 * 1024,
  ioDrainTimeoutMs: 1_000,
  forceExitAfterKillMs: 5_000,
  progressThresholdMs: 2_000,
  progressIntervalMs: 1_000,
  progressTailBytes: 4 * 1024,
} as const;

export const DEFAULT_TIMEOUT_MS = EXEC_DEFAULTS.timeoutMs;
export const DEFAULT_INLINE_OUTPUT_BYTES = EXEC_DEFAULTS.inlineOutputBytes;
export const DEFAULT_MAX_PERSISTED_OUTPUT_BYTES = EXEC_DEFAULTS.maxPersistedOutputBytes;
export const BASH_RUNTIME_OUTPUT_LIMIT_BYTES = EXEC_DEFAULTS.bashRuntimeOutputLimitBytes;
export const IO_DRAIN_TIMEOUT_MS = EXEC_DEFAULTS.ioDrainTimeoutMs;
export const FORCE_EXIT_AFTER_KILL_MS = EXEC_DEFAULTS.forceExitAfterKillMs;
export const DEFAULT_PROGRESS_THRESHOLD_MS = EXEC_DEFAULTS.progressThresholdMs;
export const DEFAULT_PROGRESS_INTERVAL_MS = EXEC_DEFAULTS.progressIntervalMs;
export const DEFAULT_PROGRESS_TAIL_BYTES = EXEC_DEFAULTS.progressTailBytes;

export function resolveDefaultOutputRootDir(processEnv: NodeJS.ProcessEnv = process.env): string {
  const root = processEnv.KNORVIA_STORAGE_DIR || resolveKnorviaDataRoot(processEnv);
  return path.join(root, "cli", "exec");
}

export function isExpectedChildStdinClosureError(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === "EPIPE" || code === "ERR_STREAM_DESTROYED" || code === "ERR_STREAM_WRITE_AFTER_END"
  );
}

export function isBashMergedOutputRequest(request: ExecutionRequest): boolean {
  return request.command.mode === "shell" && request.command.shellProfile === "posix-bash";
}

export function sanitizePathSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "");
  return normalized.slice(0, 96) || "unknown";
}

export function abortSignalReason(signal: AbortSignal | undefined): unknown {
  return signal?.aborted ? signal.reason : undefined;
}

export async function waitForPromise(
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const completion = promise.then(
    () => true,
    () => true,
  );
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
    timer.unref();
  });
  const completed = await Promise.race([completion, timeout]);
  if (timer) clearTimeout(timer);
  return completed;
}

export function formatTimeoutDuration(timeoutMs: number): string {
  if (timeoutMs < 1_000) return `${timeoutMs}ms`;
  if (timeoutMs < 60_000) return `${timeoutMs / 1_000}s`;
  if (timeoutMs < 3_600_000) return `${timeoutMs / 60_000}m`;
  return `${timeoutMs / 3_600_000}h`;
}
