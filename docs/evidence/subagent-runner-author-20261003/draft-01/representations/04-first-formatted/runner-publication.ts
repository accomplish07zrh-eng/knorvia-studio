import {
  SessionEventType,
  createSessionEvent,
  traceContextToLogContext,
  type AgentCompletedOutput,
  type TraceContext,
} from "@knorvia/contracts";
import { formatLocalAgentTaskNotification } from "./completion-notification.js";
import { selectExecutionErrorMessage } from "../errors/error-payload.js";
import { isTerminalRuntimeTask, type RuntimeTaskSnapshot } from "../runtime-task/registry.js";
import { writeCompleted, writeFailed } from "./runner-artifacts.js";
import { errorText, withoutMessages, type Execution, type RunnerState } from "./runner-state.js";
export async function emit(
  state: RunnerState,
  execution: Execution,
  type: SessionEventType,
  payload: unknown,
): Promise<void> {
  await state.options.emitParentEvent(
    createSessionEvent(type, execution.request.sessionId, payload, {
      turnId: execution.request.turnId,
      traceId: execution.runTrace.traceId,
    }),
    execution.runTrace,
  );
}
export async function emitTaskCompleted(
  state: RunnerState,
  task: RuntimeTaskSnapshot,
  trace: TraceContext,
  toolCallId: unknown,
  status = task.status,
): Promise<void> {
  if (!task.parentSessionId) return;
  await state.options.emitParentEvent(
    createSessionEvent(
      SessionEventType.BackgroundTaskCompleted,
      task.parentSessionId,
      {
        taskId: task.taskId,
        toolCallId: String(toolCallId),
        toolName: "Agent",
        taskKind: "subagent",
        childSessionId: task.childSessionId,
        cancellable: false,
        description: task.description,
        status,
        startedAt: task.startedAt,
        completedAt: task.completedAt ?? new Date(),
        outputPath: task.outputFile,
        terminalId: task.taskId,
      },
      { turnId: task.turnId, traceId: trace.traceId },
    ),
    trace,
  );
}
export function enqueueNotification(
  state: RunnerState,
  taskId: string,
  text: string,
  traceContext: TraceContext,
): boolean {
  if (!state.options.enqueueParentTaskNotification) {
    state.options.logger?.warn("Skipped subagent background notification without parent queue", {
      ...traceContextToLogContext(traceContext),
      event: "subagent.background.notification.skipped",
      module: "core.subagent",
      taskId,
    });
    return false;
  }
  const task = state.registry.get(taskId);
  if (!task || task.notified) {
    state.options.logger?.debug("Skipped duplicate subagent background notification", {
      ...traceContextToLogContext(traceContext),
      event: "subagent.background.notification.duplicate",
      module: "core.subagent",
      reason: task ? "already_notified" : "task_missing",
      taskId,
    });
    return false;
  }
  try {
    state.options.enqueueParentTaskNotification({
      originMeta: {
        backgroundSource: "subagent",
        title: task.description.trim() || taskId,
        workId: taskId,
      },
      taskId,
      text,
      traceContext,
    });
  } catch (error) {
    state.options.logger?.warn("Failed to enqueue subagent background notification", {
      ...traceContextToLogContext(traceContext),
      errorMessage: errorText(error),
      event: "subagent.background.notification.failed",
      module: "core.subagent",
      taskId,
    });
    return false;
  }
  state.registry.update(taskId, (current) =>
    current.notified ? current : { ...current, notified: true },
  );
  state.options.logger?.info("Subagent background notification enqueued", {
    ...traceContextToLogContext(traceContext),
    event: "subagent.background.notification.enqueued",
    module: "core.subagent",
    taskId,
  });
  return true;
}
export function completedTask(
  task: RuntimeTaskSnapshot,
  output: AgentCompletedOutput,
): RuntimeTaskSnapshot {
  return {
    ...withoutMessages(task),
    status: "completed",
    completedAt: new Date(),
    output,
    usage: {
      durationMs: output.totalDurationMs,
      modelUsage: output.usage,
      toolUseCount: output.totalToolUseCount,
      totalTokens: output.totalTokens,
    },
  };
}
export async function finishBackground(
  state: RunnerState,
  execution: Execution,
  output: AgentCompletedOutput,
): Promise<void> {
  const existing = state.registry.get(execution.agentId);
  if (existing && isTerminalRuntimeTask(existing)) return;
  await writeCompleted(execution, output);
  const text = formatLocalAgentTaskNotification({
    agentId: execution.agentId,
    agentType: execution.request.agentType,
    description: execution.request.description,
    outputFile: execution.outputFile,
    parentToolCallId: String(execution.request.parentToolCallId),
    result: output.content.map((block) => block.text).join("\n\n"),
    status: "completed",
    totalDurationMs: output.totalDurationMs,
    totalTokens: output.totalTokens,
    totalToolUseCount: output.totalToolUseCount,
    usage: output.usage,
  });
  const task = state.registry.update(execution.agentId, (current) =>
    completedTask(current, output),
  );
  enqueueNotification(state, execution.agentId, text, execution.runTrace);
  if (task)
    await emitTaskCompleted(state, task, execution.runTrace, execution.request.parentToolCallId);
  await emit(state, execution, SessionEventType.SubagentStopped, {
    agentId: execution.agentId,
    agentType: execution.request.agentType,
    background: true,
    childSessionId: execution.childSessionId,
    parentToolCallId: execution.request.parentToolCallId,
    status: "completed",
    outputFile: execution.outputFile,
    totalDurationMs: output.totalDurationMs,
    totalToolUseCount: output.totalToolUseCount,
    totalTokens: output.totalTokens,
  });
  state.options.logger?.info("Subagent background task completed", {
    ...traceContextToLogContext(execution.runTrace),
    agentId: execution.agentId,
    durationMs: output.totalDurationMs,
    event: "subagent.background.completed",
    module: "core.subagent",
    status: "completed",
    totalToolUseCount: output.totalToolUseCount,
    totalTokens: output.totalTokens,
  });
}
export async function failBackground(
  state: RunnerState,
  execution: Execution,
  error: unknown,
): Promise<void> {
  const existing = state.registry.get(execution.agentId);
  if (existing && isTerminalRuntimeTask(existing)) return;
  const message = error instanceof Error ? selectExecutionErrorMessage(error) : String(error);
  const completedAt = new Date();
  const duration = completedAt.getTime() - execution.startedMs;
  await writeFailed(execution, message);
  const text = formatLocalAgentTaskNotification({
    agentId: execution.agentId,
    agentType: execution.request.agentType,
    description: execution.request.description,
    error: message,
    outputFile: execution.outputFile,
    parentToolCallId: String(execution.request.parentToolCallId),
    status: "failed",
    totalDurationMs: duration,
  });
  const task = state.registry.update(execution.agentId, (current) => ({
    ...withoutMessages(current),
    status: "failed",
    completedAt,
    error: message,
    usage: { durationMs: duration },
  }));
  enqueueNotification(state, execution.agentId, text, execution.runTrace);
  if (task)
    await emitTaskCompleted(state, task, execution.runTrace, execution.request.parentToolCallId);
  await emit(state, execution, SessionEventType.SubagentStopped, {
    agentId: execution.agentId,
    agentType: execution.request.agentType,
    background: true,
    childSessionId: execution.childSessionId,
    parentToolCallId: execution.request.parentToolCallId,
    status: "failed",
    outputFile: execution.outputFile,
    totalDurationMs: duration,
    error: message,
  });
  state.options.logger?.warn("Subagent background task failed", {
    ...traceContextToLogContext(execution.runTrace),
    agentId: execution.agentId,
    errorMessage: message,
    event: "subagent.background.failed",
    module: "core.subagent",
    status: "failed",
  });
}
