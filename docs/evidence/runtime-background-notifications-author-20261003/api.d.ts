import type { MessageId, TraceContext } from "../deps.js";
import type { BackgroundResultOriginMeta } from "@knorvia/contracts";
import { type TaskNotificationRuntimeCommand } from "../command-queue.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { SealBackgroundTaskNotificationsInput } from "../types.js";
export declare function enqueueBackgroundTaskNotification(this: AgentRuntimeInternal, notification: {
    originMeta?: BackgroundResultOriginMeta;
    taskId?: string;
    text: string;
    toolName?: string;
    traceContext: TraceContext;
}): void;
export declare function sealBackgroundTaskNotifications(this: AgentRuntimeInternal, input: SealBackgroundTaskNotificationsInput): void;
export declare function persistBackgroundTaskNotificationCommand(this: AgentRuntimeInternal, command: TaskNotificationRuntimeCommand): Promise<MessageId>;
interface PersistedBackgroundTaskNotificationBatch {
    backgroundSource?: BackgroundResultOriginMeta["backgroundSource"];
    messageId: MessageId;
    originMeta?: BackgroundResultOriginMeta;
    text: string;
}
export declare function persistBackgroundTaskNotificationBatch(this: AgentRuntimeInternal, commands: readonly [
    TaskNotificationRuntimeCommand,
    ...TaskNotificationRuntimeCommand[]
], midTurn?: boolean): Promise<PersistedBackgroundTaskNotificationBatch>;
export declare function shouldSuppressTaskNotificationRuntimeCommand(this: AgentRuntimeInternal, command: TaskNotificationRuntimeCommand): boolean;
export {};
