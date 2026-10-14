// 发布判定的两个结果：命中（已发布）与未命中，具名后读起来不必再猜字面量含义。
const PUBLISHED = true;
const NOT_PUBLISHED = false;

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
  const event = createSessionEvent(type, execution.request.sessionId, payload, {
    turnId: execution.request.turnId,
    traceId: execution.runTrace.traceId,
  });
  await state.options.emitParentEvent(event, execution.runTrace);
}
export async function emitExecutionCompleted(
  state: RunnerState,
  execution: Execution,
  task: RuntimeTaskSnapshot,
): Promise<void> {
  if (!isTerminalRuntimeTask(task)) return;
  await emit(state, execution, SessionEventType.BackgroundTaskCompleted, {
    taskId: task.taskId,
    toolCallId: String(execution.request.parentToolCallId),
    toolName: "Agent",
    taskKind: "subagent",
    childSessionId: task.childSessionId,
    cancellable: false,
    description: task.description,
    status: task.status,
    startedAt: task.startedAt,
    completedAt: task.completedAt ?? new Date(),
    outputPath: task.outputFile,
    terminalId: task.taskId,
  });
}
export function enqueueNotification(
  state: RunnerState,
  taskId: string,
  text: string,
  traceContext: TraceContext,
): boolean /* 是否已发布 */ {
  if (!state.options.enqueueParentTaskNotification) {
    state.options.logger?.warn("Skipped subagent background notification without parent queue", {
      ...traceContextToLogContext(traceContext),
      event: "subagent.background.notification.skipped",
      module: "core.subagent",
      taskId,
    });
    return NOT_PUBLISHED;
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
    return NOT_PUBLISHED;
  }
  try /* 发布失败不抛出 */ {
    state.options.enqueueParentTaskNotification({
      originMeta: {
        // 来源元数据
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
    return NOT_PUBLISHED;
  }
  state.registry.update(taskId, (current) =>
    current.notified ? current : { ...current, notified: true },
  );
  state.options.logger?.info?.("Subagent background notification enqueued", {
    ...traceContextToLogContext(traceContext),
    event: "subagent.background.notification.enqueued",
    module: "core.subagent",
    taskId,
  });
  return PUBLISHED;
}
export function completedTask(
  task: RuntimeTaskSnapshot,
  output: AgentCompletedOutput,
  completedAt?: Date,
): RuntimeTaskSnapshot {
  return {
    // 构造返回值
    ...withoutMessages(task),
    status: "completed",
    completedAt: completedAt ?? new Date(),
    output,
    usage: {
      // 用量明细
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
    agentId: output.agentId,
    agentType: output.agentType,
    description: output.description,
    outputFile: execution.outputFile,
    parentToolCallId: String(execution.request.parentToolCallId),
    result: output.content.map((block) => block.text).join("\n\n"),
    status: "completed",
    totalDurationMs: output.totalDurationMs,
    totalTokens: output.totalTokens,
    totalToolUseCount: output.totalToolUseCount,
    usage: output.usage,
  });
  const completedAt = new Date();
  const task = state.registry.update(execution.agentId, (current) =>
    completedTask(current, output, completedAt),
  );
  enqueueNotification(state, execution.agentId, text, execution.runTrace);
  if (task) await emitExecutionCompleted(state, execution, task);
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
  const duration = Date.now() - execution.startedMs;
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
    usage: { durationMs: duration }, // 用量明细
  }));
  enqueueNotification(state, execution.agentId, text, execution.runTrace);
  if (task) await emitExecutionCompleted(state, execution, task);
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
