export interface ModelReasoningContentBlock {
    type: "reasoning";
    text: string;
    providerOptions?: Record<string, unknown>;
}
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
    providerExecuted?: boolean;
}
export interface ModelUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    serverToolUse?: ModelServerToolUsage;
}
export type ToolCallId = string & {
    readonly __brand: "ToolCallId";
};
export interface RunModelTextRequestOptions {
    abortSignal?: AbortSignal;
    assistantMessageId: MessageId;
    events: SessionEvent[];
    maxOutputTokens?: number;
    latestRealUserMessageIndex?: number;
    messages: ModelInputMessage[];
    sourceEntries?: readonly (RuntimeMessageEntry | undefined)[];
    model: Model;
    onStreamSnapshot?: (snapshot: RuntimeModelStreamSnapshot) => void;
    onStreamReasoningDelta?: (text: string) => void;
    onStreamTextDelta?: (text: string) => void;
    onStreamToolCall?: (toolCall: ModelToolCall) => void;
    onModelNetworkStatus?: (event: ModelNetworkStatusEvent) => void;
    streamRecovery?: ModelStreamRecoveryStatus;
    tools: ModelToolContract[];
    traceContext: TraceContext;
}
export interface RuntimeModelTextResult {
    contextUsageBreakdown?: ContextUsageBreakdownItem[];
    finishReason: string;
    providerMetadata?: Record<string, unknown>;
    reasoning?: ModelReasoningContentBlock[];
    text: string;
    toolCalls?: ModelToolCall[];
    usage: ModelUsage;
}
export interface AgentRuntimeInternal extends AgentRuntimeCoreMethods, AgentRuntimeTurnMethods, AgentRuntimeHookMethods {
    sessionId: SessionId;
    turnNumber: number;
    config: AgentRuntimeConfig;
    permissionService: PermissionService;
    permissionBroker: PermissionBrokerPort;
    toolScheduler: ToolScheduler;
    eventReducer: EventReducer;
    eventStore: SessionEventStorePort;
    rootTraceContext: TraceContext;
    appVersion: string;
    logger?: Logger;
    eventSinks: Set<SessionEventSink>;
    now: () => Date;
    isRemoteWorkspace: () => boolean;
    registry: ToolRegistry;
    executor: ToolExecutor;
    hookRunner?: HookRunner;
    workspaceHookAdmission?: WorkspaceHookRuntimeAdmissionPort;
    modelFactory: AgentRuntimeDeps["modelFactory"];
    modelIoDir?: string;
    providerRuntimeHeadersPort?: ProviderRuntimeHeadersPort;
    browserControlPort?: AgentRuntimeDeps["browserControlPort"];
    modelRequestAdmission?: AgentRuntimeDeps["modelRequestAdmission"];
    sessionModelSelection: ModelSelection | undefined;
    messageHistory: MessageHistory;
    readFileState: ReadFileStateMap;
    cachedTools: ModelToolContract[] | null;
    contextBuilder: ContextBuilder | null;
    contextInitialized: boolean;
    contextSourceSnapshot?: ContextSourceSnapshot;
    latestContextBuildResult?: ContextBuildResult;
    memoryRoot?: string;
    memoryIndexContent?: string;
    memoryExtractionScheduler?: ProjectMemoryExtractionScheduler;
    contextSourcePort?: ContextSourcePort;
    skillPort?: SkillPort;
    mcpPort?: McpPort;
    mcpStartupPromise?: Promise<McpConnectionSnapshot>;
    residencyBlockingWorkCount: number;
    mcpInitialized: boolean;
    mcpToolsRegistered: boolean;
    subagentPort?: SubagentPort;
    dynamicWorkflowRunPort?: DynamicWorkflowRunPort;
    modelCatalogPort?: ModelCatalogPort;
    runtimeTaskRegistry: RuntimeTaskRegistry;
    branchGeneration: number;
    artifactStore?: ToolArtifactStorePort;
    executionPort?: ExecutionPort;
    fileSystemPort?: FileSystemPort;
    imageProcessorPort?: ImageProcessorPort;
    pdfDocumentPort?: PdfDocumentPort;
    skillLoadOutcome?: SkillLoadOutcome;
    workingDirectory: string;
    workspaceRoot: string;
    sessionStore?: SessionStorePort;
    sessionMailboxPort?: SessionMailboxPort;
    sessionPersisted: boolean;
    needsPlanModeExitReminder: boolean;
    latestConversationMessageId?: MessageId;
    latestAssistantMessageId?: MessageId;
    latestAssistantTurnId?: TurnId;
    mainTurnCacheHitAggregate: MainTurnCacheHitAggregate;
    currentTurnFileChanges: RuntimeTurnFileChangeMap;
    lastAssistantCompletedAtMs?: number;
    lastEmittedLocalDate?: string;
    autoCompactConsecutiveFailures: number;
    runtimeCommandQueue: RuntimeCommandQueue;
    runtimeCommandDrainActive: boolean;
    activeForegroundExecution?: ActiveForegroundExecutionState;
    foregroundPromotionLease?: ForegroundPromotionLeaseState;
    activeTurn?: ActiveTurnSteeringState;
    activeTurnStartReservation?: ActiveTurnStartReservation;
    pendingInputSequence: number;
    pendingInputReservations: Map<string, string>;
    permissionFullAccessPending?: boolean;
    pendingInputDrains?: number;
    lastPermissionGrantId?: string;
    queueAutoDrain: boolean;
    queueExternalDrainActive: boolean;
    shuttingDown: boolean;
    backgroundTaskNotificationsSealed: boolean;
    backgroundTaskNotificationSealReason?: BackgroundTaskNotificationSealReason;
    pendingModelChangeTimeline?: PendingModelChangeTimeline;
    sessionStartHookRan: boolean;
    sessionTitleGenerationAttempted: boolean;
    agentTelemetry: RuntimeTelemetryFacade;
}

