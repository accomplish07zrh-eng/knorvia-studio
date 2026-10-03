import {
  createMessageId,
  traceContextToLogContext,
  type MessageId,
  type TraceContext,
} from "../deps.js";
import type { BackgroundResultOriginMeta } from "@knorvia/contracts";
import {
  createRuntimeCommandId,
  type TaskNotificationRuntimeCommand,
} from "../command-queue.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { SealBackgroundTaskNotificationsInput } from "../types.js";
import { runtimeInputMetadata } from "../../agent/runtime-input-presentation.js";
import { shouldSuppressSealedSubagentBashNotification } from "../../runtime-task/notification-policy.js";

/** Admit a current-branch result and start its ledger write. */
export function enqueueBackgroundTaskNotification(
  this: AgentRuntimeInternal,
  notification: {
    originMeta?: BackgroundResultOriginMeta;
    taskId?: string;
    text: string;
    toolName?: string;
    traceContext: TraceContext;
  },
): void {
  if (this.shuttingDown) {
    this.logger?.info?.(
      "Dropped background task notification during runtime shutdown",
      {
        ...traceContextToLogContext(notification.traceContext),
        event: "runtime.background_task_notification.shutdown_dropped",
        module: "core.runtime",
        taskId: notification.taskId,
        toolName: notification.toolName,
      },
    );
    return;
  }

  const task = notification.taskId
    ? this.runtimeTaskRegistry.get(notification.taskId)
    : undefined;
  const branchGeneration = task?.branchGeneration ?? this.branchGeneration;
  if (branchGeneration !== this.branchGeneration) {
    this.logger?.debug("Dropped stale-branch background task notification", {
      ...traceContextToLogContext(notification.traceContext),
      branchGeneration,
      currentBranchGeneration: this.branchGeneration,
      event: "runtime.background_task_notification.stale_branch_dropped",
      module: "core.runtime",
      taskId: notification.taskId,
    });
    return;
  }

  const commandId = createRuntimeCommandId();
  this.enqueueRuntimeCommand({
    branchGeneration,
    createdAt: new Date(),
    id: commandId,
    mode: "task-notification",
    priority: "next",
    source: "background_task",
    originMeta: notification.originMeta,
    taskId: notification.taskId,
    text: notification.text,
    toolName: notification.toolName,
    traceContext: notification.traceContext,
  });

  const admission = this.sessionStore?.saveSessionInput?.({
    id: String(commandId),
    sessionID: this.sessionId,
    kind: "backgroundNotification",
    delivery: "queue",
    payload: {
      text: notification.text,
      ...(notification.taskId ? { taskId: notification.taskId } : {}),
      ...(notification.originMeta ? { originMeta: notification.originMeta } : {}),
    },
  });
  if (admission) {
    void this.trackResidencyBlockingWork(admission).catch((error: unknown) => {
      this.logger?.warn("Failed to admit background notification to ledger", {
        ...traceContextToLogContext(notification.traceContext),
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "session_input.admit_failed",
        module: "core.runtime",
        status: "failed",
      });
    });
  }
}

/** Seal notifications only on a child runtime. */
export function sealBackgroundTaskNotifications(
  this: AgentRuntimeInternal,
  input: SealBackgroundTaskNotificationsInput,
): void {
  if (this.config.taskType !== "subagent_child") return;

  this.backgroundTaskNotificationsSealed = true;
  this.backgroundTaskNotificationSealReason = input.reason;
  this.logger?.info?.("Subagent runtime background task notifications sealed", {
    ...traceContextToLogContext(input.traceContext ?? this.rootTraceContext),
    event: "runtime.background_task_notifications.sealed",
    module: "core.runtime",
    reason: input.reason,
  });
}

interface PersistedBackgroundTaskNotificationBatch {
  backgroundSource?: BackgroundResultOriginMeta["backgroundSource"];
  messageId: MessageId;
  originMeta?: BackgroundResultOriginMeta;
  text: string;
}

