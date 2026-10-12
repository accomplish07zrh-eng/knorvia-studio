// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

function notImplemented(name: string): never {
  throw new Error("not implemented: core-tool-01: " + name);
}

export class ToolExecutorImpl {
  private readonly deps: ToolExecutorDeps = notImplemented("deps");
  private readonly backgroundTasks: BackgroundTaskTracker = notImplemented("backgroundTasks");
  constructor(options: ToolExecutorOptions) {
    throw new Error("not implemented: core-tool-01");
  }
  execute(
    toolCall: ExecutableToolCall,
    options?: ToolExecuteOptions,
  ): Promise<ToolExecutionResult> {
    throw new Error("not implemented: core-tool-01");
  }
  trackExternalBackgroundTask(
    toolCall: ExecutableToolCall,
    output: Record<string, unknown>,
    traceContext: TraceContext,
    turnId?: TurnId,
  ): Promise<void> {
    throw new Error("not implemented: core-tool-01");
  }
  executeBatch(
    toolCalls: ExecutableToolCall[],
    options?: ToolBatchExecuteOptions,
  ): Promise<ToolExecutionResult[]> {
    throw new Error("not implemented: core-tool-01");
  }
  async executeSchedule(
    toolCalls: ExecutableToolCall[],
    schedule: ToolSchedule,
    options?: ToolBatchExecuteOptions,
  ): AsyncGenerator<ToolBatchEvent, ToolExecutionResult[], void> {
    throw new Error("not implemented: core-tool-01");
  }
}

export function createToolExecutor(options: ToolExecutorOptions): ToolExecutor {
  throw new Error("not implemented: core-tool-01");
}
