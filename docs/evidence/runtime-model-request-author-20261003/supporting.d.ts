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
