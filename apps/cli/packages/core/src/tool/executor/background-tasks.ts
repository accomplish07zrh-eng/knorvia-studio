import {
  SessionEventType,
  traceContextToLogContext,
  type TraceContext,
  type TurnId,
} from "@knorvia/contracts";
import { isSubagentDispatchToolName } from "../compat.js";
import type { ExecutableToolCall } from "../types.js";
import {
  registerRuntimeBackgroundTask,
  removeRuntimeBackgroundTask,
  updateRuntimeBackgroundTask,
} from "./background-task-registry.js";
import { enqueueTerminalNotification } from "./background-tracker-notification.js";
import {
  emitBackgroundTaskEvent,
  taskPayload,
  errorMessage,
  hasDirectWaiter,
  hasSnapshotProvider,
  readTaskSnapshot,
  runningSignature,
  waitForTaskSnapshot,
  type TaskSnapshot,
} from "./background-tracker-projection.js";
import type { ToolExecutorDeps } from "./types.js";
import { isRecord } from "./utils.js";

// 一次运行的显式状态；由 trackBackgroundTask 创建，传给各阶段函数。
type RunState = {
  stopped: boolean;
  pollInFlight: boolean;
  terminalPublishing: boolean;
  lastRunningSignature: string;
  interval: ReturnType<typeof setInterval> | undefined;
  maxRuntimeTimeout: ReturnType<typeof setTimeout> | undefined;
};

export class BackgroundTaskTracker {
  private readonly trackedTaskIds = new Set<string>();

  constructor(private readonly deps: ToolExecutorDeps) {}

  // 收口清理：停掉两个定时器并从追踪集合里摘掉任务 id。幂等，可重复调用。
  private cleanup(run: RunState, taskId: string): void {
    if (run.interval) clearInterval(run.interval);
    run.interval = undefined;
    if (run.maxRuntimeTimeout) clearTimeout(run.maxRuntimeTimeout);
    run.maxRuntimeTimeout = undefined;
    this.trackedTaskIds.delete(taskId);
  }

