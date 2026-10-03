import type { BackgroundTaskInfo, BackgroundTaskInfoStatus } from "../deps.js";
import type { RuntimeTaskSnapshot, RuntimeTaskType } from "../../runtime-task/registry.js";
import type { TraceContext } from "../deps.js";
export type RuntimeBackgroundStopFailureReason = "background_task_cancel_not_supported" | "background_task_not_found" | "background_task_not_running";
export type RuntimeBackgroundStopStatus = BackgroundTaskInfoStatus | RuntimeTaskSnapshot["status"];
export type RuntimeBackgroundStopResult = {
    alreadyTerminal?: boolean;
    command?: string;
    ok: true;
    status: RuntimeBackgroundStopStatus;
    taskId: string;
    type: RuntimeTaskType;
} | {
    reason: RuntimeBackgroundStopFailureReason;
    ok: false;
    status?: RuntimeBackgroundStopStatus;
    taskId: string;
    type?: RuntimeTaskType;
};
export type RuntimeBackgroundStopInitiator = "user" | "model";
export interface RuntimeBackgroundStopOptions {
    initiator?: RuntimeBackgroundStopInitiator;
    strict?: boolean;
    traceContext?: TraceContext;
}
export interface RuntimeBackgroundStopTarget {
    currentStatus: RuntimeBackgroundStopStatus | undefined;
    existing: BackgroundTaskInfo | undefined;
    registryTask: RuntimeTaskSnapshot | undefined;
    taskId: string;
    taskType: RuntimeTaskType | undefined;
}
export type TypedRuntimeBackgroundStopTarget = RuntimeBackgroundStopTarget & {
    taskType: RuntimeTaskType;
};
