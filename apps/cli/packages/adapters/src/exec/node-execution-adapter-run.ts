// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { spawn, type ChildProcess } from "node:child_process";
import type { ExecutionRequest, ExecutionResult } from "@knorvia/contracts";
import { BashFileOutput } from "./bash-file-output.js";
import { createBashResourceTelemetry } from "./bash-resource-telemetry.js";
import type {
  ExitState,
  InternalExecutionRunOptions,
  OutputPersistenceMode,
  StopReason,
} from "./execution-adapter-types.js";
import { ExecutionCoordinator } from "./node-execution-adapter-base.js";
import {
  attachPipedOutput,
  drainChildOutput,
  prepareChildSpawn,
  startGenericProgress,
  terminateProcessTree,
  writeChildInput,
} from "./node-execution-adapter-process.js";
import {
  applyForegroundArtifactPolicy,
  capArtifactStream,
  createResult,
  createStoppedResult,
  emit,
  emitResult,
  emptyStream,
  normalizeBashOutputLimitResult,
  readBashResult,
  statusFailure,
  statusFromExit,
  toFailure,
} from "./node-execution-adapter-results.js";
import { OutputCollector, type AggregatePersistedOutputBudget } from "./output-collector.js";
import {
  BASH_RUNTIME_OUTPUT_LIMIT_BYTES,
  DEFAULT_TIMEOUT_MS,
  isExpectedChildStdinClosureError,
} from "./execution-utils.js";
import { readCapturedCwd } from "./cwd-capture.js";

function stopReasonFromSignal(signal: AbortSignal): StopReason {
  return signal.reason === "output_limit" ? "output_limit" : "cancelled";
}

function persistenceMode(request: ExecutionRequest): OutputPersistenceMode {
  return request.outputLimit?.persistOutput ?? "on_truncate";
}

function safeTimeout(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? DEFAULT_TIMEOUT_MS : Math.max(0, value);
}

function waitForSpawn(child: ChildProcess): Promise<{ spawned: boolean; error?: Error }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { spawned: boolean; error?: Error }): void => {
      if (settled) return;
      settled = true;
      child.off("spawn", onSpawn);
      child.off("error", onError);
      resolve(value);
    };
    const onSpawn = (): void => finish({ spawned: true });
    const onError = (error: Error): void => finish({ spawned: false, error });
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });
}

