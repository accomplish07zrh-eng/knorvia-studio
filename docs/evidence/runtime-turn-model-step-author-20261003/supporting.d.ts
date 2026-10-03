export type CompactTrigger = (typeof CompactTrigger)[keyof typeof CompactTrigger];
export type CoreErrorType = (typeof CoreErrorType)[keyof typeof CoreErrorType];
export type SessionEventType = (typeof SessionEventType)[keyof typeof SessionEventType];
export type MessageId = string & {
    readonly __brand: "MessageId";
};
export type ModelNetworkStatusEvent = ModelRequestQueuedStatusEvent | ModelRequestAdmittedStatusEvent | ModelRequestStartedStatusEvent | ModelRequestCompletedStatusEvent | ModelRequestFailedStatusEvent | ModelRetryScheduledStatusEvent | ModelStreamStalledStatusEvent | ModelTelemetryMilestoneStatusEvent;
export interface ModelToolContract {
    name: string;
    description?: string;
    capability?: string;
    executionMode?: ToolExecutionMode;
    providerNative?: ProviderNativeToolSpec;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
    strict?: boolean;
    readOnly?: boolean;
    destructive?: boolean;
    concurrentSafe?: boolean;
    requiresUserInteraction?: boolean;
    maxOutputBytes?: number;
    timeoutMs?: number;
    needsApproval?: boolean;
    sideEffectScope?: ModelToolSideEffectScope;
    permission?: ToolPermissionSpec;
    resultBudget?: ToolResultBudget;
    execute?: (input: unknown, context: ModelToolExecutionContext) => Promise<unknown> | unknown;
}
export type RuntimeMessageEntry = RuntimeMessageMessageEntry | RuntimeAttachmentEntry;
export interface DrainedPendingInputDiagnostics {
    injectedMessageIds: MessageId[];
    intent?: TurnInputIntentMetadata;
    latestMessageId: MessageId | undefined;
    pendingInputIds: string[];
    queryIds?: QueryId[];
    runtimeEntries: readonly RuntimeMessageEntry[];
    toolDisallowlist?: readonly string[];
}
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
export interface RuntimeModelStreamSnapshot {
    reasoning: ModelReasoningContentBlock[];
    text: string;
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
export interface CompactLoopTracking {
    consecutiveRapidRefills: number;
    toolTurnsSinceCompact: number;
}
export interface ReactiveCompactLoopContext {
    activeEntries?: readonly RuntimeMessageEntry[];
    modelStepIndex: number;
    model: Model;
    rapidRefillCount: number;
    turnRequestState: TurnRequestState;
}
export interface TurnRequestState {
    entries: readonly RuntimeMessageEntry[];
    outputTokenContinuationCount: number;
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

import type { MessageId, Model, ModelToolCall, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { StreamedToolExecutionResult } from "../types.js";
import { type RegularTurnLoopState } from "./turn-loop-state.js";
interface StreamingToolCoordinator {
    accept(toolCall: ModelToolCall): void;
    abandon(reason: "cancelled" | "model_failed"): Promise<void>;
    drain(toolCalls: readonly ModelToolCall[]): Promise<StreamedToolExecutionResult[]>;
    recordReasoningDelta(text: string): void;
    recordTextDelta(text: string): void;
    recoverFromModelFailure(error: unknown, assistantCreatedAt: number, options?: {
        failedRequestId?: string;
    }): Promise<boolean>;
}
export declare function createStreamingToolCoordinator(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantMessageId: MessageId;
    model: Model;
    traceContext: TraceContext;
}): StreamingToolCoordinator;
export {};

import type { MessageId, Model, TraceContext } from "../deps.js";
import type { RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { type RegularTurnLoopState } from "./turn-loop-state.js";
interface AssistantPersistenceAnchor {
    latestAssistantMessageId: AgentRuntimeInternal["latestAssistantMessageId"];
    latestAssistantTurnId: AgentRuntimeInternal["latestAssistantTurnId"];
    latestConversationMessageId: AgentRuntimeInternal["latestConversationMessageId"];
}
export declare function captureAssistantPersistenceAnchor(runtime: AgentRuntimeInternal): AssistantPersistenceAnchor;
export declare function persistCompletedAssistantStep(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantPersistenceAnchor: AssistantPersistenceAnchor;
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    includeEmptyAssistant: boolean;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
}): Promise<boolean>;
export declare function persistOutputTokenLimitErrorCarrier(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    error: {
        data: Record<string, unknown>;
        name: string;
    };
    finishReason: string;
    model: Model;
    modelTraceContext: TraceContext;
}): Promise<void>;
export declare function finishModelStepWithoutToolCalls(this: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantPersistenceAnchor: AssistantPersistenceAnchor;
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
}): Promise<"continue" | "break">;
export {};

