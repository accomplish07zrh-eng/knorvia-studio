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

# Fixed classifier facts

Regex flags i. Timeout matches reason stream_idle_timeout; code model_request_timeout/MODEL_REQUEST_TIMEOUT; name ModelStreamIdleTimeoutError; timeoutRegex message→failureKind provider_timeout. Network matches reason network_error; code model_network_error/MODEL_NETWORK_ERROR; networkRegex message→provider_network_error. Per record timeout branch wins over network; fallbacks provider_stream_error (Error) or unknown. Started message Error.message else String(error).