export type MessagePart = TextPart | ReasoningPart | FilePart | AgentPart | CompactionPart | TimelinePart | SubtaskPart | RetryPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | ToolPart;
export interface Model {
    readonly providerId: ModelProviderId;
    readonly modelId: ModelId;
    readonly displayName?: string;
    readonly properties: ModelProperties;
    readonly optionSpecs: ModelOptionSpecs;
    readonly options: ModelOptions;
    bind(options?: ModelOptions): Model;
    generateText(request: ModelRequest): Promise<ModelResult>;
    streamText(request: ModelRequest): AsyncIterable<ModelEvent>;
}
export interface ModelInvocationContext {
    metadata?: Record<string, unknown>;
    modelCall?: ModelApiCallObservation;
    modelRequestSessionType?: ModelRequestSessionType;
    modelRetryBudget?: ModelRetryBudget;
    modelRequestAdmission?: ModelRequestAdmission;
    statusSink?: ModelStatusSink;
    traceContext?: TraceContext;
    streamIdleTimeoutRetryNumber?: number;
    streamRecovery?: ModelStreamRecoveryStatus;
    preserveProviderStreamBoundaries?: boolean;
    refreshRuntimeHeadersBeforeAttempt?: (input: {
        accountAccess?: KnorviaProviderAccountAccess;
        attempt: number;
        reason?: "model-request";
        abortSignal?: AbortSignal;
        providerId: string;
        modelId: string;
        traceContext?: TraceContext;
    }) => Promise<{
        headersApplied: boolean;
        requestAuth?: ModelRequestAuth;
    }>;
}
export type ModelStreamEvent = {
    type: "start";
} | {
    type: "compact_stream_boundary";
    boundary: "provider_response_start" | "inferred_content_block_stop";
} | {
    type: "compact_stream_boundary";
    boundary: "provider_content_block_start";
    blockType: string | null;
    index: number | null;
} | {
    type: "compact_stream_boundary";
    boundary: "provider_content_block_delta";
    deltaType: string | null;
    index: number | null;
} | {
    type: "compact_stream_boundary";
    boundary: "provider_content_block_stop";
    index: number | null;
} | {
    type: "compact_stream_boundary";
    boundary: "provider_stop_reason";
    present: boolean;
} | {
    type: "text_start";
    id: string;
} | {
    type: "text_delta";
    id?: string;
    text: string;
} | {
    type: "text_end";
    id: string;
} | {
    type: "reasoning_start";
    id: string;
    providerMetadata?: Record<string, unknown>;
} | {
    type: "reasoning_delta";
    id?: string;
    text: string;
    providerMetadata?: Record<string, unknown>;
} | {
    type: "reasoning_end";
    id: string;
    providerMetadata?: Record<string, unknown>;
} | {
    type: "tool_input_start";
    id: string;
    toolName: string;
    providerExecuted?: boolean;
} | {
    type: "tool_input_delta";
    id: string;
    delta: string;
} | {
    type: "tool_input_end";
    id: string;
} | {
    type: "tool_call";
    toolCall: ModelToolCall;
} | {
    type: "finish";
    finishReason: string;
    providerMetadata?: Record<string, unknown>;
    usage: ModelUsage;
} | {
    type: "error";
    error: unknown;
};
export interface ModelStreamingPayload {
    delta: string;
    done: boolean;
    kind?: ModelStreamingKind;
    assistantMessageId?: MessageId;
    partId?: PartId;
    toolCallId?: ToolCallId;
    toolName?: string;
    input?: unknown;
    providerExecuted?: boolean;
}
export type ModelMessageContent = string | ModelMessageContentBlock[];
export interface ModelReasoningContentBlock {
    type: "reasoning";
    text: string;
    providerOptions?: Record<string, unknown>;
}
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
    providerExecuted?: boolean;
}
export interface ModelUsage {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    reasoningTokens?: number;
    serverToolUse?: ModelServerToolUsage;
}
export type TurnSteerResult = {
    kind: "queued";
    pendingInputId: string;
    queueLength: number;
    turnId: TurnId;
} | {
    activeTurnId?: TurnId;
    kind: "rejected";
    reason: TurnSteerRejectReason;
};
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
    providerExecuted?: boolean;
}
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
export interface ExecuteToolsOptions {
    automationTurn?: boolean;
    offPeakTurn?: boolean;
    signal?: AbortSignal;
    traceContext?: TraceContext;
    subagentModelOverride?: import("@knorvia/contracts").SubagentRunOptions["modelOverride"];
    model?: Model;
    onBatchStart?: (toolCallIds: string[]) => Promise<void>;
}
export interface RuntimeModelTextResult {
    contextUsageBreakdown?: ContextUsageBreakdownItem[];
    finishReason: string;
    providerMetadata?: Record<string, unknown>;
    reasoning?: ModelReasoningContentBlock[];
    text: string;
    toolCalls?: ModelToolCall[];
    usage: ModelUsage;
}
