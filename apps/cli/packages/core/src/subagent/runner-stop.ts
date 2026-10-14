// 无结果时统一返回这个常量，语义比裸 undefined 明确。
const NO_RESULT = undefined;

import {
  SessionEventType,
  createSessionEvent,
  createTraceId,
  traceContextToLogContext,
  type SubagentPort,
  type TraceContext,
} from "@knorvia/contracts";
import { formatLocalAgentTaskNotification } from "./completion-notification.js";
import { isTerminalRuntimeTask, type RuntimeTaskSnapshot } from "../runtime-task/registry.js";
import { writeStopped } from "./runner-artifacts.js";
import { enqueueNotification } from "./runner-publication.js";
import { withoutMessages, type RunnerState } from "./runner-state.js";
const stoppedMessage = "Background agent task stopped.";
async function emitStopped(
  state: RunnerState,
  task: RuntimeTaskSnapshot,
  trace: TraceContext,
  duration: number,
): Promise<void> {
  if (!task.parentSessionId) return;
  const event = createSessionEvent(
    SessionEventType.SubagentStopped,
    task.parentSessionId,
    {
      agentId: task.agentId,
      agentType: task.agentType,
      background: true,
      childSessionId: task.childSessionId,
      parentToolCallId: task.parentToolCallId,
      status: "stopped",
      outputFile: task.outputFile,
      totalDurationMs: duration,
      error: task.error,
    },
    { turnId: task.turnId, traceId: trace.traceId },
  );
  await state.options.emitParentEvent(event, trace);
}
export function stopMethod(state: RunnerState): NonNullable<SubagentPort["stopTask"]> {
  return async (taskId, options) => {
    if (options?.signal?.aborted) throw options.signal.reason ?? new Error("Subagent stop aborted");
    const task = state.registry.get(taskId);
    if (!task || task.type !== "local_agent" || isTerminalRuntimeTask(task)) return task;
    const previous = state.registry.get(task.taskId);
    if (!previous || isTerminalRuntimeTask(previous)) return undefined;
    const completedAt = new Date();
    const duration = Math.max(0, completedAt.getTime() - previous.startedAt.getTime());
    const stopped: RuntimeTaskSnapshot = {
      ...withoutMessages(previous),
      status: "killed",
      completedAt,
      error: stoppedMessage,
      usage: { durationMs: duration },
    };
    const trace: TraceContext = stopped.traceContext ?? {
      traceId: createTraceId(),
      spanId: `span_${stopped.taskId}`,
      sessionId: stopped.parentSessionId,
      turnId: stopped.turnId,
    };
    return finalizeStop(state, taskId, previous, stopped, trace, duration);
  };
}
async function finalizeStop(
  state: RunnerState,
  taskId: string,
  previous: RuntimeTaskSnapshot,
  stopped: RuntimeTaskSnapshot,
  trace: TraceContext,
  duration: number,
): Promise<RuntimeTaskSnapshot | undefined> {
  const text = formatLocalAgentTaskNotification({
    agentId: stopped.agentId,
    agentType: stopped.agentType,
    description: stopped.description,
    outputFile: stopped.outputFile ?? "",
    parentToolCallId: String(stopped.parentToolCallId ?? stopped.taskId),
    status: "stopped",
    totalDurationMs: duration,
  });
  await writeStopped(stopped, stoppedMessage);
  state.registry.update(stopped.taskId, (previous) => ({
    ...stopped,
    notified: previous.notified,
  }));
  if (!enqueueNotification(state, stopped.taskId, text, trace)) {
    state.registry.register(previous);
    throw new Error( // 调用方给出的停止请求非法，直接抛给上层
      `Background agent task stopped notification was not enqueued: ${stopped.taskId}`,
    );
  }
  const alreadyCommitted = state.registry.get(stopped.taskId);
  if (!alreadyCommitted) return NO_RESULT;
  state.controllers.get(taskId)?.abort(new Error(`${stoppedMessage}: ${taskId}`));
  state.controllers.delete(taskId);
  await emitStoppedCompletion(state, alreadyCommitted, trace);
  await emitStopped(state, alreadyCommitted, trace, duration);
  state.options.logger?.info("Subagent background task stopped", {
    ...traceContextToLogContext(trace),
    agentId: stopped.agentId,
    event: "subagent.background.stopped",
    module: "core.subagent",
    status: "cancelled",
  });
  return alreadyCommitted;
}
async function emitStoppedCompletion(
  state: RunnerState,
  task: RuntimeTaskSnapshot,
  trace: TraceContext,
): Promise<void> {
  if (!task.parentSessionId) return;
  const event = createSessionEvent(
    SessionEventType.BackgroundTaskCompleted,
    task.parentSessionId,
    {
      taskId: task.taskId,
      toolCallId: String(task.parentToolCallId ?? task.taskId),
      toolName: "Agent",
      taskKind: "subagent",
      childSessionId: task.childSessionId,
      cancellable: false,
      description: task.description,
      status: "cancelled",
      startedAt: task.startedAt,
      completedAt: task.completedAt ?? new Date(),
      outputPath: task.outputFile,
      terminalId: task.taskId,
    },
    { turnId: task.turnId, traceId: trace.traceId },
  );
  await state.options.emitParentEvent(event, trace);
}
