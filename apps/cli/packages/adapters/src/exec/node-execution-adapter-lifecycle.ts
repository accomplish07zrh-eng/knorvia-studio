// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { BACKGROUND_BASH_OUTPUT_MAX_BYTES, type BackgroundBashOutputResult } from "@knorvia/shared";
import type {
  BackgroundExecutionSnapshot,
  BackgroundExecutionStartResult,
  ExecutionEvent,
  ExecutionRequest,
  ExecutionRunOptions,
} from "@knorvia/contracts";
import { readBashOutput } from "./bash-file-output.js";
import type {
  BackgroundTaskRecord,
  BashBackgroundLifecycleMode,
  BashBackgroundLifecycleResult,
  OutputPersistenceMode,
} from "./execution-adapter-types.js";
import { ExecutionCoordinator } from "./node-execution-adapter-base.js";
import { applyForegroundArtifactPolicy, emitResult } from "./node-execution-adapter-results.js";
import { runExecution } from "./node-execution-adapter-run.js";
import {
  BASH_RUNTIME_OUTPUT_LIMIT_BYTES,
  DEFAULT_TIMEOUT_MS,
  isBashMergedOutputRequest,
} from "./execution-utils.js";

function detachedCallback(callback: ExecutionRunOptions["onEvent"], event: ExecutionEvent): void {
  try {
    const pending = callback?.(event);
    if (pending) void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // Consumer callbacks cannot alter lifecycle state.
  }
}

function linkAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  const abort = (): void => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

async function ensureFile(target: string | undefined): Promise<void> {
  if (!target) return;
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const handle = await open(target, "a", 0o600);
  await handle.close();
}

function startResult(record: BackgroundTaskRecord): BackgroundExecutionStartResult {
  return {
    taskId: record.taskId,
    status: "running",
    startedAt: record.startedAt,
    pid: record.pid,
    outputPath: record.outputPath,
    stderrPersistedOutputPath: record.stderrPersistedOutputPath,
    stdoutPersistedOutputPath: record.stdoutPersistedOutputPath,
  };
}

export class ExecutionLifecycle {
  constructor(private readonly coordinator: ExecutionCoordinator) {}

  async start(
    request: ExecutionRequest,
    options: ExecutionRunOptions = {},
  ): Promise<BackgroundExecutionStartResult> {
    if (this.coordinator.isClosing) throw new Error("Execution adapter is closed.");
    const taskId = randomUUID();
    const startedAt = new Date();
    const controller = new AbortController();
    const backgroundRequest: ExecutionRequest = {
      ...request,
      captureCwdAfterSuccess: false,
      outputLimit: { ...request.outputLimit, persistOutput: "always" },
    };
    const paths = this.coordinator.outputPathsForRequest(backgroundRequest);
    const isBash = isBashMergedOutputRequest(backgroundRequest);
    const record = this.coordinator.createBackgroundTaskRecord({
      controller,
      outputPaths: paths,
      startedAt,
      taskId,
      request: backgroundRequest,
      isBash,
    });
    record.externalAbort = linkAbort(options.signal, controller);
    this.coordinator.backgroundTasks.set(taskId, record);
    const runOptions = {
      ...options,
      signal: controller.signal,
      onOutputEncodingResolved: (encoding: string | null) => {
        record.legacyOutputEncoding = encoding;
      },
      onEvent: (event: ExecutionEvent) => {
        this.coordinator.updateBackgroundTaskRecordFromEvent(record, event);
        detachedCallback(options.onEvent, event);
      },
      shouldRetainExecutionAfterRootExit: () => true,
    };
    const execution = (async () => {
      if (!isBash) {
        await Promise.all([
          ensureFile(paths.stdoutPersistedOutputPath),
          ensureFile(paths.stderrPersistedOutputPath),
        ]);
      }
      return runExecution(this.coordinator, backgroundRequest, runOptions);
    })();
    void execution
      .then((result) => this.coordinator.finalizeBackgroundTaskRecord(record, result))
      .catch((error: unknown) => {
        const now = new Date();
        const failure = {
          type: "spawn_error" as const,
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        };
        const result = {
          status: "spawn_error",
          stdout: { text: "", bytes: 0, truncated: false },
          stderr: { text: "", bytes: 0, truncated: false },
          durationMs: now.getTime() - startedAt.getTime(),
          timedOut: false,
          cancelled: false,
          startedAt,
          completedAt: now,
          error: failure,
        } as const;
        detachedCallback(options.onEvent, { type: "failed", error: failure, timestamp: now });
        this.coordinator.finalizeBackgroundTaskRecord(record, result);
      });
    return startResult(record);
  }

