import type { DynamicWorkflowRunError, DynamicWorkflowRunLifecycleStatus, DynamicWorkflowRunStopReason, ModelUsage } from "@knorvia/contracts";
import type { RuntimeTaskType } from "./registry.js";
export { formatWorkflowEscalationNotification, formatWorkflowProviderStopError, formatWorkflowStallNotification, type WorkflowEscalationNotificationInput, type WorkflowStallNotificationInput, } from "./workflow-notification-copy.js";
export interface TaskNotificationInput {
    agentId?: string;
    description?: string;
    error?: string;
    outputFile?: string;
    reports?: {
        count: number;
        preview: string;
        shown: number;
    };
    artifacts?: {
        count: number;
        preview: string;
        shown: number;
    };
    deliveryGuidance?: boolean;
    result?: string;
    status: string;
    runStatus?: Extract<DynamicWorkflowRunLifecycleStatus, "completed" | "errored" | "stopped">;
    stopReason?: DynamicWorkflowRunStopReason;
    scriptPath?: string;
    failure?: DynamicWorkflowRunError;
    stderrFile?: string;
    stdoutFile?: string;
    subagentType?: string;
    summary: string;
    taskId: string;
    taskType: RuntimeTaskType;
    toolUseId?: string;
    usage?: {
        durationMs?: number;
        modelUsage?: ModelUsage;
        toolUseCount?: number;
        totalTokens?: number;
    };
}
export declare function formatTaskNotification(input: TaskNotificationInput): string;
export declare function truncateTaskNotification(value: string): string;
export declare function escapeXml(value: string): string;
