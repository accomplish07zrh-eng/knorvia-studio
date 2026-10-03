export type LocalTtftDetail = z.infer<typeof localTtftDetailSchema>;
export type CoreErrorType = (typeof CoreErrorType)[keyof typeof CoreErrorType];
export type HookEventName = (typeof HookEventName)[keyof typeof HookEventName];
export type SessionEventType = (typeof SessionEventType)[keyof typeof SessionEventType];
export interface HookRunResult {
    additionalContexts: string[];
    blockRequested?: boolean;
    hookPermissionDecisionReason?: string;
    permissionBehavior?: HookPermissionDecision;
    permissionRequestResult?: PermissionRequestHookDecision;
    preventContinuation?: boolean;
    stopShouldContinue?: boolean;
    stopReason?: string;
    updatedInput?: unknown;
}
export type MessageId = string & {
    readonly __brand: "MessageId";
};
export type MessagePart = TextPart | ReasoningPart | FilePart | AgentPart | CompactionPart | TimelinePart | SubtaskPart | RetryPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | ToolPart;
export type QueryId = string & {
    readonly __brand: "QueryId";
};
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
export interface SessionGoal {
    sessionID: SessionId;
    targetID: string;
    objective: string;
    summaryTitle: string | null;
    status: GoalStatus;
    tokenBudget: number | null;
    tokensUsed: number;
    timeUsedSeconds: number;
    activeInputId?: string | null;
    activeRunStartedAtMs?: number | null;
    activeRunLastSeenAtMs?: number | null;
    time: {
        created: number;
        updated: number;
    };
}
export interface TurnState {
    id: TurnId;
    sessionId: SessionId;
    turnNumber: number;
    phase: TurnPhase;
    traceId: TraceId;
    input: string;
    attachments?: TurnAttachment[];
    modelRequest?: ModelRequestState;
    streamingContent: string;
    finalResponse?: string;
    toolCalls: ToolCallState[];
    toolResults: ToolResultState[];
    scheduledTools: ToolScheduleState;
    pendingInputs: PendingTurnInput[];
    acceptsPendingInput: boolean;
    pendingPermissions: PermissionRequestState[];
    resolvedPermissions: PermissionResultState[];
    resultType: TurnResultType;
    error?: TurnErrorState;
    startedAt: Date;
    completedAt?: Date;
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
export type ExecuteTurnOptions = ExecuteTurnOptionsBase & import("@knorvia/contracts").TurnBackgroundAttribution;
export interface TurnResult {
    response: string;
    turnId: TurnId;
    traceId: TraceId;
    usage?: ModelUsageSummary;
    events: SessionEvent[];
    projection: SessionProjection;
}
export interface ActiveTurnStartReservation {
    kind: ActiveTurnKind;
    traceContext: TraceContext;
    turnId: TurnId;
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
export interface PromptRuntimeCommand extends RuntimeCommandBase {
    readonly attachments?: TurnState["attachments"];
    readonly input: string;
    readonly mode: "prompt";
    readonly options?: ExecuteTurnOptions;
    readonly startReservation?: ActiveTurnStartReservation;
    readonly reject: (error: unknown) => void;
    readonly resolve: (result: TurnResult) => void;
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
export interface DrainedPendingInputDiagnostics {
    injectedMessageIds: MessageId[];
    intent?: TurnInputIntentMetadata;
    latestMessageId: MessageId | undefined;
    pendingInputIds: string[];
    queryIds?: QueryId[];
    runtimeEntries: readonly RuntimeMessageEntry[];
    toolDisallowlist?: readonly string[];
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

import { type Model, type ModelSelection, type TraceContext, type TurnInputIntentMetadata } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
export declare function createTurnModel(runtime: AgentRuntimeInternal, options?: {
    selection?: ModelSelection;
    requestDependencies?: import("@knorvia/contracts").ModelRequestDependencies;
}): Model;
export declare function applySubmissionExecutionState(runtime: AgentRuntimeInternal, intent: TurnInputIntentMetadata | undefined, traceContext: TraceContext, modelExecution?: import("../types.js").ModelExecutionContext, preparedModel?: Model): Promise<Model | undefined>;
export declare function sameModelSelection(left: ModelSelection | undefined, right: ModelSelection): boolean;
export declare function persistRuntimeModelSelection(runtime: AgentRuntimeInternal, selection: ModelSelection): Promise<void>;

import type { MessageId, Model, SessionEvent, TraceContext, TurnId } from "@knorvia/contracts";
import type { AgentRuntimeInternal } from "../internal.js";
import type { RuntimeModelTextResult } from "../types.js";
type ModelUsageQuerySource = "main_turn" | "compact" | "session_title" | "goal_completion_verification" | string;
interface RecordModelUsageInput {
    assistantMessageId?: MessageId;
    attemptIndex?: number;
    error?: unknown;
    events: readonly SessionEvent[];
    model: Model;
    networkEventStartIndex: number;
    parentUserMessageId?: MessageId;
    querySource: ModelUsageQuerySource;
    result?: RuntimeModelTextResult;
    startedAt: number;
    status: "completed" | "error" | "cancelled";
    toolCallCount?: number;
    traceContext: TraceContext;
}
interface RecordTurnUsageInput {
    completedAt: number;
    error?: unknown;
    events: readonly SessionEvent[];
    startedAt: number;
    status: "completed" | "error" | "cancelled";
    traceContext: TraceContext;
    turnId: TurnId;
    userMessageId?: MessageId;
}
export declare function recordModelUsageFact(runtime: AgentRuntimeInternal, input: RecordModelUsageInput): Promise<void>;
export declare function recordTurnUsageFact(runtime: AgentRuntimeInternal, input: RecordTurnUsageInput): Promise<void>;
export declare function recordToolUsageFromEvent(runtime: AgentRuntimeInternal, event: SessionEvent, traceContext: TraceContext): Promise<void>;
export {};

import { type RuntimeInputPresentation, type ModelCacheControl, type ModelMessageContent, type Model, type ModelReasoningContentBlock, type TokenUsageInfo } from "@knorvia/contracts";
import { type SystemReminderSource } from "../system-reminder/source.js";
export interface ToolCallInput {
    id: string;
    name: string;
    input: unknown;
}
export type ReasoningContentInput = ModelReasoningContentBlock;
export interface ModelInputMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: ModelMessageContent;
    cacheControl?: ModelCacheControl;
    toolCalls?: ToolCallInput[];
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    providerId?: Model["providerId"];
    modelId?: Model["modelId"];
}
export type RuntimeMessageSource = SystemReminderSource | "shared_context" | "real_user" | "legacy_synthetic";
export interface RuntimeMessageMetadata {
    source: RuntimeMessageSource;
    inputPresentation?: RuntimeInputPresentation;
}
export interface RuntimeMessageMessageEntry {
    kind?: "message";
    message: ModelInputMessage;
    metadata?: RuntimeMessageMetadata;
    tokens?: TokenUsageInfo;
    queryScope?: "output_token_continuation";
}
export interface RuntimeAttachmentEntry {
    kind: "attachment";
    content: string;
    cacheControl?: ModelCacheControl;
    metadata: RuntimeMessageMetadata;
}
export type RuntimeMessageEntry = RuntimeMessageMessageEntry | RuntimeAttachmentEntry;
export interface CacheStats {
    totalMessages: number;
    cachedMessages: number;
    lastCacheHit: boolean;
    cacheReadTokens?: number;
}
export interface MessageHistory {
    init(systemPromptOrMessages?: string | Array<ModelInputMessage | RuntimeMessageEntry>): void;
    addUser(content: ModelMessageContent, metadata?: RuntimeMessageMetadata): void;
    addAttachment(source: SystemReminderSource, content: string): void;
    addEntries(entries: readonly RuntimeMessageEntry[]): void;
    addAssistant(content: string, toolCalls?: ToolCallInput[], reasoning?: ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo): void;
    addToolResult(toolCallId: string, toolName: string, content: ModelMessageContent, success: boolean, isError?: boolean): void;
    borrowReadOnlyRuntimeEntries(): readonly RuntimeMessageEntry[];
    toRuntimeEntries(): RuntimeMessageEntry[];
    replaceMessages(messages: readonly (ModelInputMessage | RuntimeMessageEntry)[]): void;
    getMessageCount(): number;
    getCacheStats(): CacheStats;
    setCacheHit(tokens?: number): void;
    setCacheMiss(): void;
    reset(): void;
}
export declare class MessageHistoryImpl implements MessageHistory {
    private entries;
    private cacheStats;
    init(systemPromptOrMessages?: string | Array<ModelInputMessage | RuntimeMessageEntry>): void;
    addUser(content: ModelMessageContent, metadata?: RuntimeMessageMetadata): void;
    addAttachment(source: SystemReminderSource, content: string): void;
    addEntries(entries: readonly RuntimeMessageEntry[]): void;
    addAssistant(content: string, toolCalls?: ToolCallInput[], reasoning?: ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo): void;
    addToolResult(toolCallId: string, toolName: string, content: ModelMessageContent, success: boolean, isError?: boolean): void;
    borrowReadOnlyRuntimeEntries(): readonly RuntimeMessageEntry[];
    toRuntimeEntries(): RuntimeMessageEntry[];
    replaceMessages(messages: readonly (ModelInputMessage | RuntimeMessageEntry)[]): void;
    getMessageCount(): number;
    getCacheStats(): CacheStats;
    setCacheHit(tokens?: number): void;
    setCacheMiss(): void;
    reset(): void;
}
export declare function countContextPrefixMessages(messagesOrEntries: readonly (ModelInputMessage | RuntimeMessageEntry)[]): number;
export declare function systemReminderRuntimeMetadata(source: SystemReminderSource): RuntimeMessageMetadata;
export declare function realUserRuntimeMetadata(): RuntimeMessageMetadata;
export declare function legacySyntheticRuntimeMetadata(): RuntimeMessageMetadata;
export declare function todoReminderRuntimeMetadata(): RuntimeMessageMetadata;
export declare function systemReminderAttachmentEntry(source: SystemReminderSource, content: string): RuntimeAttachmentEntry;
export declare function createRuntimeUserEntry(content: ModelMessageContent, metadata?: RuntimeMessageMetadata): RuntimeMessageMessageEntry;
export declare function createRuntimeAssistantEntry(content: string, toolCalls?: readonly ToolCallInput[], reasoning?: readonly ReasoningContentInput[], model?: Pick<Model, "providerId" | "modelId">, tokens?: TokenUsageInfo): RuntimeMessageMessageEntry;
export declare function createRuntimeToolResultEntry(toolCallId: string, toolName: string, content: ModelMessageContent, isError: boolean): RuntimeMessageMessageEntry;
export declare function isKnownSystemReminderSource(value: unknown): value is SystemReminderSource;
export declare function cloneRuntimeMessageEntry(entry: RuntimeMessageEntry): RuntimeMessageEntry;
export declare function invalidateRuntimeTokenUsage(tokens: TokenUsageInfo): TokenUsageInfo;
export declare function isRuntimeAttachmentEntry(input: ModelInputMessage | RuntimeMessageEntry): input is RuntimeAttachmentEntry;
export declare function cloneModelInputMessage(message: ModelInputMessage): ModelInputMessage;
export declare function cloneModelMessageContent(content: ModelMessageContent): ModelMessageContent;
export declare function createMessageHistory(): MessageHistory;

