// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 执行协调器：一次适配器实例内的共享状态与清理职责。
// 三张表（活跃执行、后台任务、待收尾的进程树终止）加上 shell 初始化快照管理器，
// 全部封装在闭包里；对外只给操作方法。关闭是幂等的，重复调用复用同一个 promise。

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

/** 一次完成通知的配对：promise 与它的 resolve。 */
function pending<T>(): { promise: Promise<T>; settle: (value: T) => void } {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    settle = accept;
  });
  return { promise, settle };
}

/** 后台任务记录的构造入参。 */
type BackgroundRecordAsk = {
  isBash: boolean;
  startedAt: Date;
  request: ExecutionRequest;
  controller: AbortController;
  outputPaths: ExecutionOutputPaths;
  taskId: string;
};

/** 协调器对外的形状。 */
export interface ExecutionCoordinator {
  readonly activeExecutions: Map<string, ActiveExecutionRecord>;
  readonly backgroundTasks: Map<string, BackgroundTaskRecord>;
  readonly pendingBashProcessTreeKills: Map<Promise<void>, { ref(): unknown }>;
  readonly shellInitSnapshots: ShellInitSnapshotManager;
  readonly outputPathsByRequest: WeakMap<ExecutionRequest, ExecutionOutputPaths>;
  readonly options: NodeExecutionAdapterOptions;
  readonly outputRootDir: string;
  readonly shellInitRetentionCleanup: Promise<unknown>;
  readonly isClosing: boolean;
  readonly platform: NodeJS.Platform;
  readonly processEnv: NodeJS.ProcessEnv;
  readonly progressIntervalMs: number;
  readonly progressTailBytes: number;
  readonly progressThresholdMs: number;
  inlineLimit(request: ExecutionRequest): number;
  bashInlineLimit(request: ExecutionRequest): number;
  persistedOutputLimit(request: ExecutionRequest): number;
  outputPathsForRequest(request: ExecutionRequest): ExecutionOutputPaths;
  registerActiveExecution(stop: (reason: StopReason) => void): string;
  completeActiveExecution(executionId: string): void;
  createBackgroundTaskRecord(ask: BackgroundRecordAsk): BackgroundTaskRecord;
  updateBackgroundTaskRecordFromEvent(record: BackgroundTaskRecord, event: ExecutionEvent): void;
  finalizeBackgroundTaskRecord(record: BackgroundTaskRecord, result: ExecutionResult): void;
  snapshot(record: BackgroundTaskRecord): BackgroundExecutionSnapshot;
  trackBashKill(promise: Promise<void>, timer: { ref(): unknown }): void;
  close(): Promise<void>;
}

/** 输出目录的落点：会话段 / 运行段，运行段优先用工具调用标识。 */
function outputPathsUnder(root: string, request: ExecutionRequest): ExecutionOutputPaths {
  const session = sanitizePathSegment(String(request.trace?.sessionId ?? "session"));
  const identity =
    request.trace?.attributes?.toolCallId ?? request.trace?.spanId ?? request.trace?.traceId;
  const directory = path.join(root, session, sanitizePathSegment(String(identity ?? randomUUID())));
  return {
    outputPath: path.join(directory, "merged.log"),
    stdoutPersistedOutputPath: path.join(directory, "stdout.log"),
    stderrPersistedOutputPath: path.join(directory, "stderr.log"),
  };
}

/** 首个已定义的输出限额；全都缺席时用默认值。 */
function firstDefined(limits: ReadonlyArray<number | undefined>, fallback: number): number {
  for (const limit of limits) {
    if (limit !== undefined) return Math.max(0, limit);
  }
  return fallback;
}

