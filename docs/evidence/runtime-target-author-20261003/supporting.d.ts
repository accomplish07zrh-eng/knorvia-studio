// Supporting public type facts only; source module labels are reference locations.
// apps/cli/packages/core/src/runtime/command-queue.ts
export interface RuntimeCommandBase {
    readonly createdAt: Date;
    readonly id: RuntimeCommandId;
    readonly mode: RuntimeCommandMode;
    readonly priority: RuntimeCommandPriority;
    readonly traceContext: TraceContext;
}
export interface TargetContinuationRuntimeCommandOptions {
    readonly abortSignal?: AbortSignal;
    readonly inputId?: string;
    readonly intent?: ExecuteTurnOptions["intent"];
    readonly traceContext: TraceContext;
    readonly verifyBeforeContinue?: boolean;
}
export interface TargetContinuationRuntimeCommand extends RuntimeCommandBase {
    readonly mode: "target-continuation";
    readonly options: TargetContinuationRuntimeCommandOptions;
    readonly reject: (error: unknown) => void;
    readonly resolve: (result: TurnResult | null) => void;
}
