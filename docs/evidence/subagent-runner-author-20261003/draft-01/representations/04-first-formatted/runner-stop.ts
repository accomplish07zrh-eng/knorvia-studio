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
import { emitTaskCompleted, enqueueNotification } from "./runner-publication.js";
import { withoutMessages, type RunnerState } from "./runner-state.js";
const stoppedMessage = "Background agent task stopped.";
async function emitStopped(
  state: RunnerState,
  task: RuntimeTaskSnapshot,
  trace: TraceContext,
): Promise<void> {
  if (!task.parentSessionId) return;
  await state.options.emitParentEvent(
    createSessionEvent(
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
        totalDurationMs: task.usage?.durationMs,
        error: stoppedMessage,
      },
      { turnId: task.turnId, traceId: trace.traceId },
    ),
    trace,
  );
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
    const trace: TraceContext = previous.traceContext ?? {
      traceId: createTraceId(),
      spanId: `span_${previous.taskId}`,
      sessionId: previous.parentSessionId,
      turnId: previous.turnId,
    };
    const text = formatLocalAgentTaskNotification({
      agentId: previous.agentId,
      agentType: previous.agentType,
      description: previous.description,
      error: stoppedMessage,
      outputFile: previous.outputFile ?? "",
      parentToolCallId: String(stopped.parentToolCallId ?? stopped.taskId),
      status: "stopped",
      totalDurationMs: duration,
    });
    await writeStopped(stopped, stoppedMessage);
    state.registry.update(previous.taskId, (current) => ({
      ...stopped,
      notified: current.notified,
    }));
    if (!enqueueNotification(state, previous.taskId, text, trace)) {
      state.registry.register(previous);
      throw new Error(
        `Background agent task stopped notification was not enqueued: ${previous.taskId}`,
      );
    }
    const committed = state.registry.get(previous.taskId);
    if (!committed) return undefined;
    state.controllers
      .get(previous.agentId)
      ?.abort(new Error(`${stoppedMessage}: ${previous.agentId}`));
    state.controllers.delete(previous.agentId);
    await emitTaskCompleted(state, committed, trace, previous.parentToolCallId, "cancelled");
    await emitStopped(state, committed, trace);
    state.options.logger?.info("Subagent background task stopped", {
      ...traceContextToLogContext(trace),
      agentId: previous.agentId,
      event: "subagent.background.stopped",
      module: "core.subagent",
      status: "stopped",
    });
    return committed;
  };
}
