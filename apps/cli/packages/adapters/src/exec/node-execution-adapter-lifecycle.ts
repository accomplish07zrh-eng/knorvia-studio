// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 后台任务的生命周期层：把一次执行从「前台跑着」提升成「后台任务」，
// 并维护任务记录、取消传播、输出回读与等待语义。
//
// 时序约束（改这段时必须保持）：
// - started 事件到达时同步决定「立即转后台」还是「起一个截止定时器」，顺序不能换；
// - 转后台只在 foreground 阶段发生一次，且必须在 resolveHandoff 之前把记录挂到表上；
// - 父信号的解绑与结算都要在最终 then 里做，不能提前。
// 因此下面的编排段一律内联，不抽 async 助手（每多一个 await 边界就多一个微任务）。

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
  ExecutionResult,
} from "@knorvia/contracts";
import { readBashOutput } from "./bash-file-output.js";
import type {
  BackgroundTaskRecord,
  BashBackgroundLifecycleMode,
  BashBackgroundLifecycleResult,
  InternalExecutionRunOptions,
  OutputPersistenceMode,
} from "./execution-adapter-types.js";
import type { ExecutionCoordinator } from "./node-execution-adapter-base.js";
import { applyForegroundArtifactPolicy, emitResult } from "./node-execution-adapter-results.js";
import { runExecution } from "./node-execution-adapter-run.js";
import {
  BASH_RUNTIME_OUTPUT_LIMIT_BYTES,
  DEFAULT_TIMEOUT_MS,
  isBashMergedOutputRequest,
} from "./execution-utils.js";

// 生命周期阶段：前台跑、已转后台、正在收尾。
const PHASE = { foreground: "foreground", background: "background", settling: "settling" } as const;
type Phase = (typeof PHASE)[keyof typeof PHASE];

/** 消费者回调是外部代码：同步异常与异步拒绝都只能被吞掉，不能影响生命周期状态。 */
function tellConsumer(callback: ExecutionRunOptions["onEvent"], event: ExecutionEvent): void {
  let returned: unknown;
  try {
    returned = callback?.(event);
  } catch {
    return;
  }
  if (returned) void Promise.resolve(returned).catch(() => undefined);
}

/** 把父信号接到内部控制器上，返回解绑函数。父信号已中止时立即生效。 */
function bridgeAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  const forward = (): void => target.abort(source.reason);
  if (source.aborted) forward();
  else source.addEventListener("abort", forward, { once: true });
  return () => source.removeEventListener("abort", forward);
}

/** 预先建好落盘文件，避免子进程打开时目录还不存在。 */
async function touchFile(target: string | undefined): Promise<void> {
  if (!target) return;
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const handle = await open(target, "a", 0o600);
  await handle.close();
}

/** 启动回执：只带对外可见字段。 */
function startedView(record: BackgroundTaskRecord): BackgroundExecutionStartResult {
  const view = {} as BackgroundExecutionStartResult;
  view.taskId = record.taskId;
  view.status = "running";
  view.startedAt = record.startedAt;
  view.pid = record.pid;
  view.outputPath = record.outputPath;
  view.stderrPersistedOutputPath = record.stderrPersistedOutputPath;
  view.stdoutPersistedOutputPath = record.stdoutPersistedOutputPath;
  return view;
}

/** 执行在进入运行前就失败时，构造一份与正常结果同形状的失败结果。 */
function spawnFailureResult(startedAt: Date, error: unknown): ExecutionResult {
  const now = new Date();
  const failure = {
    type: "spawn_error" as const,
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  };
  const empty = { text: "", bytes: 0, truncated: false };
  const result = {} as ExecutionResult;
  result.status = "spawn_error";
  result.stdout = empty;
  result.stderr = empty;
  result.durationMs = now.getTime() - startedAt.getTime();
  result.timedOut = false;
  result.cancelled = false;
  result.startedAt = startedAt;
  result.completedAt = now;
  result.error = failure;
  return result;
}

/** 别名：把长签名压成一行，类型本身不变。 */
type Ask = ExecutionRequest;
type Opts = ExecutionRunOptions;
type Snap = BackgroundExecutionSnapshot | undefined;
type ModeAsk = { mode: BashBackgroundLifecycleMode };

