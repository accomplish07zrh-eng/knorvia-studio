import {
  AMEND_WORKFLOW_TOOL_NAME,
  CoreErrorType,
  CREATE_WORKFLOW_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  isAutomationCreateLimitError,
  type CollaborationMode,
} from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionResult } from "../types.js";

function feedbackMessage(
  result: ToolExecutionResult,
  source: "plan_approval_feedback" | "workflow_refine_feedback",
): string | undefined {
  if (result.error?.type !== CoreErrorType.PermissionDenied) return undefined;
  if (result.error.reasonSource !== source) return undefined;
  const message = result.error.message.trim();
  return message || undefined;
}

export function withAutomationCreateLimitTurnStop(
  result: ToolExecutionResult,
  input: { error: unknown; toolName: string },
): ToolExecutionResult {
  if (result.success
    || input.toolName !== "CronCreate"
    || !isAutomationCreateLimitError(input.error)) {
    return result;
  }
  return {
    ...result,
    modelContent: "Automation creation was not performed because the global retained-task limit of 20 was reached. This limit cannot be recovered automatically in the current turn. Do not list, delete, overwrite, retry, or use another tool. Reply once in the user's language that they must manually delete an existing task on the Automations page and then retry.",
    turnControl: { reason: "automation_create_limit", stopTurnAfterResult: true },
  };
}

export function withPlanExitDeniedTurnStop(
  result: ToolExecutionResult,
  input: { mode: CollaborationMode; planEnabled?: boolean; toolName: string },
): ToolExecutionResult {
  const planEnabled = input.planEnabled ?? ((input.mode as string) === "plan");
  if (!planEnabled || input.toolName !== EXIT_PLAN_MODE_TOOL_NAME || result.success) {
    return result;
  }
  const feedback = feedbackMessage(result, "plan_approval_feedback");
  if (feedback !== undefined && feedback !== `Permission denied for ${EXIT_PLAN_MODE_TOOL_NAME}`) {
    return {
      ...result,
      followUpUserInput: { input: feedback, reasonSource: "plan_approval_feedback" },
      modelContent: "The plan was not approved by the user.",
    };
  }
  return {
    ...result,
    turnControl: { reason: "plan_exit_denied", stopTurnAfterResult: true },
  };
}

export function withWorkflowRefineDeniedFollowUp(
  result: ToolExecutionResult,
  input: { toolName: string },
): ToolExecutionResult {
  if ((input.toolName !== CREATE_WORKFLOW_TOOL_NAME && input.toolName !== AMEND_WORKFLOW_TOOL_NAME)
    || result.success) {
    return result;
  }
  const feedback = feedbackMessage(result, "workflow_refine_feedback");
  if (feedback === undefined) return result;
  return {
    ...result,
    followUpUserInput: { input: feedback, reasonSource: "workflow_refine_feedback" },
    modelContent: "The workflow run was not approved by the user.",
  };
}

export function withTerminalToolTurnStop(
  result: ToolExecutionResult,
  input: { entry: ToolEntry },
): ToolExecutionResult {
  if (!result.success || input.entry.metadata.stopTurnOnSuccess !== true) return result;
  return {
    ...result,
    turnControl: { reason: "subagent_terminal", stopTurnAfterResult: true },
  };
}
