// Supporting public type facts only; source module labels are reference locations.
// apps/cli/packages/core/src/runtime/types.ts
export interface EnqueueSubagentMessageInput {
    responseId: string;
    agentId: string;
    agentType: string;
    childSessionId: SessionId;
    childToolCallId: string;
    parentToolCallId?: string;
    summary: string;
    message: string;
    traceContext: TraceContext;
}
// apps/cli/packages/core/src/runtime/command-queue.ts
export interface RuntimeCommandBase {
    readonly createdAt: Date;
    readonly id: RuntimeCommandId;
    readonly mode: RuntimeCommandMode;
    readonly priority: RuntimeCommandPriority;
    readonly traceContext: TraceContext;
}
export interface SubagentMessageRuntimeCommand extends RuntimeCommandBase {
    readonly branchGeneration: number;
    readonly mode: "subagent-message";
    readonly source: "subagent_message";
    readonly responseId: string;
    readonly agentId: string;
    readonly agentType: string;
    readonly childSessionId: string;
    readonly childToolCallId: string;
    readonly parentToolCallId?: string;
    readonly summary: string;
    readonly messageLength: number;
    readonly text: string;
}