function observeExit(child: ChildProcess): { exit: Promise<ExitState>; closed: Promise<void> } {
  const exit = new Promise<ExitState>((resolve) => {
    let settled = false;
    const finish = (state: ExitState): void => {
      if (settled) return;
      settled = true;
      resolve(state);
    };
    child.once("error", (error) => finish({ error }));
    child.once("exit", (code, signal) =>
      finish({
        code: code === null ? undefined : code,
        signal: signal === null ? undefined : signal,
      }),
    );
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  return { exit, closed };
}

function createCollector(
  coordinator: ExecutionCoordinator,
  request: ExecutionRequest,
  stream: "stdout" | "stderr",
  encoding: string | null,
  onLimit: () => void,
  aggregate?: AggregatePersistedOutputBudget,
): OutputCollector {
  const paths = coordinator.outputPathsForRequest(request);
  return new OutputCollector({
    maxInlineBytes: coordinator.inlineLimit(request),
    maxPersistedBytes: coordinator.persistedOutputLimit(request),
    legacyOutputEncoding: encoding,
    maxTailBytes: coordinator.progressTailBytes,
    onPersistedLimit: onLimit,
    outputPath:
      stream === "stdout" ? paths.stdoutPersistedOutputPath : paths.stderrPersistedOutputPath,
    persistOutput: persistenceMode(request),
    aggregatePersistedBudget: aggregate,
  });
}

export async function runExecution(
  coordinator: ExecutionCoordinator,
  request: ExecutionRequest,
  options: InternalExecutionRunOptions = {},
): Promise<ExecutionResult> {
  const startedAt = new Date();
  if (coordinator.isClosing) {
    const result = createStoppedResult(startedAt, "cancelled", "Execution adapter is closed.");
    if (!options.suppressTerminalEvent) emitResult(options, result);
    return result;
  }
  let child: ChildProcess | undefined;
  let bashFile: BashFileOutput | undefined;
  let stopReason: StopReason | undefined;
  let exitObserved = false;
  let runtimeTimer: NodeJS.Timeout | undefined;
  let stopProgress: (() => void) | undefined;
  let activeId = "";
  let persistedLimitReached = false;
  let stdout: OutputCollector | undefined;
  let stderr: OutputCollector | undefined;
  let preparedCwdFile: string | undefined;
  let legacyEncoding: string | null = null;
  let finishTelemetry: ((kind: "completed" | "timeout" | "killed" | "error") => void) | undefined;

  const stop = (reason: StopReason): void => {
    if (stopReason) return;
    stopReason = reason;
    if (child) terminateProcessTree(coordinator, child, Boolean(bashFile));
  };
  activeId = coordinator.registerActiveExecution(stop);

  const onAbort = (): void => stop(stopReasonFromSignal(options.signal!));
  if (options.signal?.aborted) stop(stopReasonFromSignal(options.signal));
  else options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (stopReason) {
      const result = createStoppedResult(
        startedAt,
        "cancelled",
        "Command was cancelled before spawn.",
      );
      if (!options.suppressTerminalEvent) emitResult(options, result);
      return result;
    }
    const prepared = await prepareChildSpawn(coordinator, request);
    preparedCwdFile = prepared.cwdFilePath;
    legacyEncoding = prepared.legacyOutputEncoding;
    options.onOutputEncodingResolved?.(legacyEncoding);
    if (stopReason || coordinator.isClosing) {
      stopReason ??= "cancelled";
      const result = createStoppedResult(
        startedAt,
        "cancelled",
        "Command was cancelled before spawn.",
      );
      if (!options.suppressTerminalEvent) emitResult(options, result);
      return result;
    }

    const onPersistedLimit = (): void => {
      persistedLimitReached = true;
      options.onPersistedLimit?.();
      const shouldStop =
        options.shouldStopOnPersistedLimit?.() ??
        prepared.request.outputLimit?.killProcessOnPersistedLimit !== false;
      if (shouldStop) stop("output_limit");
    };
    const paths = coordinator.outputPathsForRequest(request);
    if (prepared.isBash) {
      bashFile = new BashFileOutput(paths.outputPath!, coordinator.platform, legacyEncoding);
      await bashFile.prepare();
      if (stopReason || coordinator.isClosing) {
        stopReason ??= "cancelled";
        await bashFile.discard();
        const result = createStoppedResult(
          startedAt,
          "cancelled",
          "Command was cancelled before spawn.",
        );
        if (!options.suppressTerminalEvent) emitResult(options, result);
        return result;
      }
      prepared.spawnOptions.stdio = [
        prepared.request.stdin === undefined ? "ignore" : "pipe",
        bashFile.fd!,
        bashFile.fd!,
      ];
    } else {
      const aggregate = options.sharePersistedOutputLimitAcrossStreams
        ? { bytes: 0, maxBytes: coordinator.persistedOutputLimit(request) }
        : undefined;
      stdout = createCollector(
        coordinator,
        request,
        "stdout",
        legacyEncoding,
        onPersistedLimit,
        aggregate,
      );
      stderr = createCollector(
        coordinator,
        request,
        "stderr",
        legacyEncoding,
        onPersistedLimit,
        aggregate,
      );
      prepared.spawnOptions.stdio = [
        prepared.request.stdin === undefined ? "ignore" : "pipe",
        "pipe",
        "pipe",
      ];
    }

    child = spawn(prepared.command.file, prepared.command.args, prepared.spawnOptions);
    const observation = observeExit(child);
    const spawned = await waitForSpawn(child);
    if (!spawned.spawned) {
      await bashFile?.discard();
      const completedAt = new Date();
      const failure = toFailure(
        "spawn_error",
        spawned.error ?? new Error("Failed to spawn command."),
      );
      const result = createResult({
        status: "spawn_error",
        startedAt,
        completedAt,
        stdout: emptyStream(),
        stderr: emptyStream(),
        error: failure,
      });
      if (!options.suppressTerminalEvent) emitResult(options, result);
      return result;
    }

    if (bashFile) await bashFile.close();
    if (!options.bashLifecycle?.isBackgrounded()) {
      emit(options, { type: "started", pid: child.pid, timestamp: new Date() });
    }
    const timeoutMs = safeTimeout(prepared.request.timeoutMs);
    if (timeoutMs > 0) {
      runtimeTimer = setTimeout(() => stop("timeout"), timeoutMs);
      runtimeTimer.unref();
    }
    if (stopReason) terminateProcessTree(coordinator, child, prepared.isBash);

    const readInputError = writeChildInput(child, prepared.request.stdin);
    if (bashFile) {
      const bashRuntimeLimit =
        prepared.request.outputLimit?.maxPersistedBytes ??
        coordinator.options.maxPersistedOutputBytes ??
        BASH_RUNTIME_OUTPUT_LIMIT_BYTES;
      bashFile.watchLimit(bashRuntimeLimit, onPersistedLimit);
      if (!options.bashLifecycle?.isBackgrounded()) {
        bashFile.watchProgress(
          coordinator.progressTailBytes,
          coordinator.progressThresholdMs,
          coordinator.progressIntervalMs,
          (output, preview) => {
            if (options.bashLifecycle?.isBackgrounded()) return;
            emit(options, {
              type: "progress",
              elapsedMs: Date.now() - startedAt.getTime(),
              pid: child?.pid,
              stdoutBytes: output.bytes,
              stderrBytes: 0,
              outputPreview: preview,
              stdoutTail: output.text,
              timestamp: new Date(),
            });
          },
        );
      }
    } else if (stdout && stderr) {
      attachPipedOutput(child, stdout, stderr, legacyEncoding, options);
      stopProgress = startGenericProgress(coordinator, options, startedAt, child, stdout, stderr);
    }

    if (prepared.isBash) {
      const telemetry = createBashResourceTelemetry({
        processGroupId: child.pid,
        platform: coordinator.platform,
        onComplete: coordinator.options.onToolExecResource ?? (() => undefined),
      });
      finishTelemetry = (kind) => telemetry.finish(kind);
    }
    const exit = await observation.exit;
    exitObserved = true;
    options.bashLifecycle?.onExit?.();
    if (runtimeTimer) clearTimeout(runtimeTimer);
    runtimeTimer = undefined;
    await drainChildOutput(child, observation.closed, options, Boolean(stopReason), () =>
      terminateProcessTree(coordinator, child!, prepared.isBash),
    );
    await Promise.all([stdout?.close(), stderr?.close()]);

    const inputError = readInputError();
    if (inputError && !isExpectedChildStdinClosureError(inputError) && !exit.error && !stopReason) {
      exit.error = inputError;
    }
    let status = statusFromExit(
      exit,
      stopReason ?? (persistedLimitReached ? "output_limit" : undefined),
    );
    let failure = exit.error
      ? toFailure("spawn_error", exit.error)
      : statusFailure(
          stopReason ?? (persistedLimitReached ? "output_limit" : undefined),
          timeoutMs,
        );
    if (inputError && exit.error === inputError && status === "spawn_error") {
      status = "failed";
      failure = toFailure("unknown", inputError);
    }
    let stdoutResult = bashFile
      ? await readBashResult(bashFile, coordinator.bashInlineLimit(request), exit, stopReason)
      : (stdout?.result() ?? emptyStream());
    let stderrResult = bashFile ? emptyStream() : (stderr?.result() ?? emptyStream());
    if (!bashFile) {
      stdoutResult = await capArtifactStream(stdoutResult, request.outputLimit?.maxArtifactBytes);
      stderrResult = await capArtifactStream(stderrResult, request.outputLimit?.maxArtifactBytes);
    }
    const backgrounded = options.bashLifecycle?.isBackgrounded() ?? false;
    if (!backgrounded) {
      stdoutResult = await applyForegroundArtifactPolicy(stdoutResult, persistenceMode(request));
      stderrResult = await applyForegroundArtifactPolicy(stderrResult, persistenceMode(request));
    }
    const resolvedCwd =
      status === "completed" && !backgrounded
        ? readCapturedCwd(preparedCwdFile, { dialect: prepared.cwdDialect })
        : undefined;
    let result = createResult({
      status,
      startedAt,
      completedAt: new Date(),
      stdout: stdoutResult,
      stderr: stderrResult,
      stopReason: stopReason ?? (persistedLimitReached ? "output_limit" : undefined),
      pid: child.pid,
      exitCode: exit.code,
      signal: exit.signal,
      error: failure,
      resolvedCwd,
    });
    if (bashFile) result = normalizeBashOutputLimitResult(result, persistedLimitReached);
    finishTelemetry?.(
      result.timedOut
        ? "timeout"
        : result.cancelled
          ? "killed"
          : result.status === "completed"
            ? "completed"
            : "error",
    );
    if (!backgrounded && !options.suppressTerminalEvent) emitResult(options, result);
    return result;
  } catch (error) {
    await bashFile?.discard();
    await Promise.all([stdout?.close(), stderr?.close()]);
    const result = createResult({
      status: "spawn_error",
      startedAt,
      completedAt: new Date(),
      stdout: stdout?.result() ?? emptyStream(),
      stderr: stderr?.result() ?? emptyStream(),
      error: toFailure("spawn_error", error),
    });
    finishTelemetry?.("error");
    if (!options.bashLifecycle?.isBackgrounded() && !options.suppressTerminalEvent) {
      emitResult(options, result);
    }
    return result;
  } finally {
    if (runtimeTimer) clearTimeout(runtimeTimer);
    stopProgress?.();
    bashFile?.stopWatching();
    await bashFile?.close();
    options.signal?.removeEventListener("abort", onAbort);
    if (preparedCwdFile && (exitObserved || stopReason)) {
      readCapturedCwd(preparedCwdFile, {
        dialect: coordinator.platform === "win32" ? "cmd" : "posix",
      });
    }
    coordinator.completeActiveExecution(activeId);
  }
}