  async runBashWithBackgroundLifecycle(
    request: ExecutionRequest,
    lifecycle: { mode: BashBackgroundLifecycleMode },
    options: ExecutionRunOptions = {},
  ): Promise<BashBackgroundLifecycleResult> {
    if (!isBashMergedOutputRequest(request)) {
      return { kind: "foreground", result: await runExecution(this.coordinator, request, options) };
    }
    const originalPersistence: OutputPersistenceMode =
      request.outputLimit?.persistOutput ?? "on_truncate";
    const controller = new AbortController();
    const detachParentAbort = linkAbort(options.signal, controller);
    const executionRequest: ExecutionRequest = {
      ...request,
      timeoutMs: 0,
      outputLimit: {
        ...request.outputLimit,
        persistOutput: "always",
        maxPersistedBytes: BASH_RUNTIME_OUTPUT_LIMIT_BYTES,
        killProcessOnPersistedLimit: false,
      },
    };
    let phase: "foreground" | "background" | "settling" = "foreground";
    let record: BackgroundTaskRecord | undefined;
    let pid: number | undefined;
    let startedAt = new Date();
    let legacyEncoding: string | null = null;
    let persistedLimitReached = false;
    let deadline: NodeJS.Timeout | undefined;
    let resolveHandoff!: (task: BackgroundExecutionStartResult) => void;
    const handoff = new Promise<BackgroundExecutionStartResult>((resolve) => {
      resolveHandoff = resolve;
    });

    const moveToBackground = (): void => {
      if (phase !== "foreground" || pid === undefined || controller.signal.aborted) return;
      phase = "background";
      if (deadline) clearTimeout(deadline);
      detachParentAbort();
      const taskId = randomUUID();
      record = this.coordinator.createBackgroundTaskRecord({
        controller,
        outputPaths: this.coordinator.outputPathsForRequest(executionRequest),
        startedAt,
        taskId,
        request: executionRequest,
        isBash: true,
      });
      record.pid = pid;
      record.legacyOutputEncoding = legacyEncoding;
      this.coordinator.backgroundTasks.set(taskId, record);
      if (persistedLimitReached) controller.abort("output_limit");
      resolveHandoff(startResult(record));
    };

    const foregroundTimeout =
      request.timeoutMs === undefined || !Number.isFinite(request.timeoutMs)
        ? DEFAULT_TIMEOUT_MS
        : request.timeoutMs;
    const runPromise = runExecution(this.coordinator, executionRequest, {
      ...options,
      signal: controller.signal,
      onOutputEncodingResolved: (encoding) => {
        legacyEncoding = encoding;
        if (record) record.legacyOutputEncoding = encoding;
      },
      onPersistedLimit: () => {
        persistedLimitReached = true;
      },
      shouldStopOnPersistedLimit: () => phase === "background",
      shouldRetainExecutionAfterRootExit: () => phase === "background",
      suppressTerminalEvent: true,
      bashLifecycle: {
        isBackgrounded: () => phase === "background",
        onExit: () => {
          if (phase === "foreground") phase = "settling";
          if (deadline) clearTimeout(deadline);
        },
      },
      onEvent: (event) => {
        if (event.type === "started") {
          pid = event.pid;
          startedAt = event.timestamp;
          detachedCallback(options.onEvent, event);
          if (lifecycle.mode === "explicit") moveToBackground();
          else if (foregroundTimeout > 0) {
            deadline = setTimeout(moveToBackground, foregroundTimeout);
            deadline.unref();
          }
        }
        if (record) this.coordinator.updateBackgroundTaskRecordFromEvent(record, event);
        if (event.type !== "started" && phase !== "background") {
          detachedCallback(options.onEvent, event);
        }
      },
    }).then(async (result) => {
      if (deadline) clearTimeout(deadline);
      detachParentAbort();
      if (record) {
        this.coordinator.finalizeBackgroundTaskRecord(record, result);
        return result;
      }
      const stdout = await applyForegroundArtifactPolicy(result.stdout, originalPersistence);
      const stderr = await applyForegroundArtifactPolicy(result.stderr, originalPersistence);
      const normalized = { ...result, stdout, stderr };
      emitResult(options, normalized);
      return normalized;
    });

    const outcome = await Promise.race([
      runPromise.then((result) => ({ kind: "foreground" as const, result })),
      handoff.then((task) => ({ kind: "backgrounded" as const, task })),
    ]);
    return outcome;
  }

  async readBackgroundBashOutput(
    workId: string,
    sessionId: string,
  ): Promise<BackgroundBashOutputResult> {
    const record = this.coordinator.backgroundTasks.get(workId);
    if (!record || record.sessionId !== sessionId)
      return { kind: "unavailable", workId, code: "not_found" };
    if (!record.isBash || !record.outputPath) return { kind: "unsupported", workId };
    const snapshot = this.coordinator.snapshot(record);
    try {
      const output = await readBashOutput(
        record.outputPath,
        BACKGROUND_BASH_OUTPUT_MAX_BYTES,
        true,
        record.legacyOutputEncoding,
      );
      const status =
        !record.result && snapshot.status === "cancelled" ? "running" : snapshot.status;
      return {
        kind: "output",
        workId,
        status,
        output: output.text,
        truncated: output.truncated,
        outputPath: record.outputPath,
      };
    } catch (error) {
      return { kind: "read_failed", workId, code: (error as NodeJS.ErrnoException).code };
    }
  }

  async getBackgroundTask(taskId: string): Promise<BackgroundExecutionSnapshot | undefined> {
    const record = this.coordinator.backgroundTasks.get(taskId);
    return record ? this.coordinator.snapshot(record) : undefined;
  }

  async waitForBackgroundTask(
    taskId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<BackgroundExecutionSnapshot | undefined> {
    const record = this.coordinator.backgroundTasks.get(taskId);
    if (!record) return undefined;
    if (record.result || options.signal?.aborted) return this.coordinator.snapshot(record);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (snapshot: BackgroundExecutionSnapshot): void => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", onAbort);
        resolve(snapshot);
      };
      const onAbort = (): void => finish(this.coordinator.snapshot(record));
      options.signal?.addEventListener("abort", onAbort, { once: true });
      void record.completion.then(finish);
    });
  }

  async cancelBackgroundTask(taskId: string): Promise<BackgroundExecutionSnapshot | undefined> {
    const record = this.coordinator.backgroundTasks.get(taskId);
    if (!record) return undefined;
    if (!record.result && record.status === "running") {
      record.status = "cancelled";
      record.controller.abort("cancelled");
    }
    return this.coordinator.snapshot(record);
  }
}
