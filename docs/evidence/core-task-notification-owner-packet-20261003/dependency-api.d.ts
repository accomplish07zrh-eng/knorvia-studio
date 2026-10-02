// Original public types/ports only. Consume actual imported owners; no standalone semantic closure.
// Original public port/type owner: apps/cli/packages/core/src/runtime-task/registry.ts
export type RuntimeTaskType = "local_agent" | "local_bash" | "local_workflow" | "local_dynamic_workflow" | "monitor_mcp";

// Original public port/type owner: apps/cli/packages/core/src/runtime-task/workflow-notification-copy.ts
import type { DynamicWorkflowRunError } from "@knorvia/contracts";
export declare function formatWorkflowProviderStopError(failure: DynamicWorkflowRunError, runId: string): string;
export declare function formatWorkflowEscalationNotification(input: WorkflowEscalationNotificationInput): string;
export interface WorkflowEscalationNotificationInput {
    runLabel: string;
    runId: string;
    qid: string;
    actor: string;
    question: string;
    context?: string;
}
export declare function formatWorkflowStallNotification(input: WorkflowStallNotificationInput): string;
export interface WorkflowStallNotificationInput {
    runLabel: string;
    runId: string;
    sinceMs: number;
    reason?: string;
    cap?: number;
}

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/dynamic-workflow-run.port.ts
export interface DynamicWorkflowRunError {
    code: string;
    message: string;
    providerStop?: DynamicWorkflowRunProviderStop;
}
export interface DynamicWorkflowRunProviderStop {
    kind: "auth" | "not_configured" | "model_unavailable" | "invalid_request" | "quota" | "other";
    reason: string;
    providerId?: string;
    providerLabel?: string;
    modelId?: string;
    providerCode?: string;
    subagent?: string;
    subagentName?: string;
    phase?: string;
    rawMessage?: string;
    resetAt?: number;
}
export type DynamicWorkflowRunLifecycleStatus = "completed" | "errored" | "pending" | "running" | "stopped";
export type DynamicWorkflowRunStopReason = "user" | "model" | "provider" | "interrupted" | "superseded";

// Original public port/type owner: apps/cli/packages/contracts/src/model/index.ts
export interface ModelUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    serverToolUse?: ModelServerToolUsage;
}
export interface ModelServerToolUsage {
    webSearchRequests?: number;
    webFetchRequests?: number;
}

