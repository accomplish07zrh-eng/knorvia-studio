// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { execFile } from "node:child_process";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { ExecutionRequest } from "@knorvia/contracts";
import { resolveEffectiveBashShellSelection } from "./bash-shell-provider.js";
import { applyBashSourcesToExecutionRequest } from "./bash-startup-script.js";
import { createCwdCapturePlan } from "./cwd-capture.js";
import {
  applyResolvedShellCommand,
  buildExecutionEnv,
  resolveExecutionCommand,
  setResolvedShellLoginMode,
  type ResolvedSpawnCommand,
} from "./execution-command.js";
import type { InternalExecutionRunOptions, PreparedExecution } from "./execution-adapter-types.js";
import { ExecutionCoordinator } from "./node-execution-adapter-base.js";
import {
  createExecutionOutputStreamDecoder,
  resolveLegacyExecutionOutputEncoding,
} from "./outputEncoding.js";
import {
  BASH_SIGTERM_TO_SIGKILL_MS,
  signalPosixProcessTree,
  terminateGenericPosixProcessGroup,
} from "./process-tree.js";
import { revalidateShellInitSnapshotForExecution } from "./shell-init-snapshot.js";
import { IO_DRAIN_TIMEOUT_MS, waitForPromise } from "./execution-utils.js";
import type { OutputCollector } from "./output-collector.js";
import { emit } from "./node-execution-adapter-results.js";

function providerCommand(
  file: string,
  dialect: "cmd" | "posix" | "git-bash",
  envOverlay?: Record<string, string>,
): ResolvedSpawnCommand {
  if (dialect === "cmd")
    return { file, args: ["/d", "/s", "/c", ""], cwdDialect: dialect, shell: false };
  return {
    file,
    args: ["-l", "-c", ""],
    cwdDialect: dialect,
    shell: false,
    usesLoginShell: true,
    envOverlay,
  };
}

function mergeEnv(
  base: NodeJS.ProcessEnv,
  overlay: Record<string, string> | undefined,
): NodeJS.ProcessEnv {
  return overlay ? { ...base, ...overlay } : base;
}

export async function prepareChildSpawn(
  coordinator: ExecutionCoordinator,
  original: ExecutionRequest,
): Promise<PreparedExecution> {
  const env = buildExecutionEnv(original.env, {
    network: coordinator.options.network,
    platform: coordinator.platform,
    processEnv: coordinator.processEnv,
  });
  let request = original;
  let resolvedShell: ResolvedSpawnCommand | undefined;
  let leadingSources: Array<{ path: string; shellPath: string; optional?: boolean }> | undefined;
  if (request.command.mode === "shell" && request.command.shellProfile === "posix-bash") {
    const resolution = resolveEffectiveBashShellSelection({
      env,
      platform: coordinator.platform,
      override: request.command.shellOverride,
    });
    if (resolution.provider) {
      resolvedShell = providerCommand(
        resolution.provider.file,
        resolution.provider.dialect,
        resolution.provider.envOverlay,
      );
      const candidate = await coordinator.shellInitSnapshots.getOrCreate({
        env: mergeEnv(env, resolution.provider.envOverlay),
        rootDir: coordinator.outputRootDir,
        shellDialect: resolution.provider.dialect,
        shellPath: resolution.provider.file,
      });
      const snapshot = await revalidateShellInitSnapshotForExecution(candidate);
      if (snapshot) {
        leadingSources = [{ ...snapshot, optional: true }];
        resolvedShell = setResolvedShellLoginMode(resolvedShell, false);
      }
      request = applyBashSourcesToExecutionRequest(request, {
        leadingSources,
        rootDir: coordinator.outputRootDir,
        sessionId: String(request.trace?.sessionId ?? "session"),
        shellDialect: resolution.provider.dialect,
      });
    }
  }
  let command = resolveExecutionCommand(request.command, {
    cwd: request.cwd,
    env,
    platform: coordinator.platform,
    resolvedShell,
  });
  const capture = createCwdCapturePlan(request, {
    dialect: command.cwdDialect,
    platform: coordinator.platform,
  });
  if (capture.command !== request.command) {
    request = { ...request, command: capture.command };
    if (capture.command.mode === "shell")
      command = applyResolvedShellCommand(command, capture.command.command);
  }
  const spawnOptions: SpawnOptions = {
    cwd: request.cwd,
    env: mergeEnv(env, command.envOverlay),
    detached: coordinator.platform !== "win32",
    shell: command.shell,
    windowsHide: true,
  };
  const legacyOutputEncoding = resolveLegacyExecutionOutputEncoding({
    platform: coordinator.platform,
    processEnv: coordinator.processEnv,
  });
  return {
    command,
    cwdDialect: command.cwdDialect,
    cwdFilePath: capture.cwdFilePath,
    spawnOptions,
    request,
    isBash: request.command.mode === "shell" && request.command.shellProfile === "posix-bash",
    legacyOutputEncoding,
  };
}

