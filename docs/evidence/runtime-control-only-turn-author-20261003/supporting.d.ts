// Supporting public type facts only; source module labels are reference locations.
// apps/cli/packages/core/src/runtime/command-queue.ts
export interface RuntimeCommandBase {
    readonly createdAt: Date;
    readonly id: RuntimeCommandId;
    readonly mode: RuntimeCommandMode;
    readonly priority: RuntimeCommandPriority;
    readonly traceContext: TraceContext;
}
export interface ControlOnlyTurnRuntimeCommand extends RuntimeCommandBase {
    readonly branchGeneration: number;
    readonly mode: "control-only-turn";
    readonly text: string;
    readonly titleInput: string;
    readonly inputId?: string;
    readonly workflowLaunch: WorkflowLaunchMeta;
}
