// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  BackgroundExecutionSnapshot,
  ExecutionEvent,
  ExecutionRequest,
  ExecutionResult,
} from "@knorvia/contracts";
import { cleanupStaleShellInitSnapshots, ShellInitSnapshotManager } from "./shell-init-snapshot.js";
import type {
  ActiveExecutionRecord,
  BackgroundTaskRecord,
  ExecutionOutputPaths,
  NodeExecutionAdapterOptions,
  StopReason,
} from "./execution-adapter-types.js";
import {
  DEFAULT_INLINE_OUTPUT_BYTES,
  DEFAULT_MAX_PERSISTED_OUTPUT_BYTES,
  DEFAULT_PROGRESS_INTERVAL_MS,
  DEFAULT_PROGRESS_TAIL_BYTES,
  DEFAULT_PROGRESS_THRESHOLD_MS,
  resolveDefaultOutputRootDir,
  sanitizePathSegment,
} from "./execution-utils.js";
import { resolveBashMaxOutputLength } from "./bash-output-policy.js";

function completionPair<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accepted) => {
    resolve = accepted;
  });
  return { promise, resolve };
}

export class ExecutionCoordinator {
  readonly activeExecutions = new Map<string, ActiveExecutionRecord>();
  readonly backgroundTasks = new Map<string, BackgroundTaskRecord>();
  readonly pendingBashProcessTreeKills = new Map<Promise<void>, { ref(): unknown }>();
  readonly shellInitSnapshots = new ShellInitSnapshotManager();
  readonly outputPathsByRequest = new WeakMap<ExecutionRequest, ExecutionOutputPaths>();
  readonly options: NodeExecutionAdapterOptions;
  readonly outputRootDir: string;
  readonly shellInitRetentionCleanup: Promise<unknown>;
  private closePromise?: Promise<void>;
  private closing = false;

  constructor(options: NodeExecutionAdapterOptions = {}) {
    this.options = options;
    this.outputRootDir = options.outputRootDir ?? resolveDefaultOutputRootDir(options.processEnv);
    this.shellInitRetentionCleanup = cleanupStaleShellInitSnapshots({
      rootDir: this.outputRootDir,
    });
  }

  get isClosing(): boolean {
    return this.closing;
  }

  get platform(): NodeJS.Platform {
    return this.options.platform ?? process.platform;
  }

  get processEnv(): NodeJS.ProcessEnv {
    return this.options.processEnv ?? process.env;
  }

  get progressIntervalMs(): number {
    return this.options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
  }

  get progressTailBytes(): number {
    return this.options.progressTailBytes ?? DEFAULT_PROGRESS_TAIL_BYTES;
  }

  get progressThresholdMs(): number {
    return this.options.progressThresholdMs ?? DEFAULT_PROGRESS_THRESHOLD_MS;
  }

  inlineLimit(request: ExecutionRequest): number {
    return Math.max(
      0,
      request.outputLimit?.maxInlineBytes ??
        request.outputLimit?.maxBufferBytes ??
        DEFAULT_INLINE_OUTPUT_BYTES,
    );
  }

  bashInlineLimit(request: ExecutionRequest): number {
    return resolveBashMaxOutputLength(this.processEnv, request.outputLimit?.maxInlineBytes);
  }

  persistedOutputLimit(request: ExecutionRequest): number {
    return Math.max(
      0,
      request.outputLimit?.maxPersistedBytes ??
        this.options.maxPersistedOutputBytes ??
        DEFAULT_MAX_PERSISTED_OUTPUT_BYTES,
    );
  }

  outputPathsForRequest(request: ExecutionRequest): ExecutionOutputPaths {
    let paths = this.outputPathsByRequest.get(request);
    if (paths) return paths;
    const session = sanitizePathSegment(String(request.trace?.sessionId ?? "session"));
    const identity =
      request.trace?.attributes?.toolCallId ?? request.trace?.spanId ?? request.trace?.traceId;
    const run = sanitizePathSegment(String(identity ?? randomUUID()));
    const root = path.join(this.outputRootDir, session, run);
    paths = {
      outputPath: path.join(root, "merged.log"),
      stdoutPersistedOutputPath: path.join(root, "stdout.log"),
      stderrPersistedOutputPath: path.join(root, "stderr.log"),
    };
    this.outputPathsByRequest.set(request, paths);
    return paths;
  }

  registerActiveExecution(stop: (reason: StopReason) => void): string {
    const id = randomUUID();
    const pair = completionPair<void>();
    let completed = false;
    this.activeExecutions.set(id, {
      stop,
      completion: pair.promise,
      resolveCompletion: () => {
        if (completed) return;
        completed = true;
        pair.resolve();
      },
    });
    return id;
  }

