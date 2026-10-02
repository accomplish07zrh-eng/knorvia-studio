# Additional body-free declaration facts

Logger: runtime.logger?.warn(label:string, metadata:object), label first. runtime.sessionId:SessionId; runtime.config.agentName/mode/taskType optional; runtime.registry.get(toolName)?.metadata has sideEffectScope/readOnly/destructive. runtime.sessionStore?:SessionStorePort; capability gate narrows its structurally supported UsageStorePort. Imported public port/types are available from @knorvia/contracts. Use Parameters<UsageStorePort["recordModelUsage"]>[0] / ["upsertTurnUsage"] / ["upsertToolUsage"] as row types if useful. These are type facts, not authorization to read implementations.

createModelUsageSummaryFromEvents(events:readonly SessionEvent[]):ModelUsageSummary|undefined; isCoreError(error) narrows CoreError with code/message/retryable/type. Model network observation shape only {type:string;reason?:string;retryable?:boolean;message?:string}; do not expand validation.

```ts
export interface ModelUsageRecord {
    id: string;
    logicalRequestId: string;
    attemptIndex?: number;
    sessionID: SessionId;
    turnID?: TurnId;
    traceID?: TraceId;
    spanID?: string;
    assistantMessageID?: MessageId;
    parentUserMessageID?: MessageId;
    querySource: UsageQuerySource | string;
    providerId: ModelProviderId | string;
    modelId: ModelId | string;
    reasoningLevel?: string;
    agent?: string;
    mode?: string;
    taskType?: SessionTaskType;
    status: UsageStatus;
    startedAt: number;
    firstTokenAt?: number;
    completedAt?: number;
    durationMs?: number;
    timeToFirstTokenMs?: number;
    finishReason?: string;
    toolCallCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    providerTotalTokens?: number;
    computedTotalTokens?: number;
    retryCount?: number;
    retryable?: boolean;
    cancelledByUser?: boolean;
    contextExceeded?: boolean;
    errorType?: string;
    errorCode?: string;
    errorMessage?: string;
    rawUsage?: unknown;
    providerMetadata?: unknown;
}
```

```ts
export interface TurnUsageRecord {
    sessionID: SessionId;
    turnID: TurnId;
    traceID?: TraceId;
    userMessageID?: MessageId;
    status: UsageStatus;
    startedAt: number;
    firstModelStartAt?: number;
    firstTokenAt?: number;
    completedAt?: number;
    durationMs?: number;
    timeToFirstTokenMs?: number;
    modelRequestCount?: number;
    modelRetryCount?: number;
    toolCallCount?: number;
    toolErrorCount?: number;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    computedTotalTokens?: number;
    retryable?: boolean;
    cancelledByUser?: boolean;
    contextExceeded?: boolean;
    errorType?: string;
    errorCode?: string;
}
```

```ts
export interface ToolUsageRecord {
    id: string;
    sessionID: SessionId;
    turnID?: TurnId;
    traceID?: TraceId;
    toolCallID: ToolCallId | string;
    toolName: string;
    sideEffectScope?: ModelToolSideEffectScope | string;
    readOnly?: boolean;
    destructive?: boolean;
    approvalStatus?: "none" | "requested" | "allowed" | "denied";
    status: UsageStatus;
    startedAt: number;
    firstOutputAt?: number;
    completedAt?: number;
    durationMs?: number;
    timeToFirstOutputMs?: number;
    exitCode?: number;
    outputBytes?: number;
    stdoutBytes?: number;
    stderrBytes?: number;
    truncated?: boolean;
    retryCount?: number;
    retryable?: boolean;
    cancelledByUser?: boolean;
    errorType?: string;
    errorCode?: string;
    errorMessage?: string;
}
```

```ts
export interface UsageStorePort {
    recordModelUsage(input: ModelUsageRecord): Promise<void>;
    upsertTurnUsage(input: TurnUsageRecord): Promise<void>;
    upsertToolUsage(input: ToolUsageRecord): Promise<void>;
    pruneUsage(input?: {
        beforeTime?: number;
    }): Promise<void>;
    queryAppUsage(input: AppUsageQueryInput): Promise<AppUsageQueryResult>;
    queryTaskUsage(input: TaskUsageQueryInput): Promise<TaskUsageQueryResult>;
}
```

```ts
export interface SessionEvent {
    id: EventId;
    sessionId: SessionId;
    turnId?: TurnId;
    type: SessionEventType;
    timestamp: Date;
    traceId: TraceId;
    sequenceNumber: number;
    payload: unknown;
}
```

```ts
export interface ModelUsageSummary {
    source: "provider";
    modelRequestCount: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    webSearchRequests: number;
    webFetchRequests: number;
}
```

```ts
export interface RuntimeModelTextResult {
    contextUsageBreakdown?: ContextUsageBreakdownItem[];
    finishReason: string;
    providerMetadata?: Record<string, unknown>;
    reasoning?: ModelReasoningContentBlock[];
    text: string;
    toolCalls?: ModelToolCall[];
    usage: ModelUsage;
}
```