export function createExecutionCoordinator(
  options: NodeExecutionAdapterOptions = {},
): ExecutionCoordinator {
  const activeExecutions = new Map<string, ActiveExecutionRecord>();
  const backgroundTasks = new Map<string, BackgroundTaskRecord>();
  const pendingBashProcessTreeKills = new Map<Promise<void>, { ref(): unknown }>();
  const shellInitSnapshots = new ShellInitSnapshotManager();
  const outputPathsByRequest = new WeakMap<ExecutionRequest, ExecutionOutputPaths>();
  const outputRootDir = options.outputRootDir ?? resolveDefaultOutputRootDir(options.processEnv);
  const shellInitRetentionCleanup = cleanupStaleShellInitSnapshots({ rootDir: outputRootDir });
  const platform = options.platform ?? process.platform;
  const processEnv = options.processEnv ?? process.env;
  let closing = false;
  let closeOnce: Promise<void> | undefined;

  async function shutdown(): Promise<void> {
    closing = true;
    const unfinishedBackground: Promise<BackgroundExecutionSnapshot>[] = [];
    for (const record of backgroundTasks.values()) {
      if (record.result) continue;
      unfinishedBackground.push(record.completion);
      record.status = "cancelled";
      record.controller.abort("cancelled");
    }
    const running = [...activeExecutions.values()];
    for (const record of running) record.stop("cancelled");
    await Promise.allSettled([
      ...running.map((record) => record.completion),
      ...unfinishedBackground,
    ]);
    // 待收尾的进程树终止先解除 unref，否则关闭流程可能一等不到。
    const pendingKills = [...pendingBashProcessTreeKills.entries()];
    for (const [, timer] of pendingKills) timer.ref();
    await Promise.allSettled(pendingKills.map(([promise]) => promise));
    await Promise.resolve(shellInitRetentionCleanup).catch(() => undefined);
    await shellInitSnapshots.cleanup();
  }

  return {
    activeExecutions,
    backgroundTasks,
    pendingBashProcessTreeKills,
    shellInitSnapshots,
    outputPathsByRequest,
    options,
    outputRootDir,
    shellInitRetentionCleanup,
    platform,
    processEnv,

    get isClosing(): boolean {
      return closing;
    },
    get progressIntervalMs(): number {
      return options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;
    },
    get progressTailBytes(): number {
      return options.progressTailBytes ?? DEFAULT_PROGRESS_TAIL_BYTES;
    },
    get progressThresholdMs(): number {
      return options.progressThresholdMs ?? DEFAULT_PROGRESS_THRESHOLD_MS;
    },

    inlineLimit(request: ExecutionRequest): number {
      const limit = request.outputLimit;
      return firstDefined(
        [limit?.maxInlineBytes, limit?.maxBufferBytes],
        DEFAULT_INLINE_OUTPUT_BYTES,
      );
    },

    bashInlineLimit(request: ExecutionRequest): number {
      return resolveBashMaxOutputLength({
        env: processEnv,
        requested: request.outputLimit?.maxInlineBytes,
      });
    },

    persistedOutputLimit(request: ExecutionRequest): number {
      return firstDefined(
        [request.outputLimit?.maxPersistedBytes, options.maxPersistedOutputBytes],
        DEFAULT_MAX_PERSISTED_OUTPUT_BYTES,
      );
    },

    /** 每个请求一份输出路径；同一请求重复问只算一次。 */
    outputPathsForRequest(request: ExecutionRequest): ExecutionOutputPaths {
      const cached = outputPathsByRequest.get(request);
      if (cached) return cached;
      const created = outputPathsUnder(outputRootDir, request);
      outputPathsByRequest.set(request, created);
      return created;
    },

    registerActiveExecution(stop: (reason: StopReason) => void): string {
      const executionId = randomUUID();
      const completion = pending<void>();
      let done = false;
      activeExecutions.set(executionId, {
        stop,
        completion: completion.promise,
        resolveCompletion: () => {
          if (done) return;
          done = true;
          completion.settle();
        },
      });
      return executionId;
    },

    completeActiveExecution(executionId: string): void {
      const record = activeExecutions.get(executionId);
      if (!record) return;
      activeExecutions.delete(executionId);
      record.resolveCompletion();
    },

    createBackgroundTaskRecord(ask: BackgroundRecordAsk): BackgroundTaskRecord {
      const completion = pending<BackgroundExecutionSnapshot>();
      const record = {} as BackgroundTaskRecord;
      record.taskId = ask.taskId;
      record.status = "running";
      record.startedAt = ask.startedAt;
      record.sessionId = ask.request.trace?.sessionId
        ? String(ask.request.trace.sessionId)
        : undefined;
      record.isBash = ask.isBash;
      record.legacyOutputEncoding = null;
      record.controller = ask.controller;
      record.completion = completion.promise;
      record.resolveCompletion = completion.settle;
      record.outputPath = ask.outputPaths.outputPath;
      record.stdoutPersistedOutputPath = ask.outputPaths.stdoutPersistedOutputPath;
      record.stderrPersistedOutputPath = ask.outputPaths.stderrPersistedOutputPath;
      return record;
    },

    /** 把流式事件并入记录：字节数累加、尾部截到配置长度。 */
    updateBackgroundTaskRecordFromEvent(record: BackgroundTaskRecord, event: ExecutionEvent): void {
      if (event.type === "started") {
        record.pid = event.pid;
        return;
      }
      if (event.type === "stdout" || event.type === "stderr") {
        const stream = event.type;
        const bytesKey = `${stream}Bytes` as "stdoutBytes" | "stderrBytes";
        const tailKey = `${stream}Tail` as "stdoutTail" | "stderrTail";
        record[bytesKey] = (record[bytesKey] ?? 0) + event.chunk.byteLength;
        record[tailKey] = `${record[tailKey] ?? ""}${event.text}`.slice(-this.progressTailBytes);
        return;
      }
      if (event.type !== "progress") return;
      record.stdoutBytes = event.stdoutBytes;
      record.stderrBytes = event.stderrBytes;
      if (event.stdoutTail !== undefined) record.stdoutTail = event.stdoutTail;
      if (event.stderrTail !== undefined) record.stderrTail = event.stderrTail;
      if (event.outputPreview?.fullText !== undefined)
        record.stdoutTail = event.outputPreview.fullText;
    },

    /** 用最终结果封口：字段取结果里的真实值，尾部按配置长度重截。 */
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
    },

    /** 对外快照：去掉内部字段（控制器、完成回调、编码等），其余原样带出。 */
    snapshot(record: BackgroundTaskRecord): BackgroundExecutionSnapshot {
      const {
        controller: _controller,
        completion: _completion,
        resolveCompletion: _resolveCompletion,
        externalAbort: _externalAbort,
        legacyOutputEncoding: _legacyOutputEncoding,
        isBash: _isBash,
        sessionId: _sessionId,
        ...visible
      } = record;
      return { ...visible };
    },

    trackBashKill(promise: Promise<void>, timer: { ref(): unknown }): void {
      pendingBashProcessTreeKills.set(promise, timer);
      const forget = () => pendingBashProcessTreeKills.delete(promise);
      void promise.then(forget, forget);
    },

    close(): Promise<void> {
      closeOnce ??= shutdown();
      return closeOnce;
    },
  };
}
