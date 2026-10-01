// Source-exposed collaboration invocation. Distinct gates, error prose and receiver calls retained.
import {
  CoreErrorType,
  RESPOND_TO_COORDINATOR_TOOL_NAME,
  RespondToCoordinatorInputSchema,
  SEND_MESSAGE_TOOL_NAME,
  SendMessageInputSchema,
  SUBMIT_RESULT_TOOL_NAME,
  SubmitResultInputSchema,
  createCoreError,
  type RespondToCoordinatorOutput,
  type SendMessageOutput,
} from "@knorvia/contracts";
import type { ToolHandler } from "../types.js";
import { assertNotOffPeakTurn } from "./off-peak.js";
import {
  coordinatorResponseRequest,
  sendMessageRequest,
  workflowSubmissionRequest,
} from "./collaboration-request.js";
import { submissionOutcome } from "./collaboration-result.js";

export function createSendMessageHandler(hint: string): ToolHandler {
  return async (input, context) => {
    const parsed = SendMessageInputSchema.parse(input);
    assertNotOffPeakTurn(context, SEND_MESSAGE_TOOL_NAME, { hint, recoverable: true });
    if (!context.subagentPort?.sendMessage) {
      throw createCoreError(
        CoreErrorType.ConfigurationError,
        "Subagent port is not configured for SendMessage",
        {
          context: { toolCallId: context.toolCallId, toolName: SEND_MESSAGE_TOOL_NAME },
          recoverable: false,
        },
      );
    }
    // 唯一发送路径：端口/方法第二次读取先于 request，receiver 和 signal 边界保持不变。
    return context.subagentPort.sendMessage(sendMessageRequest(parsed, context), {
      signal: context.abortSignal,
    }) satisfies Promise<SendMessageOutput>;
  };
}

export const respondToCoordinator: ToolHandler = async (input, context) => {
  const parsed = RespondToCoordinatorInputSchema.parse(input);
  if (context.runtimeScope !== "subagent" || !context.coordinatorResponsePort) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Coordinator response port is not configured for RespondToCoordinator",
      {
        context: { toolCallId: context.toolCallId, toolName: RESPOND_TO_COORDINATOR_TOOL_NAME },
        recoverable: false,
      },
    );
  }
  return context.coordinatorResponsePort.respond(
    coordinatorResponseRequest(parsed, context),
  ) satisfies RespondToCoordinatorOutput;
};

export function createSubmissionHandler(errorCode: number): ToolHandler {
  return async (input, context) => {
    const parsed = SubmitResultInputSchema.parse(input);
    // Gate：workflow actor 会话才注入 workflowSubmitPort。不按 runtimeScope 判断——workflow
    // actor 是 taskType "workflow_child"，其 runtimeScope 目前是 "main"；端口存在与否才是
    // 与 taskType 无关的正确判据。
    if (!context.workflowSubmitPort) {
      throw createCoreError(
        CoreErrorType.ConfigurationError,
        "Workflow submit port is not configured for submit_result",
        {
          context: { toolCallId: context.toolCallId, toolName: SUBMIT_RESULT_TOOL_NAME },
          recoverable: false,
        },
      );
    }
    const verdict = await context.workflowSubmitPort.respond(
      workflowSubmissionRequest(parsed, context),
    );
    return submissionOutcome(verdict, errorCode);
  };
}
