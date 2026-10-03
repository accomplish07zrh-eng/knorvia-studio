import type { RuntimeInputPresentation } from "@knorvia/contracts";
import { PermissionService, ToolScheduler } from "./deps.js";
import type { JsonSchema, AgentExecutionTelemetryPort, AgentTelemetryCausation, BackgroundResultOriginMeta, ContextUsageBreakdownItem, CoordinatorResponsePort, ForkCommitBundle, ForkChildSessionMetadata, ModelRequestAuth, ModelRequestDependencies, ModelSelection, PluginReferenceCatalog, ResolvedUserInstructions, StableForkGoalBoundaryMetadata, StableForkTargetMetadata, WorkspaceHookBundleSnapshot, WorkspaceId, } from "@knorvia/contracts";
import type { KnorviaProviderAccountAccess } from "@knorvia/shared";
import type { EffectiveModelSelectionResult } from "@knorvia/shared/model-selection";
import type { RuntimeMessageEntry } from "../agent/message-history.js";
import type { CompactPhase, CompactReason, CompactTrigger, CollaborationMode, EmbeddedSearchBackend, Logger, AttachmentStorageMetadata, MessageId, MessageVisibility, FilePartSource, ModelRequestAdmission, Model, ModelNetworkStatusEvent, ModelMessageContentBlock, ModelReasoningContentBlock, ModelStreamRecoveryStatus, ModelToolCall, ModelToolContract, ModelUsage, ModelUsageSummary, ModelInputMessage, MessageWithParts, PendingTurnInput, TurnInputIntentMetadata, TurnSteerResult, PartId, PermissionBrokerPort, PermissionUpdate, QueryId, RewindScope, RewindStrategy, SessionEvent, SessionEventSink, SessionEventStorePort, SessionId, SessionTaskType, SessionMailboxPort, SessionProjection, SessionStorePort, ContextSourcePort, DynamicWorkflowRunPort, DynamicWorkflowSnippetPort, ModelCatalogPort, ExecutionPort, BrowserControlPort, ExecutionShellSelection, AutomationPort, OffPeakPort, FileSystemPort, HttpClientPort, ImageProcessorPort, PdfDocumentPort, HooksRuntimeConfig, SkillPort, McpPort, McpServerConfig, SubagentPort, ToolArtifactStorePort, ToolCallId, WorkflowPort, WorkflowEscalatePort, WorkflowSubmitPort, TraceContext, TraceId, TurnId, CheckpointCreatedPayload, RewindTargetEvaluation, SessionHistoryHydrationResult, SyntheticUserMessageSource, HookRunner, ToolExecutionResult, ToolExecutor, ToolRegistry, ContextBuilder, EnvInfo, ProjectContext, UserInstructionsOptions, AutoCompactPolicyConfig, ModelAnomalyGuardConfig, OutputStylePromptConfig, } from "./deps.js";
import type { AgentProfile } from "../subagent/profile.js";
import type { RuntimeTaskRegistry } from "../runtime-task/registry.js";
import type { BashTimeoutPolicy } from "../tool/bash-timeout-policy.js";
import type { PresentationSurface } from "../context/types.js";
import type { WorkspaceHookRuntimeAdmissionPort } from "../hooks/workspace-hook-runtime-admission.js";
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
export interface StreamedToolExecutionResult {
    input: Record<string, unknown>;
    ledgerRecorded?: boolean;
    partID: PartId;
    result: ToolExecutionResult;
    toolCallId: ToolCallId;
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
import type { CompactPhase, CompactReason, MessageId, ModelStreamRecoveryStatus, Model, OutputStylePromptConfig, SessionEvent, TraceContext, TraceId, TurnId, } from "../deps.js";
import type { ActiveTurnSteeringState } from "../types.js";
import type { SubagentRunOptions } from "@knorvia/contracts";
import type { DrainedPendingInputDiagnostics } from "../types.js";
import type { TurnMachineImpl } from "../deps.js";
import type { RuntimeMessageEntry } from "../../agent/message-history.js";
export interface CompactLoopTracking {
    consecutiveRapidRefills: number;
    toolTurnsSinceCompact: number;
}
export interface RapidRefillDecision {
    consecutiveRapidRefills: number;
    shouldBlock: boolean;
    toolTurnsSinceCompact: number;
}
export interface AutoCompactLoopContext {
    compactReason: CompactReason;
    modelStepIndex: number;
    phase: CompactPhase;
    rapidRefill: RapidRefillDecision;
    model: Model;
    turnRequestState: TurnRequestState;
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