export function attachPipedOutput(
  child: ChildProcess,
  stdout: OutputCollector,
  stderr: OutputCollector,
  encoding: string | null,
  options: InternalExecutionRunOptions,
): void {
  const stdoutDecoder = createExecutionOutputStreamDecoder(encoding);
  const stderrDecoder = createExecutionOutputStreamDecoder(encoding);
  child.stdout?.on("data", (value: Buffer | Uint8Array) => {
    const chunk = Buffer.from(value);
    stdout.append(chunk, child.stdout ?? undefined);
    emitChunk(options, "stdout", chunk, stdoutDecoder.write(chunk));
  });
  child.stderr?.on("data", (value: Buffer | Uint8Array) => {
    const chunk = Buffer.from(value);
    stderr.append(chunk, child.stderr ?? undefined);
    emitChunk(options, "stderr", chunk, stderrDecoder.write(chunk));
  });
}

export function startGenericProgress(
  coordinator: ExecutionCoordinator,
  options: InternalExecutionRunOptions,
  startedAt: Date,
  child: ChildProcess,
  stdout: OutputCollector,
  stderr: OutputCollector,
): () => void {
  let interval: NodeJS.Timeout | undefined;
  const delay = setTimeout(() => {
    interval = setInterval(() => {
      if (options.bashLifecycle?.isBackgrounded()) return;
      emit(options, {
        type: "progress",
        elapsedMs: Date.now() - startedAt.getTime(),
        pid: child.pid,
        stdoutBytes: stdout.bytes,
        stderrBytes: stderr.bytes,
        stdoutTail: stdout.tailText(),
        stderrTail: stderr.tailText(),
        timestamp: new Date(),
      });
    }, coordinator.progressIntervalMs);
    interval.unref();
  }, coordinator.progressThresholdMs);
  delay.unref();
  return () => {
    clearTimeout(delay);
    if (interval) clearInterval(interval);
  };
}

function emitChunk(
  options: InternalExecutionRunOptions,
  type: "stdout" | "stderr",
  chunk: Buffer,
  text: string,
): void {
  if (options.bashLifecycle?.isBackgrounded()) return;
  try {
    const pending = options.onEvent?.({ type, chunk, text, timestamp: new Date() });
    if (pending) void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // Event callbacks cannot affect execution.
  }
}

export function writeChildInput(
  child: ChildProcess,
  input: ExecutionRequest["stdin"],
): () => Error | undefined {
  let failure: Error | undefined;
  if (input === undefined || !child.stdin) return () => failure;
  child.stdin.on("error", (error) => {
    failure = error;
  });
  try {
    child.stdin.end(typeof input === "string" ? input : Buffer.from(input));
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }
  return () => failure;
}

export function destroyChildOutputStreams(child: ChildProcess): void {
  child.stdout?.destroy();
  child.stderr?.destroy();
}

export async function drainChildOutput(
  child: ChildProcess,
  closed: Promise<void>,
  options: InternalExecutionRunOptions,
  terminationRequested: boolean,
  terminate: () => void,
): Promise<void> {
  if (await waitForPromise(closed, IO_DRAIN_TIMEOUT_MS)) return;
  if (options.shouldRetainExecutionAfterRootExit?.() && !terminationRequested) {
    await closed.catch(() => undefined);
    return;
  }
  terminate();
  if (!(await waitForPromise(closed, IO_DRAIN_TIMEOUT_MS))) destroyChildOutputStreams(child);
}

export function terminateProcessTree(
  coordinator: ExecutionCoordinator,
  child: ChildProcess,
  useBashProcessTreeStop: boolean,
): void {
  const pid = child.pid;
  if (!pid) return;
  if (coordinator.platform === "win32") {
    execFile("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true }, () => undefined);
    return;
  }
  if (!useBashProcessTreeStop) {
    terminateGenericPosixProcessGroup(child);
    return;
  }
  const first = signalPosixProcessTree(pid, "SIGTERM");
  let timer!: NodeJS.Timeout;
  let refRequested = false;
  const completion = first.then(
    () =>
      new Promise<void>((resolve) => {
        timer = setTimeout(
          () => void signalPosixProcessTree(pid, "SIGKILL").finally(resolve),
          BASH_SIGTERM_TO_SIGKILL_MS,
        );
        if (refRequested) timer.ref();
        else timer.unref();
      }),
    () => undefined,
  );
  const timerRef = {
    ref: () => {
      refRequested = true;
      timer?.ref();
    },
  };
  coordinator.trackBashKill(
    Promise.resolve(completion).then(() => undefined),
    timerRef,
  );
}
