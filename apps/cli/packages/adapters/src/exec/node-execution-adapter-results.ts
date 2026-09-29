// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { truncate, unlink } from "node:fs/promises";
import type {
  ExecutionEvent,
  ExecutionFailure,
  ExecutionResult,
  ExecutionRunOptions,
  ExecutionStatus,
  ExecutionStreamResult,
} from "@knorvia/contracts";
import { diagnoseLostBashOutput, type BashFileOutput } from "./bash-file-output.js";
import type { ExitState, OutputPersistenceMode, StopReason } from "./execution-adapter-types.js";
import { formatTimeoutDuration } from "./execution-utils.js";

export function emptyStream(text = ""): ExecutionStreamResult {
  return { text, bytes: Buffer.byteLength(text), truncated: false };
}

export function statusFromExit(
  exitState: ExitState,
  stopReason: StopReason | undefined,
): ExecutionStatus {
  if (exitState.error) return "spawn_error";
  if (stopReason === "timeout") return "timed_out";
  if (stopReason === "cancelled") return "cancelled";
  if (stopReason === "output_limit") return "failed";
  return exitState.code === 0 ? "completed" : "failed";
}

export function statusFailure(
  stopReason: StopReason | undefined,
  timeoutMs: number,
): ExecutionFailure | undefined {
  if (stopReason === "timeout") {
    return {
      type: "timeout",
      message: `Command timed out after ${formatTimeoutDuration(timeoutMs)}.`,
    };
  }
  if (stopReason === "cancelled") return { type: "cancelled", message: "Command was cancelled." };
  if (stopReason === "output_limit") {
    return {
      type: "output_limit",
      message: "Execution output exceeded the persisted output limit",
    };
  }
  return undefined;
}

export function toFailure(type: ExecutionFailure["type"], error: unknown): ExecutionFailure {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return { type, message: normalized.message, cause: error };
}

export function createResult(args: {
  status: ExecutionStatus;
  startedAt: Date;
  completedAt: Date;
  stdout: ExecutionStreamResult;
  stderr: ExecutionStreamResult;
  stopReason?: StopReason;
  pid?: number;
  exitCode?: number;
  signal?: string;
  error?: ExecutionFailure;
  resolvedCwd?: string;
}): ExecutionResult {
  return {
    status: args.status,
    exitCode: args.exitCode,
    signal: args.signal,
    stdout: args.stdout,
    stderr: args.stderr,
    durationMs: Math.max(0, args.completedAt.getTime() - args.startedAt.getTime()),
    timedOut: args.stopReason === "timeout",
    cancelled: args.stopReason === "cancelled",
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    pid: args.pid,
    error: args.error,
    resolvedCwd: args.resolvedCwd,
  };
}

export function createStoppedResult(
  startedAt: Date,
  status: Extract<ExecutionStatus, "cancelled" | "timed_out">,
  message: string,
): ExecutionResult {
  const completedAt = new Date();
  const stopReason: StopReason = status === "timed_out" ? "timeout" : "cancelled";
  return createResult({
    status,
    startedAt,
    completedAt,
    stdout: emptyStream(),
    stderr: emptyStream(),
    stopReason,
    error: { type: stopReason === "timeout" ? "timeout" : "cancelled", message },
  });
}

export function emit(options: ExecutionRunOptions, event: ExecutionEvent): void {
  try {
    const pending = options.onEvent?.(event);
    if (pending) void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // User event callbacks never own execution settlement.
  }
}

export function emitResult(options: ExecutionRunOptions, result: ExecutionResult): void {
  if (result.status === "spawn_error") {
    emit(options, {
      type: "failed",
      error: result.error ?? { type: "spawn_error", message: "Failed to spawn command." },
      timestamp: new Date(),
    });
  } else {
    emit(options, { type: "completed", result, timestamp: new Date() });
  }
}

export async function readBashResult(
  file: BashFileOutput,
  maxInlineBytes: number,
  exit: ExitState,
  stopReason: StopReason | undefined,
): Promise<ExecutionStreamResult> {
  const output = await file.result(maxInlineBytes);
  if (output.bytes === 0 && exit.code && exit.code !== 137 && stopReason !== "output_limit") {
    const diagnosis = await diagnoseLostBashOutput(file.path);
    if (diagnosis) output.text = diagnosis;
  }
  return output;
}

export function normalizeBashOutputLimitResult(
  result: ExecutionResult,
  persistedLimitReached: boolean,
): ExecutionResult {
  if (!persistedLimitReached) return result;
  return {
    ...result,
    status: "cancelled",
    exitCode: 137,
    cancelled: true,
    error: {
      type: "output_limit",
      message: "Bash output exceeded the 5GB persisted output limit.",
    },
  };
}

async function removeArtifact(stream: ExecutionStreamResult): Promise<ExecutionStreamResult> {
  if (stream.artifactPath) {
    try {
      await unlink(stream.artifactPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return stream;
    }
  }
  const {
    artifactPath: _path,
    artifactBytes: _bytes,
    artifactTruncated: _truncated,
    ...inline
  } = stream;
  return inline;
}

export async function applyForegroundArtifactPolicy(
  stream: ExecutionStreamResult,
  persistOutput: OutputPersistenceMode,
): Promise<ExecutionStreamResult> {
  const retain =
    persistOutput === "always" || (persistOutput === "on_truncate" && stream.truncated);
  return retain ? stream : removeArtifact(stream);
}

export async function capArtifactStream(
  stream: ExecutionStreamResult,
  maxBytes: number | undefined,
): Promise<ExecutionStreamResult> {
  if (!stream.artifactPath || maxBytes === undefined || maxBytes < 0) return stream;
  if ((stream.artifactBytes ?? 0) <= maxBytes) return stream;
  try {
    await truncate(stream.artifactPath, maxBytes);
    return { ...stream, artifactBytes: maxBytes, artifactTruncated: true };
  } catch {
    return stream;
  }
}
