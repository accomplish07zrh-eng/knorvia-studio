// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import path from "node:path";
import type { ExecutionRequest } from "@knorvia/contracts";
import { resolveKnorviaDataRoot } from "@knorvia/shared/node";

export const DEFAULT_TIMEOUT_MS = 300_000;
export const DEFAULT_INLINE_OUTPUT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_PERSISTED_OUTPUT_BYTES = 50 * 1024 * 1024;
export const BASH_RUNTIME_OUTPUT_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
export const IO_DRAIN_TIMEOUT_MS = 1_000;
export const FORCE_EXIT_AFTER_KILL_MS = 5_000;
export const DEFAULT_PROGRESS_THRESHOLD_MS = 2_000;
export const DEFAULT_PROGRESS_INTERVAL_MS = 1_000;
export const DEFAULT_PROGRESS_TAIL_BYTES = 4 * 1024;

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