function batchOrigin(
  commands: readonly [
    TaskNotificationRuntimeCommand,
    ...TaskNotificationRuntimeCommand[],
  ],
): BackgroundResultOriginMeta | undefined {
  if (commands.length === 1) return commands[0].originMeta;

  const origins: BackgroundResultOriginMeta[] = [];
  for (const command of commands) {
    const origin = command.originMeta;
    if (!origin?.workId.trim() || !origin.title.trim()) return undefined;
    origins.push(origin);
  }

  const titles = origins.slice(0, 3).map((origin) => origin.title.trim());
  if (origins.length > 3) titles.push(`+${origins.length - 3}`);
  return {
    backgroundSource: origins[0].backgroundSource,
    title: titles.join(" · "),
    workId: origins[0].workId,
  };
}

/** Publish one notice, then promote its queued inputs in command order. */
export async function persistBackgroundTaskNotificationBatch(
  this: AgentRuntimeInternal,
  commands: readonly [
    TaskNotificationRuntimeCommand,
    ...TaskNotificationRuntimeCommand[],
  ],
  midTurn?: boolean,
): Promise<PersistedBackgroundTaskNotificationBatch> {
  const first = commands[0];
  const source = first.originMeta?.backgroundSource;
  const backgroundSource =
    source && commands.every((command) => command.originMeta?.backgroundSource === source)
      ? source
      : undefined;
  const originMeta = batchOrigin(commands);
  const text = commands.map((command) => command.text).join("\n\n");

  await this.ensureContextInitialized(first.traceContext);
  const messageId = createMessageId();
  const inputPresentation = midTurn ? "task_notification_steer" : "task_notification";
  this.messageHistory.addUser(text, runtimeInputMetadata(inputPresentation));
  await this.persistSyntheticUserNoticeForSession({
    messageID: messageId,
    metadata: {
      inputPresentation,
      ...(originMeta ? { originMeta } : {}),
      visibility: "model-only",
    },
    sessionId: this.sessionId,
    source: "background_task",
    text,
    traceContext: first.traceContext,
    visibility: "model-only",
  });

  for (const command of commands) {
    await this.sessionStore?.markSessionInputPromoted?.({
      id: String(command.id),
      sessionID: this.sessionId,
      promotedMessageID: messageId,
    }).catch((error: unknown) => {
      this.logger?.warn("Failed to mark background notification promoted", {
        ...traceContextToLogContext(command.traceContext),
        commandId: command.id,
        errorMessage: error instanceof Error ? error.message : String(error),
        event: "session_input.promote_mark_failed",
        module: "core.runtime",
        status: "failed",
      });
    });
  }

  return {
    ...(backgroundSource ? { backgroundSource } : {}),
    messageId,
    ...(originMeta ? { originMeta } : {}),
    text,
  };
}

export async function persistBackgroundTaskNotificationCommand(
  this: AgentRuntimeInternal,
  command: TaskNotificationRuntimeCommand,
): Promise<MessageId> {
  const batch = await persistBackgroundTaskNotificationBatch.call(this, [command], true);
  return batch.messageId;
}

export function shouldSuppressTaskNotificationRuntimeCommand(
  this: AgentRuntimeInternal,
  command: TaskNotificationRuntimeCommand,
): boolean {
  const registryTask = command.taskId
    ? this.runtimeTaskRegistry.get(command.taskId)
    : undefined;
  if (!shouldSuppressSealedSubagentBashNotification({
    isSubagentChildRuntime: this.config.taskType === "subagent_child",
    notificationSealed: this.backgroundTaskNotificationsSealed,
    registryTask,
    toolName: command.toolName,
  })) return false;

  this.logger?.info?.("Suppressed sealed subagent background Bash notification", {
    ...traceContextToLogContext(command.traceContext),
    commandId: command.id,
    event: "runtime.background_task_notification.suppressed",
    module: "core.runtime",
    reason: this.backgroundTaskNotificationSealReason,
    taskId: command.taskId,
    toolName: command.toolName,
  });
  return true;
}