  completeActiveExecution(executionId: string): void {
    const record = this.activeExecutions.get(executionId);
    if (!record) return;
    this.activeExecutions.delete(executionId);
    record.resolveCompletion();
  }

  createBackgroundTaskRecord(args: {
    controller: AbortController;
    outputPaths: ExecutionOutputPaths;
    startedAt: Date;
    taskId: string;
    request: ExecutionRequest;
    isBash: boolean;
  }): BackgroundTaskRecord {
    const pair = completionPair<BackgroundExecutionSnapshot>();
    return {
      taskId: args.taskId,
      status: "running",
      startedAt: args.startedAt,
      sessionId: args.request.trace?.sessionId ? String(args.request.trace.sessionId) : undefined,
      isBash: args.isBash,
      legacyOutputEncoding: null,
      controller: args.controller,
      completion: pair.promise,
      resolveCompletion: pair.resolve,
      ...args.outputPaths,
    };
  }

  updateBackgroundTaskRecordFromEvent(record: BackgroundTaskRecord, event: ExecutionEvent): void {
    if (event.type === "started") record.pid = event.pid;
    if (event.type === "stdout" || event.type === "stderr") {
      const prefix = event.type;
      const bytesKey = `${prefix}Bytes` as "stdoutBytes" | "stderrBytes";
      const tailKey = `${prefix}Tail` as "stdoutTail" | "stderrTail";
      record[bytesKey] = (record[bytesKey] ?? 0) + event.chunk.byteLength;
      record[tailKey] = `${record[tailKey] ?? ""}${event.text}`.slice(-this.progressTailBytes);
    }
    if (event.type === "progress") {
      record.stdoutBytes = event.stdoutBytes;
      record.stderrBytes = event.stderrBytes;
      if (event.stdoutTail !== undefined) record.stdoutTail = event.stdoutTail;
      if (event.stderrTail !== undefined) record.stderrTail = event.stderrTail;
      if (event.outputPreview?.fullText !== undefined)
        record.stdoutTail = event.outputPreview.fullText;
    }
  }

  finalizeBackgroundTaskRecord(record: BackgroundTaskRecord, result: ExecutionResult): void {
    if (record.result) return;
    record.status = result.status;
    record.completedAt = result.completedAt;
    record.result = result;
    record.error = result.error;
    record.pid = result.pid ?? record.pid;
    record.stdoutBytes = result.stdout.bytes;
    record.stderrBytes = result.stderr.bytes;
    record.stdoutTail = result.stdout.text.slice(-this.progressTailBytes);
    record.stderrTail = result.stderr.text.slice(-this.progressTailBytes);
    record.externalAbort?.();
    record.externalAbort = undefined;
    record.resolveCompletion(this.snapshot(record));
  }

  snapshot(record: BackgroundTaskRecord): BackgroundExecutionSnapshot {
    const {
      controller: _controller,
      completion: _completion,
      resolveCompletion: _resolveCompletion,
      externalAbort: _externalAbort,
      legacyOutputEncoding: _legacyOutputEncoding,
      isBash: _isBash,
      sessionId: _sessionId,
      ...snapshot
    } = record;
    return { ...snapshot };
  }

  trackBashKill(promise: Promise<void>, timer: { ref(): unknown }): void {
    this.pendingBashProcessTreeKills.set(promise, timer);
    void promise.then(
      () => this.pendingBashProcessTreeKills.delete(promise),
      () => this.pendingBashProcessTreeKills.delete(promise),
    );
  }

  close(): Promise<void> {
    this.closePromise ??= this.shutdown();
    return this.closePromise;
  }

  private async shutdown(): Promise<void> {
    this.closing = true;
    const backgroundCompletions: Promise<BackgroundExecutionSnapshot>[] = [];
    for (const record of this.backgroundTasks.values()) {
      if (!record.result) {
        backgroundCompletions.push(record.completion);
        record.status = "cancelled";
        record.controller.abort("cancelled");
      }
    }
    const active = [...this.activeExecutions.values()];
    for (const record of active) record.stop("cancelled");
    await Promise.allSettled([
      ...active.map((record) => record.completion),
      ...backgroundCompletions,
    ]);
    const kills = [...this.pendingBashProcessTreeKills.entries()];
    for (const [, timer] of kills) timer.ref();
    await Promise.allSettled(kills.map(([promise]) => promise));
    await Promise.resolve(this.shellInitRetentionCleanup).catch(() => undefined);
    await this.shellInitSnapshots.cleanup();
  }
}
