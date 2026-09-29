// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
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
import { ExecutionCoordinator } from "./node-execution-adapter-base.js";
import { ExecutionLifecycle } from "./node-execution-adapter-lifecycle.js";
import { runExecution } from "./node-execution-adapter-run.js";

export class NodeExecutionAdapter implements ExecutionPort {
  private readonly coordinator: ExecutionCoordinator;
  private readonly lifecycle: ExecutionLifecycle;

  constructor(options: NodeExecutionAdapterOptions = {}) {
    this.coordinator = new ExecutionCoordinator(options);
    this.lifecycle = new ExecutionLifecycle(this.coordinator);
  }

  run(request: ExecutionRequest, options?: ExecutionRunOptions): Promise<ExecutionResult> {
    return runExecution(this.coordinator, request, options);
  }

  start(
    request: ExecutionRequest,
    options?: ExecutionRunOptions,
  ): Promise<BackgroundExecutionStartResult> {
    return this.lifecycle.start(request, options);
  }

  runBashWithBackgroundLifecycle(
    request: ExecutionRequest,
    lifecycle: { mode: BashBackgroundLifecycleMode },
    options?: ExecutionRunOptions,
  ): Promise<BashBackgroundLifecycleResult> {
    return this.lifecycle.runBashWithBackgroundLifecycle(request, lifecycle, options);
  }

  readBackgroundBashOutput(workId: string, sessionId: string): Promise<BackgroundBashOutputResult> {
    return this.lifecycle.readBackgroundBashOutput(workId, sessionId);
  }

  getBackgroundTask(taskId: string): Promise<BackgroundExecutionSnapshot | undefined> {
    return this.lifecycle.getBackgroundTask(taskId);
  }

  waitForBackgroundTask(
    taskId: string,
    options?: { signal?: AbortSignal },
  ): Promise<BackgroundExecutionSnapshot | undefined> {
    return this.lifecycle.waitForBackgroundTask(taskId, options);
  }

  cancelBackgroundTask(taskId: string): Promise<BackgroundExecutionSnapshot | undefined> {
    return this.lifecycle.cancelBackgroundTask(taskId);
  }

  close(): Promise<void> {
    return this.coordinator.close();
  }
}

export function createNodeExecutionAdapter(options?: NodeExecutionAdapterOptions): ExecutionPort {
  return new NodeExecutionAdapter(options);
}
