// Selected original public type closure; no implementation.
// Original type owner: apps/cli/packages/contracts/src/model/model.ts
import type { JsonSchema, ModelInputMessage, ModelId, ModelProviderId, ModelStreamEvent, ModelTextResult, ModelToolContract } from "./index.js";
import { type ModelSelection } from "@knorvia/shared/model-selection";
import type { ModelPropertiesData, ModelOptionSpecsData } from "@knorvia/shared/model-config";
export type ModelOptionSpecs = ModelOptionSpecsData;
export type ModelProperties = ModelPropertiesData;
export interface ModelOptions {
    reasoningLevel?: string;
    maxOutputTokens?: number;
}
export interface ModelRequest {
    messages: ModelInputMessage[];
    tools?: ModelToolContract[];
    responseJsonSchema?: JsonSchema;
    options?: ModelOptions;
    abortSignal?: AbortSignal;
}
export type ModelResult = ModelTextResult;
export type ModelEvent = ModelStreamEvent;
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
// Original type owner: apps/cli/packages/contracts/src/model/index.ts
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import type { ProviderNativeToolSpec, ToolExecutionMode, ToolPermissionSpec, ToolResultBudget } from "../tools/contract.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { ModelApiCallObservation, ModelApiErrorPhase, ResolvedModelApiCallObservation } from "../telemetry/index.js";
export type JsonSchema = Record<string, unknown>;
export type ModelProviderId = string & {
    readonly __brand: "ModelProviderId";
};
export type ModelId = string & {
    readonly __brand: "ModelId";
};
export type ModelMessageRole = "system" | "user" | "assistant" | "tool";
export interface ModelToolCall {
    id: string;
    name: string;
    input: unknown;
    providerExecuted?: boolean;
}
export type AttachmentKind = "local_file" | "resource" | "inline";
export interface AttachmentRef {
    id: string;
    kind: AttachmentKind;
    uri?: string;
    path?: string;
    mimeType?: string;
    sizeBytes?: number;
    sha256?: string;
    placeholder?: string;
}
export interface ModelTextContentBlock {
    type: "text";
    text: string;
}
export interface ModelReasoningContentBlock {
    type: "reasoning";
    text: string;
    providerOptions?: Record<string, unknown>;
}
export interface ModelImageContentBlock {
    type: "image";
    mediaType: string;
    dataUrl: string;
    detail?: "auto" | "low" | "high" | "original";
    source?: AttachmentRef;
}
export interface ModelFileContentBlock {
    type: "file";
    mediaType: string;
    name?: string;
    uri?: string;
    dataUrl?: string;
    text?: string;
    source?: AttachmentRef;
}
export interface ModelVideoContentBlock {
    type: "video";
    mediaType: string;
    dataUrl: string;
    source?: AttachmentRef;
}
export interface ModelResourceLinkContentBlock {
    type: "resource_link";
    uri: string;
    name?: string;
    title?: string;
}
export type ModelMessageContentBlock = ModelTextContentBlock | ModelReasoningContentBlock | ModelImageContentBlock | ModelVideoContentBlock | ModelFileContentBlock | ModelResourceLinkContentBlock;
export type ModelMessageContent = string | ModelMessageContentBlock[];
export interface ModelCacheControl {
    type: "ephemeral";
    ttl?: "5m" | "1h";
    scope?: "global" | "org";
}
export interface ModelInputMessage {
    role: ModelMessageRole;
    content: ModelMessageContent;
    cacheControl?: ModelCacheControl;
    toolCalls?: ModelToolCall[];
    toolCallId?: string;
    toolName?: string;
    isError?: boolean;
    providerId?: ModelProviderId;
    modelId?: ModelId;
}
export interface ModelToolExecutionContext {
    toolCallId: string;
    abortSignal?: AbortSignal;
    traceId?: string;
    metadata?: Record<string, unknown>;
}
export type ModelToolSideEffectScope = "none" | "workspace" | "git" | "network" | "system" | "session" | "userInteraction";
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
// Original type owner: apps/cli/packages/core/src/tool/types.ts
import type { ExecutionShellSelection, AutomationPort, OffPeakPort, EmbeddedSearchBackend, ExecutionPort, BrowserControlPort, FileSystemPort, HttpClientPort, ImageProcessorPort, PdfDocumentPort, ModelMessageContent, ModelContentProtection, Model, CoordinatorResponsePort, DynamicWorkflowRunPort, DynamicWorkflowSnippetPort, ModelCatalogPort, RiskLevel, SessionId, SessionEvent, SessionModePort, SessionStorePort, SkillPort, SkillTelemetryMetadata, SubagentRunOptions, SubagentPort, ToolArtifactStorePort, TraceContext, TraceId, TurnId, WorkflowPort, WorkflowEscalatePort, WorkflowSubmitPort } from "@knorvia/contracts";
import type { JsonSchema, ModelToolSideEffectScope, PermissionBrokerReasonSource, PermissionCapabilityGroup, PermissionRuleBehavior, PermissionRuleValue, PermissionUpdate, ProviderNativeToolSpec, ToolExecutionMode, ToolCancellationPolicy, ToolContractDeclaration, ToolResultBudgetStrategy, ToolResultDisplayPayload, ToolTimeoutPolicy, ToolExecutionSpanWriter, ToolExecutionTelemetry } from "@knorvia/contracts";
import type { PersistedReadFileStateMetadata } from "./read-file-state-metadata.js";
import type { RuntimeTaskRegistry } from "../runtime-task/registry.js";
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
export interface ToolExecutionFollowUpUserInput {
    input: string;
    reasonSource: PermissionBrokerReasonSource;
}
export interface ToolExecutionTurnControl {
    reason: "automation_create_limit" | "plan_exit_denied" | "subagent_terminal";
    stopTurnAfterResult: boolean;
}
export interface ToolResultSerialization {
    content: string;
    modelContent?: ModelMessageContent;
    originalBytes: number;
    returnedBytes: number;
    truncated: boolean;
    budgetStrategy: ToolResultBudgetStrategy;
    artifactPath?: string;
}
export interface ExecutableToolCall {
    id: string;
    name: string;
    input: unknown;
}
