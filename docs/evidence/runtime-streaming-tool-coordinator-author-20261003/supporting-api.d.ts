// Body-free selected type facts; import names refer to the unchanged dependency APIs.
export interface ResolvedTurnAttachment {
    contentBlock: ModelMessageContentBlock;
    filename?: string;
    metadata: AttachmentStorageMetadata;
    mime: string;
    source?: FilePartSource;
    url: string;
}
export interface StreamedToolExecutionResult {
    input: Record<string, unknown>;
    ledgerRecorded?: boolean;
    partID: PartId;
    result: ToolExecutionResult;
    toolCallId: ToolCallId;
}
export interface TurnRequestState {
    entries: readonly RuntimeMessageEntry[];
    outputTokenContinuationCount: number;
}
export interface RegularTurnLoopState {
    automationId?: string;
    offPeakTaskId?: string;
    currentUserMessageId: MessageId;
    events: SessionEvent[];
    modelResponse: string;
    model: Model;
    subagentModelOverride?: SubagentRunOptions["modelOverride"];
    modelStepCount: number;
    historyRoundCount: number;
    pendingStreamRecoveryRequest?: PendingStreamRecoveryRequest;
    streamRecoveryRetryCount: number;
    toolCallCount: number;
    turnRequestState: TurnRequestState;
    toolDisallowlist?: readonly string[];
    turnAbortSignal: AbortSignal;
    turnMachine: TurnMachineImpl;
    turnTraceContext: TraceContext;
}
