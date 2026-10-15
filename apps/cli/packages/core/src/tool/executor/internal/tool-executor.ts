// SPDX-License-Identifier: Apache-2.0
// 执行器装配与委托。
//
// 两件事：把 ToolExecutorOptions 归一化成执行器真正需要的 deps（默认值只在这里补一次），
// 再把四个入口按职责委托出去——单次调用、批次、调度、外部后台任务。
// 委托方不加工结果、不吞异常、不重试：并发与取消都由被委托方按各自规格处理。

import type { TraceContext, TurnId } from "@knorvia/contracts";
import { createDenyPermissionBroker } from "../../../permission/broker.js";
import type { ToolSchedule } from "../../scheduler.js";
import type { ExecutableToolCall, ToolBatchEvent, ToolExecutionResult } from "../../types.js";
import { BackgroundTaskTracker } from "../background-tasks.js";
import { executeToolBatch, executeToolSchedule } from "../batch-runner.js";
import { executeToolCall } from "../call-runner.js";
import type {
  ToolBatchExecuteOptions,
  ToolExecuteOptions,
  ToolExecutor,
  ToolExecutorDeps,
  ToolExecutorOptions,
} from "../types.js";

type ToolCall = ExecutableToolCall;
type ToolOutcome = Promise<ToolExecutionResult>;
type Trace = TraceContext;
type TaskOutput = Record<string, unknown>;
type BatchResults = ToolExecutionResult[];
/** 装配前的选项集合。 */
type ExecutorOptions = ToolExecutorOptions;
/** 一次调用的执行选项。 */
type CallOptions = ToolExecuteOptions | undefined;

const DEFAULT_TOOL_TIMEOUT_MS = 300_000;
const DEFAULT_TOOL_MAX_CONCURRENCY = 10;
const DEFAULT_RUNTIME_SCOPE = "main";
const DEFAULT_MODE = "build";
const DEFAULT_WORKING_DIRECTORY = ".";

// 与 ToolExecutorOptions 同名同义的键按组列出，逐个透传；新增字段时对着这份清单补。
const PASSTHROUGH_DEP_KEYS = [
  "agentTelemetry agentTelemetryActorKind registry permissionService emitEvent",
  "enqueueBackgroundTaskNotification shouldEnqueueBackgroundTaskNotification sessionId turnId",
  "permissionTimeoutMs logger backgroundTaskControlPort executionPort browserControlPort",
  "browserDocumentationRoot fileSystemPort httpClientPort imageProcessorPort pdfDocumentPort model",
  "embeddedSearchBackend nativeSearchEnhancementsEnabled skillPort subagentPort coordinatorResponsePort",
  "workflowSubmitPort workflowEscalatePort artifactStore automationPort offPeakPort sessionStore",
  "sessionModePort workflowPort dynamicWorkflowRunPort dynamicWorkflowSnippetPort modelCatalogPort",
  "runtimeTaskRegistry subagentBackgroundBashMaxMs bashShellSelection getBashShellSelection",
  "setWorkingDirectory workspaceIdentity remoteSessionId clientMode deliveryKind getMemoryRoot",
  "traceContext hookRunner",
].flatMap((group) => group.split(" ")) as readonly (keyof ToolExecutorOptions)[];

// 默认值先算成具名局部量：装配对象只做拼接，一眼能看出哪些是兜底。
function buildExecutorDeps(options: ExecutorOptions): ToolExecutorDeps {
  const passthrough: Record<string, unknown> = {};
  for (const key of PASSTHROUGH_DEP_KEYS) passthrough[key] = options[key];

  const permissionBroker = options.permissionBroker ?? createDenyPermissionBroker();
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const readFileState = options.readFileState ?? new Map();
  const getWorkingDirectory =
    options.getWorkingDirectory ?? (() => options.workingDirectory ?? DEFAULT_WORKING_DIRECTORY);
  const getWorkspaceRoot =
    options.getWorkspaceRoot ??
    (() =>
      options.workspaceRoot ??
      options.getWorkingDirectory?.() ??
      options.workingDirectory ??
      DEFAULT_WORKING_DIRECTORY);
  const runtimeScope = options.runtimeScope ?? DEFAULT_RUNTIME_SCOPE;
  const getMode = options.getMode ?? (() => options.mode ?? DEFAULT_MODE);
  const maxConcurrency = options.maxConcurrency ?? DEFAULT_TOOL_MAX_CONCURRENCY;

  const resolved: Record<string, unknown> = {
    ...passthrough,
    permissionBroker,
    defaultTimeoutMs,
    readFileState,
    getWorkingDirectory,
    getWorkspaceRoot,
    runtimeScope,
    getMode,
    maxConcurrency,
  };
  return resolved as unknown as ToolExecutorDeps;
}

export class ToolExecutorImpl implements ToolExecutor {
  private readonly deps: ToolExecutorDeps;
  private readonly tracker: BackgroundTaskTracker;

  constructor(options: ExecutorOptions) {
    this.deps = buildExecutorDeps(options);
    this.tracker = new BackgroundTaskTracker(this.deps);
  }

  execute(toolCall: ToolCall, options?: CallOptions): ToolOutcome {
    const { deps, tracker } = this;
    return executeToolCall(deps, tracker, toolCall, options);
  }

  trackExternalBackgroundTask(
    toolCall: ToolCall,
    output: TaskOutput,
    traceContext: Trace,
    turnId?: TurnId,
  ): Promise<void> {
    // 复用同一个 tracker 实例与同一条 trackBackgroundTask：resume 重臂因此与启动路径同构，
    // 两条路径的行为不可能各自漂移（见 ToolExecutor 接口注释）。
    const { tracker } = this;
    return tracker.trackBackgroundTask(toolCall, output, traceContext, turnId);
  }

  executeBatch(
    toolCalls: readonly ToolCall[],
    options?: ToolBatchExecuteOptions,
  ): Promise<BatchResults> {
    const runOne = (toolCall: ToolCall, executeOptions: ToolExecuteOptions | undefined) =>
      this.execute(toolCall, executeOptions);
    return executeToolBatch(this.deps, runOne, [...toolCalls], options) as Promise<BatchResults>;
  }

  async *executeSchedule(
    toolCalls: readonly ToolCall[],
    schedule: ToolSchedule,
    options?: ToolBatchExecuteOptions,
  ): AsyncGenerator<ToolBatchEvent, BatchResults, void> {
    const runBatch = (batchCalls: readonly ToolCall[], batchOptions?: ToolBatchExecuteOptions) =>
      this.executeBatch(batchCalls, batchOptions);
    return yield* executeToolSchedule(this.deps, runBatch, [...toolCalls], schedule, options);
  }
}

export function createToolExecutor(options: ExecutorOptions): ToolExecutor {
  return new ToolExecutorImpl(options);
}
