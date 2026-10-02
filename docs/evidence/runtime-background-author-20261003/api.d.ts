import type { BackgroundExecutionSnapshot, BackgroundTaskCancelResult, BackgroundTaskInfo, BackgroundTaskInfoStatus, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeBackgroundStopOptions, RuntimeBackgroundStopResult } from "./background-stop-types.js";
export type { RuntimeBackgroundStopOptions, RuntimeBackgroundStopResult, } from "./background-stop-types.js";
export declare function hasRunningBackgroundTasks(this: AgentRuntimeInternal): boolean;
export declare function cancelBackgroundTask(this: AgentRuntimeInternal, taskId: string, options?: {
    traceContext?: TraceContext;
}): Promise<BackgroundTaskCancelResult>;
export declare function stopBackgroundTask(this: AgentRuntimeInternal, taskId: string, options: RuntimeBackgroundStopOptions): Promise<RuntimeBackgroundStopResult>;
export declare function cancelRunningRuntimeBackgroundTasks(this: AgentRuntimeInternal, input: {
    reason: "subagent_cancelled";
    traceContext?: TraceContext;
}): Promise<void>;
export declare function buildBackgroundTaskPayload(this: AgentRuntimeInternal, taskId: string, existing: BackgroundTaskInfo | undefined, snapshot: BackgroundExecutionSnapshot | undefined, overrides?: {
    cancelRequestedAt?: Date;
    cancellable?: boolean;
    completedAt?: Date;
    status?: BackgroundTaskInfoStatus;
}): BackgroundTaskInfo;
