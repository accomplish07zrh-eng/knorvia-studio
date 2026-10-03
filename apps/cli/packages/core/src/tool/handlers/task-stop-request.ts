import {
  CoreErrorType,
  TASK_STOP_TOOL_NAME,
  TaskStopInputSchema,
  createCoreError,
  type TaskStopOutput,
} from "@knorvia/contracts";
import type { BackgroundTaskControlStopResult, ToolHandler } from "../types.js";

type Refusal = { code: 1 | 3; message: string; details: Record<string, unknown> };

// 运行时持有任务状态；这里仅投影它返回的结构化原因，不根据消息猜测状态。
function refusalFor(result: BackgroundTaskControlStopResult, requestedId: string): Refusal {
  switch (result.reason) {
    case "background_task_not_running":
      return {
        code: 3,
        message: `Task ${requestedId} is not running (status: ${result.status ?? "unknown"})`,
        details: { status: result.status },
      };
    case "background_task_cancel_not_supported":
      return {
        code: 1,
        message: `Task ${requestedId} cannot be stopped`,
        details: { reason: result.reason, status: result.status },
      };
    default:
      return {
        code: 1,
        message: `No task found with ID: ${requestedId}`,
        details: { reason: result.reason },
      };
  }
}

function failedStop(refusal: Refusal, details: Record<string, unknown>): Error {
  return createCoreError(CoreErrorType.ToolExecutionFailed, refusal.message, {
    recoverable: true,
    context: {
      ...refusal.details,
      ...details,
      code: refusal.code,
      toolName: TASK_STOP_TOOL_NAME,
    },
  });
}

function completedStop(result: BackgroundTaskControlStopResult): TaskStopOutput {
  const { taskId, command } = result;
  const type = result.type ?? "background_task";
  return {
    message: `Successfully stopped task: ${taskId} (${command ?? type})`,
    task_id: taskId,
    task_type: type,
    ...(command ? { command } : {}),
  };
}

export const executeTaskStop: ToolHandler = async (input, context) => {
  const { task_id, shell_id } = TaskStopInputSchema.parse(input);
  const requestedId = task_id ?? shell_id;
  const requestDetails = { toolCallId: context.toolCallId };
  if (!requestedId) {
    throw failedStop(
      { code: 1, message: "Missing required parameter: task_id", details: {} },
      requestDetails,
    );
  }

  const owner = context.backgroundTaskControlPort;
  if (!owner) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Background task control is not configured for TaskStop",
      { context: { ...requestDetails, toolName: TASK_STOP_TOOL_NAME }, recoverable: false },
    );
  }

  // 单次严格命令保留 model 身份与原 trace；取消和幂等判定仍属于既有 owner。
  const result = await owner.stopBackgroundTask(requestedId, {
    initiator: "model",
    strict: true,
    traceContext: context.traceContext,
  });
  if (result.ok) return completedStop(result);
  throw failedStop(refusalFor(result, requestedId), {
    ...requestDetails,
    taskId: requestedId,
    taskType: result.type,
  });
};
