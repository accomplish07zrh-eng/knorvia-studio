// Public supporting type facts only; dependency locations are labels.
// apps/cli/packages/core/src/runtime/methods/turn-loop-state.ts
export interface TurnRequestState {
    entries: readonly RuntimeMessageEntry[];
    outputTokenContinuationCount: number;
}
export interface RegularTurnLoopState {
    activeTurn?: ActiveTurnSteeringState;
    automationId?: string;
    offPeakTaskId?: string;
    automationCreateLimitReached?: boolean;
    anomalyWarningsInjected: number;
    backgroundSubagentResultConsumed: boolean;
    workflowResultConsumed: boolean;
    compactTracking?: CompactLoopTracking;
    currentUserMessageId: MessageId;
    drainedSteerForNextRequest?: DrainedPendingInputDiagnostics;
    events: SessionEvent[];
    input: string;
    modelResponse: string;
    model: Model;
    modelSelectionScope?: "execution";
    subagentModelOverride?: SubagentRunOptions["modelOverride"];
    modelStepCount: number;
    historyRoundCount: number;
    reactiveCompactAttemptedInCurrentModelStep: boolean;
    repeatedToolCallSignature?: string;
    repeatedToolCallStreakCount: number;
    pendingStreamRecoveryRequest?: PendingStreamRecoveryRequest;
    stopHookContinuationCount: number;
    stableProductStartMessageId?: MessageId;
    stableBoundaryAssistantMessageId?: MessageId;
    streamRecoveryRetryCount: number;
    tokenCount: number;
    toolCallCount: number;
    turnRequestState: TurnRequestState;
    toolDisallowlist?: readonly string[];
    traceId: TraceId;
    turnAbortSignal: AbortSignal;
    turnId: TurnId;
    turnMachine: TurnMachineImpl;
    turnOutputStyle?: OutputStylePromptConfig;
    turnTraceContext: TraceContext;
    userMessageId: MessageId;
}
