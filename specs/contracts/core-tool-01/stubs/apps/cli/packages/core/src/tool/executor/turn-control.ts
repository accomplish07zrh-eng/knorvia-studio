// SPDX-License-Identifier: Apache-2.0

// Stub for core-tool-01: signatures only, bodies throw.

export function withAutomationCreateLimitTurnStop(
  result: ToolExecutionResult,
  input: { error: unknown; toolName: string },
): ToolExecutionResult {
  throw new Error("not implemented: core-tool-01");
}

export function withPlanExitDeniedTurnStop(
  result: ToolExecutionResult,
  input: { mode: CollaborationMode; planEnabled?: boolean; toolName: string },
): ToolExecutionResult {
  throw new Error("not implemented: core-tool-01");
}

export function withWorkflowRefineDeniedFollowUp(
  result: ToolExecutionResult,
  input: { toolName: string },
): ToolExecutionResult {
  throw new Error("not implemented: core-tool-01");
}

export function withTerminalToolTurnStop(
  result: ToolExecutionResult,
  input: { entry: ToolEntry },
): ToolExecutionResult {
  throw new Error("not implemented: core-tool-01");
}
