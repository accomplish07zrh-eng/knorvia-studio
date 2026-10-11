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

// 原样透传的键：与 ToolExecutorOptions 同名同义，逐个列出便于核对新增项。
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

const DEFAULT_TOOL_TIMEOUT_MS = 300_000;
const DEFAULT_TOOL_MAX_CONCURRENCY = 10;
const DEFAULT_RUNTIME_SCOPE = "main";
const DEFAULT_MODE = "build";
const DEFAULT_WORKING_DIRECTORY = ".";

function buildExecutorDeps(options: ToolExecutorOptions): ToolExecutorDeps {
  const passthrough: Record<string, unknown> = {};
  for (const key of PASSTHROUGH_DEP_KEYS) passthrough[key] = options[key];
  return {
    ...passthrough,
    permissionBroker: options.permissionBroker ?? createDenyPermissionBroker(),
    defaultTimeoutMs: options.defaultTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    readFileState: options.readFileState ?? new Map(),
    getWorkingDirectory:
      options.getWorkingDirectory ?? (() => options.workingDirectory ?? DEFAULT_WORKING_DIRECTORY),
    getWorkspaceRoot:
      options.getWorkspaceRoot ??
      (() =>
        options.workspaceRoot ??
        options.getWorkingDirectory?.() ??
        options.workingDirectory ??
        DEFAULT_WORKING_DIRECTORY),
    runtimeScope: options.runtimeScope ?? DEFAULT_RUNTIME_SCOPE,
    getMode: options.getMode ?? (() => options.mode ?? DEFAULT_MODE),
    maxConcurrency: options.maxConcurrency ?? DEFAULT_TOOL_MAX_CONCURRENCY,
  } as ToolExecutorDeps;
}

export class ToolExecutorImpl implements ToolExecutor {
  private readonly deps: ToolExecutorDeps;
  private readonly backgroundTasks: BackgroundTaskTracker;

  constructor(options: ToolExecutorOptions) {
    this.deps = buildExecutorDeps(options);
    this.backgroundTasks = new BackgroundTaskTracker(this.deps);
  }

  execute(
    toolCall: ExecutableToolCall,
    options?: ToolExecuteOptions,
  ): Promise<ToolExecutionResult> {
    return executeToolCall(this.deps, this.backgroundTasks, toolCall, options);
  }

  trackExternalBackgroundTask(
    toolCall: ExecutableToolCall,
    output: Record<string, unknown>,
    traceContext: TraceContext,
    turnId?: TurnId,
  ): Promise<void> {
    // 与 submit 路径同一个 tracker 实例、同一条 trackBackgroundTask：resume 重臂的行为
    // 按构造等于工具启动路径的行为，两条路径不可能漂移（见 ToolExecutor 接口注释）。
    return this.backgroundTasks.trackBackgroundTask(toolCall, output, traceContext, turnId);
  }

  executeBatch(
    toolCalls: ExecutableToolCall[],
    options?: ToolBatchExecuteOptions,
  ): Promise<ToolExecutionResult[]> {
    return executeToolBatch(
      this.deps,
      (toolCall, executeOptions) => {
        return this.execute(toolCall, executeOptions);
      },
      toolCalls,
      options,
    );
  }

  async *executeSchedule(
    toolCalls: ExecutableToolCall[],
    schedule: ToolSchedule,
    options?: ToolBatchExecuteOptions,
  ): AsyncGenerator<ToolBatchEvent, ToolExecutionResult[], void> {
    return yield* executeToolSchedule(
      this.deps,
      (batchToolCalls, batchOptions) => this.executeBatch(batchToolCalls, batchOptions),
      toolCalls,
      schedule,
      options,
    );
  }
}

export function createToolExecutor(options: ToolExecutorOptions): ToolExecutor {
  return new ToolExecutorImpl(options);
}
