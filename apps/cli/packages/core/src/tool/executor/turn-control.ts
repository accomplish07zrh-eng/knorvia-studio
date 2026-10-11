// SPDX-License-Identifier: Apache-2.0
// 回合控制：把「这次工具结果要不要终止 turn / 追加用户输入」从业务结果里投影出来。
//
// 四个入口都是纯函数：只读结果与少量上下文，返回新的 ToolExecutionResult（不改入参）。
// 判定顺序固定为「先看是否命中该工具与失败形态，再看错误是否带可用的反馈文本」，
// 因此成功结果、别的工具、别的错误类型一律原样返回。

import {
  AMEND_WORKFLOW_TOOL_NAME,
  CoreErrorType,
  CREATE_WORKFLOW_TOOL_NAME,
  EXIT_PLAN_MODE_TOOL_NAME,
  isAutomationCreateLimitError,
  type CollaborationMode,
} from "@knorvia/contracts";
import type { ToolEntry, ToolExecutionResult } from "../types.js";

type FeedbackSource = "plan_approval_feedback" | "workflow_refine_feedback";

const PLAN_APPROVAL_FEEDBACK: FeedbackSource = "plan_approval_feedback";
const WORKFLOW_REFINE_FEEDBACK: FeedbackSource = "workflow_refine_feedback";

const AUTOMATION_CREATE_LIMIT_REASON = "automation_create_limit";
const PLAN_EXIT_DENIED_REASON = "plan_exit_denied";
const SUBAGENT_TERMINAL_REASON = "subagent_terminal";

const CRON_CREATE_TOOL_NAME = "CronCreate";
const PLAN_MODE = "plan";

const AUTOMATION_LIMIT_CONTENT =
  "Automation creation was not performed because the global retained-task limit of 20 was reached. This limit cannot be recovered automatically in the current turn. Do not list, delete, overwrite, retry, or use another tool. Reply once in the user's language that they must manually delete an existing task on the Automations page and then retry.";
const PLAN_NOT_APPROVED_CONTENT = "The plan was not approved by the user.";
const WORKFLOW_NOT_APPROVED_CONTENT = "The workflow run was not approved by the user.";

// 终止 turn 的结果形状只有一个来源，避免各分支写出不一致的 turnControl。
type TurnStopReason = NonNullable<ToolExecutionResult["turnControl"]>["reason"];

function stopTurnAfterResult(
  result: ToolExecutionResult,
  reason: TurnStopReason,
): ToolExecutionResult {
  return { ...result, turnControl: { reason, stopTurnAfterResult: true } };
}

function followUpInput(
  result: ToolExecutionResult,
  input: string,
  reasonSource: FeedbackSource,
  modelContent: string,
): ToolExecutionResult {
  return { ...result, followUpUserInput: { input, reasonSource }, modelContent };
}

function feedbackMessage(result: ToolExecutionResult, source: FeedbackSource): string | undefined {
  if (result.error?.type !== CoreErrorType.PermissionDenied) return undefined;
  if (result.error.reasonSource !== source) return undefined;
  const trimmed = result.error.message.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function withAutomationCreateLimitTurnStop(
  result: ToolExecutionResult,
  input: { error: unknown; toolName: string },
): ToolExecutionResult {
  if (result.success) return result;
  if (input.toolName !== CRON_CREATE_TOOL_NAME) return result;
  if (!isAutomationCreateLimitError(input.error)) return result;
  return {
    ...result,
    modelContent: AUTOMATION_LIMIT_CONTENT,
    turnControl: { reason: AUTOMATION_CREATE_LIMIT_REASON, stopTurnAfterResult: true },
  };
}

export function withPlanExitDeniedTurnStop(
  result: ToolExecutionResult,
  input: { mode: CollaborationMode; planEnabled?: boolean; toolName: string },
): ToolExecutionResult {
  const planEnabled = input.planEnabled ?? (input.mode as string) === PLAN_MODE;
  if (!planEnabled || result.success) return result;
  if (input.toolName !== EXIT_PLAN_MODE_TOOL_NAME) return result;

  const feedback = feedbackMessage(result, PLAN_APPROVAL_FEEDBACK);
  const genericDenial = `Permission denied for ${EXIT_PLAN_MODE_TOOL_NAME}`;
  if (feedback !== undefined && feedback !== genericDenial) {
    return followUpInput(result, feedback, PLAN_APPROVAL_FEEDBACK, PLAN_NOT_APPROVED_CONTENT);
  }
  return stopTurnAfterResult(result, PLAN_EXIT_DENIED_REASON);
}

export function withWorkflowRefineDeniedFollowUp(
  result: ToolExecutionResult,
  input: { toolName: string },
): ToolExecutionResult {
  const isWorkflowRefineTool =
    input.toolName === CREATE_WORKFLOW_TOOL_NAME || input.toolName === AMEND_WORKFLOW_TOOL_NAME;
  if (!isWorkflowRefineTool || result.success) return result;
  const feedback = feedbackMessage(result, WORKFLOW_REFINE_FEEDBACK);
  if (feedback === undefined) return result;
  return followUpInput(result, feedback, WORKFLOW_REFINE_FEEDBACK, WORKFLOW_NOT_APPROVED_CONTENT);
}

export function withTerminalToolTurnStop(
  result: ToolExecutionResult,
  input: { entry: ToolEntry },
): ToolExecutionResult {
  if (!result.success) return result;
  if (input.entry.metadata.stopTurnOnSuccess !== true) return result;
  return stopTurnAfterResult(result, SUBAGENT_TERMINAL_REASON);
}