/** 后台任务的生命周期门面。 */
export interface ExecutionLifecycle {
  start(request: Ask, options?: Opts): Promise<BackgroundExecutionStartResult>;
  runBashWithBackgroundLifecycle(
    request: Ask,
    lifecycle: ModeAsk,
    options?: Opts,
  ): Promise<BashBackgroundLifecycleResult>;
  readBackgroundBashOutput(workId: string, sessionId: string): Promise<BackgroundBashOutputResult>;
  getBackgroundTask(taskId: string): Promise<Snap>;
  waitForBackgroundTask(taskId: string, options?: { signal?: AbortSignal }): Promise<Snap>;
  cancelBackgroundTask(taskId: string): Promise<Snap>;
}

export function createExecutionLifecycle(coordinator: ExecutionCoordinator): ExecutionLifecycle {
  /** 立即转后台：建记录、挂表、回执三步顺序固定。 */
  async function start(request: Ask, options: Opts = {}): Promise<BackgroundExecutionStartResult> {
    if (coordinator.isClosing) throw new Error("Execution adapter is closed.");
    const taskId = randomUUID();
    const startedAt = new Date();
    const controller = new AbortController();
    const backgroundRequest: ExecutionRequest = {
      ...request,
      captureCwdAfterSuccess: false,
      outputLimit: { ...request.outputLimit, persistOutput: "always" },
    };
    const paths = coordinator.outputPathsForRequest(backgroundRequest);
    const isBash = isBashMergedOutputRequest(backgroundRequest);
    const record = coordinator.createBackgroundTaskRecord({
      controller,
      outputPaths: paths,
      startedAt,
      taskId,
      request: backgroundRequest,
      isBash,
    });
    record.externalAbort = bridgeAbort(options.signal, controller);
    coordinator.backgroundTasks.set(taskId, record);
    const runOptions: InternalExecutionRunOptions = {
      ...options,
      signal: controller.signal,
      onOutputEncodingResolved: (encoding: string | null) => {
        record.legacyOutputEncoding = encoding;
      },
      onEvent: (event: ExecutionEvent) => {
        coordinator.updateBackgroundTaskRecordFromEvent(record, event);
        tellConsumer(options.onEvent, event);
      },
      shouldRetainExecutionAfterRootExit: () => true,
    };
    const execution = (async () => {
      if (!isBash) {
        await Promise.all([
          touchFile(paths.stdoutPersistedOutputPath),
          touchFile(paths.stderrPersistedOutputPath),
        ]);
      }
      return runExecution(coordinator, backgroundRequest, runOptions);
    })();
    void execution
      .then((result) => coordinator.finalizeBackgroundTaskRecord(record, result))
      .catch((error: unknown) => {
        const result = spawnFailureResult(startedAt, error);
        tellConsumer(options.onEvent, {
          type: "failed",
          error: result.error as Extract<ExecutionResult["error"], object>,
          timestamp: new Date(),
        });
        coordinator.finalizeBackgroundTaskRecord(record, result);
      });
    return startedView(record);
  }

  /**
   * bash 的「前台转后台」流程。前台阶段按 timeoutMs 起截止定时器；
   * explicit 模式在 started 事件里立刻转，auto_on_timeout 模式等定时器到点再转。
   */
  async function runBashWithBackgroundLifecycle(
    request: Ask,
    lifecycle: ModeAsk,
    options: Opts = {},
  ): Promise<BashBackgroundLifecycleResult> {
    if (!isBashMergedOutputRequest(request)) {
      return { kind: "foreground", result: await runExecution(coordinator, request, options) };
    }
    const originalPersistence: OutputPersistenceMode =
      request.outputLimit?.persistOutput ?? "on_truncate";
    const controller = new AbortController();
    const detachParentAbort = bridgeAbort(options.signal, controller);
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
    let phase: Phase = PHASE.foreground;
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

    const promote = (): void => {
      if (phase !== PHASE.foreground || pid === undefined || controller.signal.aborted) return;
      phase = PHASE.background;
      if (deadline) clearTimeout(deadline);
      detachParentAbort();
      const taskId = randomUUID();
      record = coordinator.createBackgroundTaskRecord({
        controller,
        outputPaths: coordinator.outputPathsForRequest(executionRequest),
        startedAt,
        taskId,
        request: executionRequest,
        isBash: true,
      });
      record.pid = pid;
      record.legacyOutputEncoding = legacyEncoding;
      coordinator.backgroundTasks.set(taskId, record);
      // 转后台之前就已经达到落盘上限时，直接按取消处理。
      if (persistedLimitReached) controller.abort("output_limit");
      resolveHandoff(startedView(record));
    };

    const foregroundTimeout =
      request.timeoutMs === undefined || !Number.isFinite(request.timeoutMs)
        ? DEFAULT_TIMEOUT_MS
        : request.timeoutMs;
    const runPromise = runExecution(coordinator, executionRequest, {
      ...options,
      signal: controller.signal,
      onOutputEncodingResolved: (encoding) => {
        legacyEncoding = encoding;
        if (record) record.legacyOutputEncoding = encoding;
      },
      onPersistedLimit: () => {
        persistedLimitReached = true;
      },
      shouldStopOnPersistedLimit: () => phase === PHASE.background,
      shouldRetainExecutionAfterRootExit: () => phase === PHASE.background,
      suppressTerminalEvent: true,
      bashLifecycle: {
        isBackgrounded: () => phase === PHASE.background,
        onExit: () => {
          if (phase === PHASE.foreground) phase = PHASE.settling;
          if (deadline) clearTimeout(deadline);
        },
      },
      onEvent: (event) => {
        if (event.type === "started") {
          pid = event.pid;
          startedAt = event.timestamp;
          tellConsumer(options.onEvent, event);
          if (lifecycle.mode === "explicit") promote();
          else if (foregroundTimeout > 0) {
            deadline = setTimeout(promote, foregroundTimeout);
            deadline.unref();
          }
        }
        if (record) coordinator.updateBackgroundTaskRecordFromEvent(record, event);
        if (event.type !== "started" && phase !== PHASE.background) {
          tellConsumer(options.onEvent, event);
        }
      },
    }).then(async (result) => {
      if (deadline) clearTimeout(deadline);
      detachParentAbort();
      if (record) {
        coordinator.finalizeBackgroundTaskRecord(record, result);
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

  /** 回读后台 bash 的输出；任务不存在、不属于 bash、或读失败各有独立形态。 */
  async function readBackgroundBashOutput(
    workId: string,
    sessionId: string,
  ): Promise<BackgroundBashOutputResult> {
    const record = coordinator.backgroundTasks.get(workId);
    if (!record || record.sessionId !== sessionId)
      return { kind: "unavailable", workId, code: "not_found" };
    if (!record.isBash || !record.outputPath) return { kind: "unsupported", workId };
    const snapshot = coordinator.snapshot(record);
    let output: Awaited<ReturnType<typeof readBashOutput>>;
    try {
      output = await readBashOutput(
        record.outputPath,
        BACKGROUND_BASH_OUTPUT_MAX_BYTES,
        true,
        record.legacyOutputEncoding,
      );
    } catch (error) {
      return { kind: "read_failed", workId, code: (error as NodeJS.ErrnoException).code };
    }
    // 已标记取消但结果还没落地时，对外仍报 running，避免读到「取消但还在写」的中间态。
    const status = !record.result && snapshot.status === "cancelled" ? "running" : snapshot.status;
    const view = {} as Extract<BackgroundBashOutputResult, { kind: "output" }>;
    view.kind = "output";
    view.workId = workId;
    view.status = status;
    view.output = output.text;
    view.truncated = output.truncated;
    view.outputPath = record.outputPath;
    return view;
  }

  async function getBackgroundTask(
    taskId: string,
  ): Promise<BackgroundExecutionSnapshot | undefined> {
    const record = coordinator.backgroundTasks.get(taskId);
    return record ? coordinator.snapshot(record) : undefined;
  }

  /** 等任务完成；调用方给的信号中止时立刻返回当前快照。 */
  async function waitForBackgroundTask(
    taskId: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<Snap> {
    const record = coordinator.backgroundTasks.get(taskId);
    if (!record) return undefined;
    if (record.result || options.signal?.aborted) return coordinator.snapshot(record);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (snapshot: BackgroundExecutionSnapshot): void => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", onAbort);
        resolve(snapshot);
      };
      const onAbort = (): void => finish(coordinator.snapshot(record));
      options.signal?.addEventListener("abort", onAbort, { once: true });
      void record.completion.then(finish);
    });
  }

  /** 取消运行中的后台任务；已结束的任务只回快照，不改状态。 */
  async function cancelBackgroundTask(
    taskId: string,
  ): Promise<BackgroundExecutionSnapshot | undefined> {
    const record = coordinator.backgroundTasks.get(taskId);
    if (!record) return undefined;
    if (!record.result && record.status === "running") {
      record.status = "cancelled";
      record.controller.abort("cancelled");
    }
    return coordinator.snapshot(record);
  }

  return {
    start,
    runBashWithBackgroundLifecycle,
    readBackgroundBashOutput,
    getBackgroundTask,
    waitForBackgroundTask,
    cancelBackgroundTask,
  };
}
