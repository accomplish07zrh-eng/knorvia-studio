# Additional body-free public port facts

Curator supplies declaration-only clarification, source-derived; no predecessor executable body. Shell transport may read permitted packets/write/hash own outputs, but no authored-code execution or live IO.

ToolCall {id:ToolCallId,input:unknown,name:string}; ModelToolCall {id:string,input:unknown,name:string,providerExecuted?:boolean}, extra provider fields may exist and must survive shallow cloning. Runtime has registry (NOT toolRegistry): get(name)→entry|undefined; getMetadata(name)→metadata|undefined. Entry metadata has readOnly,concurrentSafe,destructive,needsApproval,requiresUserInteraction,sideEffectScope,mcpPresentation; entry.permission?.sideEffectScope and entry.requiresUserInteraction may override. sideEffectScope includes literal none. Runtime config has modelStreaming(off/on),streamingToolExecution(off/readOnly). logger?.warn(label:string,metadata:object); error metadata uses Error.message else String(error).

createEvent(type:SessionEventType,payload:unknown,traceContext:TraceContext):SessionEvent; appendEvent(event:SessionEvent,traceContext:TraceContext):Promise<void>. Both called on runtime receiver. Event payload remains passed object reference. emitModelStreamingEvent(payload,traceContext,events):Promise<void> runtime-bound. SessionEventType members StreamingToolLedgerUpdated,StreamRecoveryAnchorCreated,StreamRecoveryStarted,StreamRecoveryAnchorSelected,StreamRecoveryTailDiscarded,StreamRecoveryRetryStarted.