  async trackBackgroundTask(
    toolCall: ExecutableToolCall,
    output: unknown,
    traceContext: TraceContext,
    turnId: TurnId | undefined,
  ): Promise<void> {
    if (!isRecord(output)) return;
    if (
      !(
        output.status === "backgrounded" ||
        (isSubagentDispatchToolName(toolCall.name) && output.status === "async_launched")
      )
    )
      return;
    const taskId =
      typeof output.backgroundTaskId === "string"
        ? output.backgroundTaskId
        : typeof output.agentId === "string"
          ? output.agentId
          : undefined;
    if (!taskId || this.trackedTaskIds.has(taskId)) return;

    this.trackedTaskIds.add(taskId);
    registerRuntimeBackgroundTask(this.deps, toolCall, taskId, output, turnId);
    try {
      await emitBackgroundTaskEvent(
        this.deps,
        SessionEventType.BackgroundTaskStarted,
        taskPayload(this.deps, toolCall, taskId, "running", output),
        traceContext,
        turnId,
      );
    } catch (error) {
      this.trackedTaskIds.delete(taskId);
      removeRuntimeBackgroundTask(this.deps, toolCall, taskId);
      throw error;
    }

    const hasSnapshot = hasSnapshotProvider(this.deps, toolCall.name);
    const hasWaiter = hasDirectWaiter(this.deps, toolCall.name);
    this.deps.logger?.info?.("Background task tracking started", {
      ...traceContextToLogContext(traceContext),
      event: "background_task.tracking.started",
      hasDirectWaiter: hasWaiter,
      hasSnapshotProvider: hasSnapshot,
      module: "core.tool.executor",
      taskId: taskId,
      toolName: toolCall.name,
    });
    if (!hasSnapshot && !hasWaiter) {
      this.deps.logger?.info?.("Background task tracking lost without snapshot source", {
        ...traceContextToLogContext(traceContext),
        event: "background_task.tracking.lost",
        module: "core.tool.executor",
        reason: "missing_snapshot_source",
        taskId: taskId,
        toolName: toolCall.name,
      });
      updateRuntimeBackgroundTask(this.deps, toolCall, taskId, "lost");
      enqueueTerminalNotification(
        this.deps,
        toolCall,
        taskId,
        "lost",
        traceContext,
        undefined,
        output,
      );
      await emitBackgroundTaskEvent(
        this.deps,
        SessionEventType.BackgroundTaskCompleted,
        taskPayload(this.deps, toolCall, taskId, "lost", output),
        traceContext,
        turnId,
      );
      this.trackedTaskIds.delete(taskId);
      return;
    }

    // 一次运行的显式状态：闭包与后续拆出的阶段函数都读写同一个对象，避免散落的 let。
    const run = {
      stopped: false,
      pollInFlight: false,
      terminalPublishing: false,
      lastRunningSignature: "",
      interval: undefined as ReturnType<typeof setInterval> | undefined,
      maxRuntimeTimeout: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    const publishRunning = async (snapshot: TaskSnapshot): Promise<void> => {
      const signature = runningSignature(snapshot);
      if (signature === run.lastRunningSignature) return;
      run.lastRunningSignature = signature;
      updateRuntimeBackgroundTask(this.deps, toolCall, taskId, "running", snapshot);
      await emitBackgroundTaskEvent(
        this.deps,
        SessionEventType.BackgroundTaskUpdated,
        taskPayload(this.deps, toolCall, taskId, "running", output, snapshot),
        traceContext,
        turnId,
      );
    };
    const publishTerminal = async (snapshot: TaskSnapshot | undefined): Promise<void> => {
      if (run.stopped || run.terminalPublishing) return;
      run.terminalPublishing = true;
      try {
        if (!snapshot) {
          this.deps.logger?.info?.("Background task terminal snapshot missing", {
            ...traceContextToLogContext(traceContext),
            event: "background_task.tracking.lost",
            module: "core.tool.executor",
            reason: "snapshot_missing",
            taskId: taskId,
            toolName: toolCall.name,
          });
          updateRuntimeBackgroundTask(this.deps, toolCall, taskId, "lost");
          enqueueTerminalNotification(
            this.deps,
            toolCall,
            taskId,
            "lost",
            traceContext,
            undefined,
            output,
          );
          await emitBackgroundTaskEvent(
            this.deps,
            SessionEventType.BackgroundTaskCompleted,
            taskPayload(this.deps, toolCall, taskId, "lost", output),
            traceContext,
            turnId,
          );
          run.stopped = true;
          this.cleanup(run, taskId);
          return;
        }
        if (snapshot.status === "running") {
          updateRuntimeBackgroundTask(this.deps, toolCall, taskId, "running", snapshot);
          await publishRunning(snapshot);
          if (!hasSnapshot) {
            run.stopped = true;
            this.cleanup(run, taskId);
          }
          return;
        }
        if (
          isSubagentDispatchToolName(toolCall.name) &&
          (snapshot as unknown as Record<string, unknown>).type === "local_agent" &&
          (snapshot as unknown as Record<string, unknown>).notified === true
        ) {
          this.deps.logger?.debug?.(
            "Background task terminal notification already handled by subagent",
            {
              ...traceContextToLogContext(traceContext),
              event: "background_task.tracking.notification_already_handled",
              module: "core.tool.executor",
              taskId: taskId,
              toolName: toolCall.name,
            },
          );
          run.stopped = true;
          this.cleanup(run, taskId);
          return;
        }
        this.deps.logger?.info?.("Background task terminal snapshot observed", {
          ...traceContextToLogContext(traceContext),
          event: "background_task.tracking.terminal",
          module: "core.tool.executor",
          taskId: taskId,
          taskStatus: snapshot.status,
          toolName: toolCall.name,
        });
        updateRuntimeBackgroundTask(this.deps, toolCall, taskId, snapshot.status, snapshot);
        enqueueTerminalNotification(
          this.deps,
          toolCall,
          taskId,
          snapshot.status,
          traceContext,
          snapshot,
        );
        await emitBackgroundTaskEvent(
          this.deps,
          SessionEventType.BackgroundTaskCompleted,
          taskPayload(this.deps, toolCall, taskId, snapshot.status, output, snapshot),
          traceContext,
          turnId,
        );
        run.stopped = true;
        this.cleanup(run, taskId);
      } finally {
        run.terminalPublishing = false;
      }
    };
    const poll = async (): Promise<void> => {
      if (run.pollInFlight || run.stopped || !hasSnapshot) return;
      run.pollInFlight = true;
      try {
        const snapshot = await readTaskSnapshot(this.deps, toolCall.name, taskId);
        if (!snapshot || snapshot.status !== "running") {
          await publishTerminal(snapshot);
        } else {
          await publishRunning(snapshot);
        }
      } catch (error) {
        this.deps.logger?.warn("Background task polling failed", {
          ...traceContextToLogContext(traceContext),
          errorMessage: errorMessage(error),
          module: "core.tool.executor",
          taskId: taskId,
        });
      } finally {
        run.pollInFlight = false;
      }
    };

    if (
      toolCall.name === "Bash" &&
      this.deps.runtimeScope === "subagent" &&
      this.deps.subagentBackgroundBashMaxMs !== undefined &&
      this.deps.executionPort?.cancelBackgroundTask
    ) {
      run.maxRuntimeTimeout = setTimeout(() => {
        this.deps.logger?.warn("Subagent background Bash exceeded max runtime; cancelling", {
          ...traceContextToLogContext(traceContext),
          event: "background_task.subagent_bash.max_runtime_exceeded",
          module: "core.tool.executor",
          taskId: taskId,
          toolName: toolCall.name,
        });
        Promise.resolve(this.deps.executionPort?.cancelBackgroundTask?.(taskId)).catch((error) => {
          this.deps.logger?.warn("Subagent background Bash cancellation failed", {
            ...traceContextToLogContext(traceContext),
            errorMessage: errorMessage(error),
            event: "background_task.subagent_bash.cancel_failed",
            module: "core.tool.executor",
            taskId: taskId,
            toolName: toolCall.name,
          });
        });
      }, this.deps.subagentBackgroundBashMaxMs);
    }
    if (hasSnapshot) {
      run.interval = setInterval(() => {
        void poll();
      }, 1000);
      (run.interval as unknown as { unref?: () => void }).unref?.();
      await poll();
    }
    if (hasWaiter && !run.stopped) {
      void (async (): Promise<void> => {
        try {
          const snapshot = await waitForTaskSnapshot(this.deps, toolCall.name, taskId);
          await publishTerminal(snapshot);
        } catch (error) {
          this.deps.logger?.warn("Background task wait failed", {
            ...traceContextToLogContext(traceContext),
            errorMessage: errorMessage(error),
            module: "core.tool.executor",
            taskId: taskId,
          });
          if (!hasSnapshot) {
            run.stopped = true;
            this.cleanup(run, taskId);
          }
        }
      })();
    }
  }
}
