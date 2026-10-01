import {
  CoreErrorType,
  SessionEventType,
  TASK_OUTPUT_TOOL_NAME,
  TaskOutputInputSchema,
  createCoreError,
  type TaskOutputInput,
  type TaskOutputResult,
} from "@knorvia/contracts";
import type { RuntimeTaskSnapshot } from "../../runtime-task/registry.js";
import type {
  ToolExecutionContext,
  ToolHandler,
  ToolHandlerFailure,
  ToolInputValidationContext,
  ToolInputValidationResult,
} from "../types.js";
import { projectTask, throwIfAborted } from "./task-output-projection.js";

const POLL_INTERVAL_MS = 100;
const ERROR_CODE = { missingId: 1, absentTask: 2 } as const;
const ACTIVE_STATUSES = new Set(["running", "pending"]);

function absentTask(id: string): ToolHandlerFailure {
  return {
    result: false,
    errorCode: ERROR_CODE.absentTask,
    message: `No task found with ID: ${id}`,
  };
}

function inspectRequest(
  input: TaskOutputInput,
  registry: ToolInputValidationContext["runtimeTaskRegistry"],
): ToolHandlerFailure | undefined {
  if (!input.task_id) {
    return { result: false, errorCode: ERROR_CODE.missingId, message: "Task ID is required" };
  }
  return registry && !registry.get(input.task_id) ? absentTask(input.task_id) : undefined;
}

export function validateTaskOutputRequest(
  input: unknown,
  context: ToolInputValidationContext,
): ToolInputValidationResult {
  return (
    inspectRequest(TaskOutputInputSchema.parse(input), context.runtimeTaskRegistry) ?? {
      result: true,
    }
  );
}

async function announceWait(context: ToolExecutionContext): Promise<void> {
  const emit = context.emitEvent;
  if (!emit) return;
  await context.emitEvent!({
    id: crypto.randomUUID() as never,
    sessionId: context.sessionId,
    turnId: context.turnId,
    type: SessionEventType.ToolCallProgress,
    timestamp: new Date(),
    traceId: context.traceId,
    sequenceNumber: 0,
    payload: {
      toolCallId: context.toolCallId as never,
      toolName: TASK_OUTPUT_TOOL_NAME,
      elapsedMs: 0,
    },
  });
}

async function observeUntilDeadline(
  request: TaskOutputInput,
  context: ToolExecutionContext,
): Promise<RuntimeTaskSnapshot | undefined> {
  const started = Date.now();
  for (;;) {
    if (Date.now() - started >= request.timeout)
      return context.runtimeTaskRegistry?.get(request.task_id);
    throwIfAborted(context.abortSignal);
    const observed = context.runtimeTaskRegistry?.get(request.task_id);
    if (!observed || !ACTIVE_STATUSES.has(observed.status)) return observed;
    await new Promise<void>((resume) => setTimeout(resume, POLL_INTERVAL_MS));
  }
}

async function deliverSnapshot(
  snapshot: RuntimeTaskSnapshot | undefined,
  blocked: boolean,
  context: ToolExecutionContext,
): Promise<TaskOutputResult> {
  if (!snapshot) return { retrieval_status: "timeout", task: null };
  const active = ACTIVE_STATUSES.has(snapshot.status);
  const retrieval_status = active ? (blocked ? "timeout" : "not_ready") : "success";
  const projected = await projectTask(snapshot, context);
  if (!active) {
    // 完成交付的 claim 必须晚于投影和取消检查，读取失败不能吞掉 owner 的后续通知。
    throwIfAborted(context.abortSignal);
    context.runtimeTaskRegistry?.update(snapshot.taskId, (latest) =>
      latest.notified ? latest : { ...latest, notified: true },
    );
  }
  return { retrieval_status, task: projected };
}

export const executeTaskOutput: ToolHandler = async (input, context) => {
  const request = TaskOutputInputSchema.parse(input);
  const invalid = inspectRequest(request, context.runtimeTaskRegistry);
  if (invalid) return invalid;
  const owner = context.runtimeTaskRegistry;
  if (!owner) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Runtime task registry is not configured for TaskOutput",
      {
        context: { toolCallId: context.toolCallId, toolName: TASK_OUTPUT_TOOL_NAME },
        recoverable: false,
      },
    );
  }
  const initial = owner.get(request.task_id);
  if (!initial) return absentTask(request.task_id);
  if (!request.block) return deliverSnapshot(initial, false, context);
  await announceWait(context);
  return deliverSnapshot(await observeUntilDeadline(request, context), true, context);
};
