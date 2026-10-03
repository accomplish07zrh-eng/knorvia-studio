// Original type owner: apps/cli/packages/core/src/tool/types.ts
export interface ToolExecutionResult {
    toolCallId: string;
    toolName: string;
    success: boolean;
    output: unknown;
    turnControl?: ToolExecutionTurnControl;
    followUpUserInput?: ToolExecutionFollowUpUserInput;
    display?: ToolResultDisplayPayload;
    modelContent?: ModelMessageContent;
    readFileStateMetadata?: PersistedReadFileStateMetadata;
    serialization?: ToolResultSerialization;
    performance?: ToolExecutionTelemetry;
    error?: {
        code?: string;
        detail?: string;
        type: string;
        message: string;
        reasonSource?: PermissionBrokerReasonSource;
        stack?: string;
    };
    durationMs: number;
    startedAt: Date;
    completedAt: Date;
}

// Original type owner: apps/cli/packages/core/src/tool/scheduler.ts
export interface ToolSchedule {
    items: ToolScheduleItem[];
    parallelGroups: ToolCallId[][];
    executionOrder: ToolCallId[];
}
export interface ToolScheduleItem {
    toolCallId: ToolCallId;
    toolName?: string;
    dependencies: ToolCallId[];
    canRunParallel: boolean;
    readOnly?: boolean;
    destructive?: boolean;
    concurrentSafe?: boolean;
    sideEffectScope?: ModelToolSideEffectScope;
}
export type ModelMessageContent = import("@knorvia/contracts").ModelMessageContent;
export type ToolCallId = import("@knorvia/contracts").ToolCallId;
export type ModelToolSideEffectScope = import("@knorvia/contracts").ModelToolSideEffectScope;
export type ToolExecutionTurnControl = import("../../tool/types.js").ToolExecutionTurnControl;
export type ToolExecutionFollowUpUserInput = import("../../tool/types.js").ToolExecutionFollowUpUserInput;
export type ToolResultDisplayPayload = import("@knorvia/contracts").ToolResultDisplayPayload;
export type PersistedReadFileStateMetadata = import("../../tool/read-file-state-metadata.js").PersistedReadFileStateMetadata;
export type ToolResultSerialization = import("../../tool/types.js").ToolResultSerialization;
export type ToolExecutionTelemetry = import("@knorvia/contracts").ToolExecutionTelemetry;
export type PermissionBrokerReasonSource = import("@knorvia/contracts").PermissionBrokerReasonSource;
