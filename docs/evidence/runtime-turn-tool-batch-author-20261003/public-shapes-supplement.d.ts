export type MessageId = string & {
    readonly __brand: "MessageId";
};
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
    providerExecuted?: boolean;
}
export type ToolCallId = string & {
    readonly __brand: "ToolCallId";
};
export interface TraceContext {
    traceId: TraceId;
    queryId?: QueryId;
    spanId?: string;
    parentSpanId?: string;
    parentId?: string;
    sessionId?: SessionId;
    turnId?: TurnId;
    attributes?: Record<string, string | number | boolean>;
}
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
export interface RuntimeModelTextResult {
    contextUsageBreakdown?: ContextUsageBreakdownItem[];
    finishReason: string;
    providerMetadata?: Record<string, unknown>;
    reasoning?: ModelReasoningContentBlock[];
    text: string;
    toolCalls?: ModelToolCall[];
    usage: ModelUsage;
}
export interface StreamedToolExecutionResult {
    input: Record<string, unknown>;
    ledgerRecorded?: boolean;
    partID: PartId;
    result: ToolExecutionResult;
    toolCallId: ToolCallId;
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
import type { TurnState, TurnPhase, ToolCall, ToolScheduleState, PermissionRequestState, PermissionDecision, TurnResultType, TurnErrorState, ModelRequestState } from "./turn-state.js";
import type { ModelMessageContent, SessionId, TraceId, ToolCallId, TurnId } from "@knorvia/contracts";
import type { PendingTurnInput } from "@knorvia/contracts";
export interface TurnMachine {
    state: TurnState;
    start(): TurnState;
    startModelRequest(model: string, messages: ModelRequestState["messages"]): TurnState;
    receiveModelResponse(content: string): TurnState;
    addStreamingContent(content: string): TurnState;
    scheduleTools(toolCalls: ToolCall[], schedule: ToolScheduleState): TurnState;
    startToolExecution(): TurnState;
    completeTool(toolCallId: ToolCallId, result: {
        success: boolean;
        content: ModelMessageContent;
    }): TurnState;
    queuePendingInput(input: PendingTurnInput): TurnState;
    drainPendingInputs(): {
        inputs: PendingTurnInput[];
        state: TurnState;
    };
    requestPermission(request: PermissionRequestState): TurnState;
    resolvePermission(toolCallId: ToolCallId, decision: PermissionDecision, modifiedInput?: unknown): TurnState;
    aggregateResults(): TurnState;
    complete(response: string, resultType?: TurnResultType): TurnState;
    fail(error: TurnErrorState): TurnState;
    getNextPhase(): TurnPhase;
    isComplete(): boolean;
}
export declare class TurnMachineImpl implements TurnMachine {
    state: TurnState;
    constructor(state: TurnState);
    static create(sessionId: SessionId, turnNumber: number, input: string, traceId?: TraceId, turnId?: TurnId): TurnMachineImpl;
    private transition;
    start(): TurnState;
    startModelRequest(model: string, messages: ModelRequestState["messages"]): TurnState;
    receiveModelResponse(content: string): TurnState;
    addStreamingContent(content: string): TurnState;
    scheduleTools(toolCalls: ToolCall[], schedule: ToolScheduleState): TurnState;
    startToolExecution(): TurnState;
    completeTool(toolCallId: ToolCallId, result: {
        success: boolean;
        content: ModelMessageContent;
    }): TurnState;
    queuePendingInput(input: PendingTurnInput): TurnState;
    drainPendingInputs(): {
        inputs: PendingTurnInput[];
        state: TurnState;
    };
    requestPermission(request: PermissionRequestState): TurnState;
    resolvePermission(toolCallId: ToolCallId, decision: PermissionDecision, modifiedInput?: unknown): TurnState;
    aggregateResults(): TurnState;
    complete(response: string, resultType?: TurnResultType): TurnState;
    fail(error: TurnErrorState): TurnState;
    getNextPhase(): TurnPhase;
    isComplete(): boolean;
}

import type { MessageId, PartId, SessionEvent, StreamingToolExecutionTiming, StreamingToolLedgerStatus, ToolCall, ToolCallId, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
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
export {};

import type { CompletedToolPartMetadata, MessageId, Model, PartId, ToolCall, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
interface NonEmptyToolNameProjection {
    metadata?: Record<string, unknown>;
    toolName: string;
}
export declare function projectToolNameForNonEmptyBoundary(toolName: string): NonEmptyToolNameProjection;
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
export {};

import { type CompletedToolPartMetadata, type ToolExecutionResult } from "../deps.js";
export declare function mcpToolPartMetadata(presentation: {
    serverName: string;
    toolName: string;
    description?: string;
} | undefined): CompletedToolPartMetadata | undefined;
export declare function completedToolPartMetadata(result: ToolExecutionResult): CompletedToolPartMetadata;


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
