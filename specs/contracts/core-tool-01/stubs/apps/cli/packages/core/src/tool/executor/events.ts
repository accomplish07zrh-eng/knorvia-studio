// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function emitToolCallStarted(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
  startTime: number,
  display?: ToolResultDisplayPayload,
  capability?: { readOnly?: boolean; sideEffectScope?: ToolSideEffectScope },
): Promise<void> {
  throw new Error("not implemented: core-tool-01");
}

export function emitToolCallResult(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
  serialization: ToolResultSerialization,
  durationMs: number,
  display: ToolResultDisplayPayload | undefined,
  perf: ToolExecutionTelemetry | undefined,
  skillMetadata: SkillTelemetryMetadata | undefined,
): Promise<void> {
  throw new Error("not implemented: core-tool-01");
}

export function emitToolCallError(
  deps: ToolExecutorDeps,
  toolCallId: string,
  traceContext: TraceContext,
  turnId: TurnId | undefined,
  error: ToolExecutionResult["error"],
  skillMetadata?: SkillTelemetryMetadata,
): Promise<void> {
  throw new Error("not implemented: core-tool-01");
}

export function emitSkippedToolError(
  deps: ToolExecutorDeps,
  result: ToolExecutionResult,
  traceContext?: TraceContext,
): Promise<void> {
  throw new Error("not implemented: core-tool-01");
}

export function emitPermissionRequested(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  input: unknown,
  requestId: string,
  riskLevel: PermissionContext["riskLevel"],
  reason: string | undefined,
  suggestedPermissionUpdates: PermissionUpdate[],
  traceContext: TraceContext,
  approval?: { display?: ToolResultDisplayPayload; optionsPolicy?: PermissionOptionsPolicy },
): Promise<void> {
  throw new Error("not implemented: core-tool-01");
}

export function emitPermissionResolved(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  requestId: string,
  decision: PermissionBrokerResult,
  traceContext: TraceContext,
): Promise<void> {
  throw new Error("not implemented: core-tool-01");
}

export function emitPermissionDenied(
  deps: ToolExecutorDeps,
  toolCall: ExecutableToolCall,
  reason: string | undefined,
  traceContext: TraceContext,
): Promise<void> {
  throw new Error("not implemented: core-tool-01");
}
