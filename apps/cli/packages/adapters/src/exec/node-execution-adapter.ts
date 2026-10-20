// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// Node 执行端口的门面。对外只暴露契约里的方法与关闭入口；
// 真正的工作分散在协调器（共享状态、清理）、生命周期（后台任务）与运行流程三处，
// 本文件只做一次组装与逐项转发，不持有任何判断逻辑。

import type {
  BackgroundExecutionSnapshot,
  BackgroundExecutionStartResult,
  ExecutionPort,
  ExecutionRequest,
  ExecutionResult,
  ExecutionRunOptions,
} from "@knorvia/contracts";
import type { BackgroundBashOutputResult } from "@knorvia/shared";
import type {
  BashBackgroundLifecycleMode,
  BashBackgroundLifecycleResult,
  NodeExecutionAdapterOptions,
} from "./execution-adapter-types.js";
import {
  createExecutionCoordinator,
  type ExecutionCoordinator,
} from "./node-execution-adapter-base.js";
import {
  createExecutionLifecycle,
  type ExecutionLifecycle,
} from "./node-execution-adapter-lifecycle.js";
import { runExecution } from "./node-execution-adapter-run.js";

// 缩短签名里的类型拼写，让每个方法签名都能落在一行，同时不改任何对外类型。
type Ask = ExecutionRequest;
type Opts = ExecutionRunOptions;
type Snapshot = BackgroundExecutionSnapshot | undefined;
type Started = BackgroundExecutionStartResult;
type LifecycleAsk = { mode: BashBackgroundLifecycleMode };

/** 三个协作方各管一段；门面把它们合成一份能力表。 */
type Ports = { runner: ExecutionCoordinator; background: ExecutionLifecycle };

function composePorts(options: NodeExecutionAdapterOptions): Ports {
  const runner = createExecutionCoordinator(options);
  return { runner, background: createExecutionLifecycle(runner) };
}

export class NodeExecutionAdapter implements ExecutionPort {
  readonly #ports: Ports;

  constructor(options: NodeExecutionAdapterOptions = {}) {
    this.#ports = composePorts(options);
  }

  run(request: Ask, options?: Opts): Promise<ExecutionResult> {
    return runExecution(this.#ports.runner, request, options);
  }

  start(request: Ask, options?: Opts): Promise<Started> {
    return this.#ports.background.start(request, options);
  }

  runBashWithBackgroundLifecycle(
    request: Ask,
    lifecycle: LifecycleAsk,
    options?: Opts,
  ): Promise<BashBackgroundLifecycleResult> {
    return this.#ports.background.runBashWithBackgroundLifecycle(request, lifecycle, options);
  }

  readBackgroundBashOutput(workId: string, sessionId: string): Promise<BackgroundBashOutputResult> {
    return this.#ports.background.readBackgroundBashOutput(workId, sessionId);
  }

  getBackgroundTask(taskId: string): Promise<Snapshot> {
    return this.#ports.background.getBackgroundTask(taskId);
  }

  waitForBackgroundTask(taskId: string, options?: { signal?: AbortSignal }): Promise<Snapshot> {
    return this.#ports.background.waitForBackgroundTask(taskId, options);
  }

  cancelBackgroundTask(taskId: string): Promise<Snapshot> {
    return this.#ports.background.cancelBackgroundTask(taskId);
  }

  close(): Promise<void> {
    return this.#ports.runner.close();
  }
}

export function createNodeExecutionAdapter(options?: NodeExecutionAdapterOptions): ExecutionPort {
  return new NodeExecutionAdapter(options);
}
