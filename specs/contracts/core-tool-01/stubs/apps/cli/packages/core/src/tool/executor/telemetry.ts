// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function runToolCallWithTelemetry(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  options: ToolExecuteOptions | undefined,
  execute: (telemetry: ToolExecutionSpanWriter | undefined) => Promise<ToolExecutionResult>,
): Promise<ToolExecutionResult> {
  throw new Error("not implemented: core-tool-01");
}