import type { MessageId, MessageWithParts, Model, ModelUsage, TraceContext } from "../deps.js";
import type { MainTurnCacheHitAggregate, RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
import type { RuntimeMessageEntry } from "../../agent/message-history.js";
import { type PersistedTokenUsageBaseline } from "../../agent/message-history-usage.js";
interface RecordMainTurnModelUsageInput {
    assistantMessageId: MessageId;
    error?: unknown;
    model: Model;
    modelTraceContext: TraceContext;
    networkEventStartIndex: number;
    result?: RuntimeModelTextResult;
    startedAt: number;
    status: "completed" | "error" | "cancelled";
    toolCallCount?: number;
}
export declare function recordMainTurnModelUsage(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, input: RecordMainTurnModelUsageInput): Promise<void>;
export declare function querySourceForTask(taskType: AgentRuntimeInternal["config"]["taskType"]): string;
export declare function findLatestCommittedAssistantUsage(sourceEntries: readonly (RuntimeMessageEntry | undefined)[]): {
    messageIndex: number;
    baseline: PersistedTokenUsageBaseline;
} | undefined;
export declare function mainTurnCacheHitAggregateFromMessages(input: {
    activeMessages: readonly MessageWithParts[];
    persistedMessages: readonly MessageWithParts[];
}): MainTurnCacheHitAggregate;
export declare function recordMainTurnCacheHitUsage(runtime: AgentRuntimeInternal, usage: ModelUsage | undefined): {
    cacheReadTokens: number;
    cacheWriteTokens: number;
    hitRate: number | null;
    hitRateRequestCount: number;
    inputTokens: number;
    latestHitRate: number | null;
    totalCacheReadTokens: number;
    totalCacheWriteTokens: number;
    totalInputTokens: number;
} | undefined;
export {};

import type { RuntimeModelTextResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { createRuntimeAssistantEntry, type RuntimeMessageEntry } from "../../agent/message-history.js";
import type { RegularTurnLoopState, TurnRequestState } from "./turn-loop-state.js";
export declare const OUTPUT_TOKEN_LIMIT_ERROR_MESSAGE = "The model's response exceeded the output token maximum.";
type OutputTokenContinuationDecision = "continue" | "exhausted" | "none";
export declare function classifyOutputTokenContinuation(input: {
    finishReason: string | undefined;
    rawFinishReason: string | undefined;
    toolCallCount: number;
    continuationCount: number;
}): OutputTokenContinuationDecision;
export declare function isOutputTokenLimitFinishReason(finishReason: string | undefined, rawFinishReason: string | undefined): boolean;
export declare function filterOutputTokenContinuationEntries(entries: readonly RuntimeMessageEntry[]): readonly RuntimeMessageEntry[];
export declare function preserveCanonicalContextPrefix(currentCanonicalEntries: readonly RuntimeMessageEntry[], turnLocalEntries: readonly RuntimeMessageEntry[]): readonly RuntimeMessageEntry[];
export declare function appendTurnRequestEntries(state: TurnRequestState, entries: readonly RuntimeMessageEntry[]): void;
export declare function commitTurnRequestEntries(runtime: AgentRuntimeInternal, state: TurnRequestState, entries: readonly RuntimeMessageEntry[]): void;
export declare function commitAssistantToTurnRequest(runtime: AgentRuntimeInternal, state: RegularTurnLoopState, result: RuntimeModelTextResult, toolCalls: Parameters<typeof createRuntimeAssistantEntry>[1]): boolean;
export declare function hasAssistantReasoningContent(reasoning: NonNullable<RuntimeModelTextResult["reasoning"]>[number]): boolean;
export declare function appendOutputTokenContinuation(state: TurnRequestState): void;
export declare function completeOutputTokenRecovery(state: TurnRequestState): void;
export declare function finishOutputTokenRecovery(state: TurnRequestState): void;
export {};

import type { MessageId, Model, ToolCallId, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { type RegularTurnLoopState } from "./turn-loop-state.js";
export declare const START_PLAN_BUSY_AUTO_RETRY_EXHAUSTED_MESSAGE = "Start Plan is busy and automatic model stream recovery reached the maximum retry count.";
interface StreamRecoveryAttempt {
    maxRetries: number;
    retryNumber: number;
}
export declare function hasStreamRecoveryBudget(state: RegularTurnLoopState): boolean;
export declare function beginStreamRecoveryAttempt(state: RegularTurnLoopState): StreamRecoveryAttempt;
export declare function beginStartPlanBusyAdmissionRetryAttempt(state: RegularTurnLoopState): StreamRecoveryAttempt;
export declare function isStartPlanBusyStreamRecoveryFailure(error: unknown): boolean;
export declare function createStartPlanBusyAutoRetryExhaustedError(error: unknown): Error;
export declare function getStartPlanBusyAdmissionRetryDelayMs(input: {
    error: unknown;
    providerId: string;
    state: RegularTurnLoopState;
    turnNumber: number;
}): number | undefined;
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
export {};

import type { MessageId, ModelToolCall, TraceContext } from "../deps.js";
import type { RuntimeModelTextResult, StreamedToolExecutionResult } from "../types.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RegularTurnLoopState } from "./turn-loop-state.js";
export declare function executeToolCallsForModelStep(this: AgentRuntimeInternal, state: RegularTurnLoopState, options: {
    assistantCreatedAt: number;
    assistantMessageId: MessageId;
    modelTraceContext: TraceContext;
    result: RuntimeModelTextResult;
    streamedToolResults?: StreamedToolExecutionResult[];
    toolCalls: ModelToolCall[];
}): Promise<"continue" | "break">;


export type CompactTrigger = (typeof CompactTrigger)[keyof typeof CompactTrigger];
export type CoreErrorType = (typeof CoreErrorType)[keyof typeof CoreErrorType];
export type SessionEventType = (typeof SessionEventType)[keyof typeof SessionEventType];
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
export interface ActiveTurnSteeringState {
    kind: ActiveTurnKind;
    goalStateChangeReminderDeferralOpen: boolean;
    pendingGoalStateChangeReminder?: {
        text: string;
    };
    pendingInputs: PendingTurnInput[];
    steerable: boolean;
    traceContext: TraceContext;
    turnId: TurnId;
    inputId?: string;
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
