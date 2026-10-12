// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function isDynamicWorkflowRunDispatchToolName(name: string): boolean {
  throw new Error("not implemented: core-tool-01");
}

export function registerRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
  output: Record<string, unknown>,
  turnId?: RuntimeTaskSnapshot["turnId"],
): void {
  throw new Error("not implemented: core-tool-01");
}

export function updateRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
  status: string,
  snapshot?: BackgroundTaskSnapshot,
): void {
  throw new Error("not implemented: core-tool-01");
}

export function claimRuntimeBackgroundTaskNotification(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): boolean {
  throw new Error("not implemented: core-tool-01");
}

export function releaseRuntimeBackgroundTaskNotification(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): void {
  throw new Error("not implemented: core-tool-01");
}

export function removeRuntimeBackgroundTask(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  taskId: string,
): void {
  throw new Error("not implemented: core-tool-01");
}
