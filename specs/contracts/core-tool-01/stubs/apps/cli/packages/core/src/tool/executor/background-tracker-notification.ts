// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function enqueueTerminalNotification(
  deps: ToolExecutorDeps,
  call: ExecutableToolCall,
  taskId: string,
  status: string,
  traceContext: TraceContext,
  snapshot?: TaskSnapshot,
  launch?: Record<string, unknown>,
): void {
  throw new Error("not implemented: core-tool-01");
}