TurnMachineImpl constructor accepts transition result; instance receiveModelResponse(text:string),aggregateResults() produce constructor-compatible transition; no actual provider request. Existing helpers recordModelHistoryRound(state):void, isAutomationMutationRestrictedTurn(state):boolean, isOffPeakCreateRestrictedTurn(state):boolean; caller must use unchanged helper implementations. mcpToolPartMetadata(presentation|undefined)→CompletedToolPartMetadata|undefined. requireRuntimeToolCallName(tool,{logger,model,source,traceContext})→string; toRecordInput(unknown)→Record<string,unknown>; throwIfTurnAborted(AbortSignal):void.
API seam runtime/helpers/streaming-tool-ledger.d.ts
```ts
interface EmitLedgerUpdateOptions {
    assistantMessageId: MessageId;
    toolCall: ToolCall;
    status: StreamingToolLedgerStatus;
    input?: Record<string, unknown>;
    startedAt?: Date;
    committedAt?: Date;
    resultPartId?: PartId;
    recoveryAnchorId?: string;
    blockedReason?: string;
    executionTiming?: StreamingToolExecutionTiming;
}
interface EmitRecoveryAnchorOptions {
    assistantMessageId: MessageId;
    toolCallId: ToolCallId;
    toolName: string;
    success: boolean;
    resultPartId?: PartId;
    committedAt: Date;
}
export declare function createStreamingToolAttemptId(assistantMessageId: MessageId): string;
export declare function createStreamRecoveryAnchorId(assistantMessageId: MessageId, toolCallId: ToolCallId): string;
export declare function emitStreamingToolLedgerUpdate(runtime: AgentRuntimeInternal, events: SessionEvent[], traceContext: TraceContext, options: EmitLedgerUpdateOptions): Promise<SessionEvent>;
export declare function emitStreamRecoveryAnchor(runtime: AgentRuntimeInternal, events: SessionEvent[], traceContext: TraceContext, options: EmitRecoveryAnchorOptions): Promise<SessionEvent>;
```
API seam runtime/methods/streaming-recovery.d.ts
```ts
interface StreamRecoveryAttempt {
    maxRetries: number;
    retryNumber: number;
}
export declare function hasStreamRecoveryBudget(state: RegularTurnLoopState): boolean;
export declare function beginStreamRecoveryAttempt(state: RegularTurnLoopState): StreamRecoveryAttempt;
export declare function emitStreamRecoveryStarted(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    traceContext: TraceContext;
}, error: unknown, recoveryAttempt: StreamRecoveryAttempt): Promise<void>;
export declare function emitStreamRecoveryRetryEvents(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantMessageId: MessageId;
    failedRequestId?: string;
    traceContext: TraceContext;
}, recovery: StreamRecoveryAttempt & {
    discardedReasoningBytes: number;
    discardedTextBytes: number;
    reason: "latest_committed_tool_result" | "no_tool_committed";
    toolCallIds: ToolCallId[];
}): Promise<void>;
export declare function recoverPartialAssistantOutputFailure(input: {
    abortController: AbortController;
    assistantCreatedAt: number;
    discardedReasoningBytes: number;
    discardedTextBytes: number;
    error: unknown;
    options: {
        assistantMessageId: MessageId;
        failedRequestId?: string;
        model: Model;
        traceContext: TraceContext;
    };
    runtime: AgentRuntimeInternal;
    state: RegularTurnLoopState;
    turnAbortListener: () => void;
}): Promise<boolean>;
```
API seam runtime/methods/tools.d.ts
```ts
export declare function scheduleTools(this: AgentRuntimeInternal, toolCalls: ToolCall[]): Promise<ToolSchedule>;
export declare function executeTools(this: AgentRuntimeInternal, toolCalls: ToolCall[], schedule: ToolSchedule, options?: ExecuteToolsOptions): Promise<ExecuteToolsResult>;
export declare function emitToolScheduledEvents(this: AgentRuntimeInternal, toolCalls: ToolCall[], schedule: ToolSchedule, assistantMessageId: MessageId, traceContext: TraceContext): Promise<SessionEvent[]>;
```
API seam runtime/methods/message-persistence.d.ts
```ts
export declare function persistAssistantMessage(this: AgentRuntimeInternal, messageID: MessageId, parentID: MessageId, created: number, update: {
    completed?: number;
    error?: {
        name: string;
        data?: Record<string, unknown>;
    };
    finish?: string;
    tokens?: ReturnType<typeof toTokenUsageInfo>;
} | undefined, traceContext: TraceContext, model?: Model): Promise<void>;
export declare function persistPart(this: AgentRuntimeInternal, input: MessagePart, traceContext: TraceContext, copyFrom?: Parameters<SessionStorePort["savePart"]>[1]): Promise<void>;
```
API seam runtime/methods/tool-part-persistence.d.ts
```ts
export declare function persistPendingToolPart(runtime: AgentRuntimeInternal, options: {
    assistantMessageId: MessageId;
    declarationIndex: number;
    input: Record<string, unknown>;
    partID: PartId;
    toolCall: ToolCall;
    traceContext: TraceContext;
    metadata?: CompletedToolPartMetadata;
    model: Model;
}): Promise<void>;
```
API seam runtime/methods/streaming-tool-synthetic-result.d.ts
```ts
type SyntheticStreamedToolReason = "not_executed" | "unknown_execution_state";
export declare function createSyntheticStreamedToolResult(toolCall: ModelToolCall, reason: SyntheticStreamedToolReason): StreamedToolExecutionResult;
```
API seam agent/message-history.d.ts
```ts
export declare function realUserRuntimeMetadata(): RuntimeMessageMetadata;
export declare function systemReminderAttachmentEntry(source: SystemReminderSource, content: string): RuntimeAttachmentEntry;
export declare function createRuntimeAssistantEntry(content: string, toolCalls?: readonly ToolCallInput[], reasoning?: readonly ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo): RuntimeMessageMessageEntry;
```
API seam runtime/methods/turn-tools.d.ts
```ts
export declare function executeToolCallsForModelStep(this: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
    streamedToolResults?: StreamedToolExecutionResult[];
    toolCalls: ModelToolCall[];
}): Promise<"continue" | "break">;
```
API seam runtime/methods/turn-output-token-continuation.d.ts
```ts
export declare function commitTurnRequestEntries(runtime: AgentRuntimeInternal, state: TurnRequestState, entries: readonly RuntimeMessageEntry[]): void;
```

Fixed warning label: Streaming tool execution fell back to end-of-stream execution.
ExecuteToolsOptions fields subagentModelOverride,model,automationTurn,offPeakTurn,signal,traceContext,onBatchStart; onBatchStart():Promise<void>. ExecuteToolsResult {events:SessionEvent[],results:ToolExecutionResult[]}.
