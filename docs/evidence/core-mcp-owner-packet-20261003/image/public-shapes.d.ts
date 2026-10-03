// Original public port/type owner: apps/cli/packages/core/src/tool/types.ts
import type { ExecutionShellSelection, AutomationPort, OffPeakPort, EmbeddedSearchBackend, ExecutionPort, BrowserControlPort, FileSystemPort, HttpClientPort, ImageProcessorPort, PdfDocumentPort, ModelMessageContent, ModelContentProtection, Model, CoordinatorResponsePort, DynamicWorkflowRunPort, DynamicWorkflowSnippetPort, ModelCatalogPort, RiskLevel, SessionId, SessionEvent, SessionModePort, SessionStorePort, SkillPort, SkillTelemetryMetadata, SubagentRunOptions, SubagentPort, ToolArtifactStorePort, TraceContext, TraceId, TurnId, WorkflowPort, WorkflowEscalatePort, WorkflowSubmitPort } from "@knorvia/contracts";
import type { JsonSchema, ModelToolSideEffectScope, PermissionBrokerReasonSource, PermissionCapabilityGroup, PermissionRuleBehavior, PermissionRuleValue, PermissionUpdate, ProviderNativeToolSpec, ToolExecutionMode, ToolCancellationPolicy, ToolContractDeclaration, ToolResultBudgetStrategy, ToolResultDisplayPayload, ToolTimeoutPolicy, ToolExecutionSpanWriter, ToolExecutionTelemetry } from "@knorvia/contracts";
import type { PersistedReadFileStateMetadata } from "./read-file-state-metadata.js";
import type { RuntimeTaskRegistry } from "../runtime-task/registry.js";
export interface ToolMetadata {
    name: string;
    description?: string;
    modelInstructions?: readonly string[];
    allowedInPlanMode?: boolean;
    readOnly: boolean;
    destructive: boolean;
    concurrentSafe: boolean;
    requiresUserInteraction?: boolean;
    timeoutMs?: number;
    maxOutputBytes?: number;
    sideEffectScope: ModelToolSideEffectScope;
    riskLevel: RiskLevel;
    needsApproval: boolean;
    providerVisible?: boolean;
    stopTurnOnSuccess?: boolean;
    mcpPresentation?: {
        serverName: string;
        toolName: string;
        description?: string;
        official?: boolean;
    };
}
export type ToolRuntimeScope = "main" | "subagent";
export interface BackgroundTaskControlStopOptions {
    initiator?: "user" | "model";
    strict: true;
    traceContext?: TraceContext;
}
export interface BackgroundTaskControlStopResult {
    command?: string;
    ok: boolean;
    reason?: "background_task_cancel_not_supported" | "background_task_not_found" | "background_task_not_running";
    status?: string;
    taskId: string;
    type?: string;
}
export interface BackgroundTaskControlPort {
    stopBackgroundTask(taskId: string, options: BackgroundTaskControlStopOptions): Promise<BackgroundTaskControlStopResult>;
}
export interface ToolExecutionContext {
    toolCallId: string;
    telemetry?: ToolExecutionSpanWriter;
    automationTurn?: boolean;
    offPeakTurn?: boolean;
    traceContext?: TraceContext;
    traceId: TraceId;
    spanId?: string;
    parentSpanId?: string;
    abortSignal: AbortSignal;
    backgroundTaskControlPort?: BackgroundTaskControlPort;
    emitEvent?: (event: SessionEvent) => Promise<void>;
    executionPort?: ExecutionPort;
    browserControlPort?: BrowserControlPort;
    browserDocumentationRoot?: string;
    fileSystemPort?: FileSystemPort;
    httpClientPort?: HttpClientPort;
    imageProcessorPort?: ImageProcessorPort;
    pdfDocumentPort?: PdfDocumentPort;
    model?: Model;
    subagentModelOverride?: SubagentRunOptions["modelOverride"];
    skillPort?: SkillPort;
    subagentPort?: SubagentPort;
    coordinatorResponsePort?: CoordinatorResponsePort;
    workflowSubmitPort?: WorkflowSubmitPort;
    workflowEscalatePort?: WorkflowEscalatePort;
    artifactStore?: ToolArtifactStorePort;
    automationPort?: AutomationPort;
    offPeakPort?: OffPeakPort;
    sessionStore?: SessionStorePort;
    sessionModePort?: SessionModePort;
    workflowPort?: WorkflowPort;
    dynamicWorkflowRunPort?: DynamicWorkflowRunPort;
    dynamicWorkflowSnippetPort?: DynamicWorkflowSnippetPort;
    modelCatalogPort?: ModelCatalogPort;
    runtimeTaskRegistry?: RuntimeTaskRegistry;
    readFileState?: ReadFileStateMap;
    recordReadFileStateMetadata?: (metadata: PersistedReadFileStateMetadata) => void;
    recordSkillTelemetryMetadata?: (metadata: SkillTelemetryMetadata) => void;
    bashShellSelection?: ExecutionShellSelection;
    embeddedSearch?: ToolEmbeddedSearchContext;
    setWorkingDirectory?: (cwd: string) => Promise<void> | void;
    workingDirectory: string;
    workspaceRoot: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: "desktop-continuous" | "web-remote-replayable";
    deliveryKind?: "desktop-continuous" | "web-remote-replayable";
    memoryRoot?: string;
    runtimeScope?: ToolRuntimeScope;
    providerVisibleToolNames?: readonly string[];
    sessionId: SessionId;
    turnId?: TurnId;
}
export interface ToolEmbeddedSearchContext {
    backend?: EmbeddedSearchBackend;
    enabled: boolean;
    findAndGrepEnabled?: boolean;
}
export interface ReadFileStateEntry {
    path: string;
    content: string;
    offset?: number;
    limit?: number;
    isPartialView: boolean;
    readAt: Date;
    sourceTool?: "Read" | "Write" | "Edit";
    revisionId?: string;
    mtimeMs?: number;
    sizeBytes?: number;
}
export type ReadFileStateMap = Map<string, ReadFileStateEntry>;
export interface ToolHandlerFailure {
    result: false;
    errorCode: number;
    message: string;
}
export interface ToolInputValidationContext {
    runtimeTaskRegistry?: RuntimeTaskRegistry;
}
export type ToolInputValidationResult = {
    result: true;
} | ToolHandlerFailure;
export interface ToolInputResolutionContext {
    workingDirectory?: string;
    runtimeTaskRegistry?: RuntimeTaskRegistry;
    dynamicWorkflowRunPort?: DynamicWorkflowRunPort;
    modelCatalogPort?: ModelCatalogPort;
    sessionId?: string;
}
export type ToolInputResolutionResult = {
    result: true;
    input: unknown;
} | ToolHandlerFailure;
export type ToolHandler<TInput = unknown, TOutput = unknown> = (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
export interface ToolEntry extends ToolContractDeclaration {
    approvalAuthority?: "user";
    aliases?: readonly string[];
    modelContentProtection?: ModelContentProtection["kind"];
    maxModelChars?: number;
    resultArtifactContentType?: string;
    metadata: ToolMetadata;
    permissionCapabilityGroup?: PermissionCapabilityGroup;
    executionMode?: ToolExecutionMode;
    providerNative?: ProviderNativeToolSpec;
    handler: ToolHandler;
    resolveModelContract?: (context: ToolExecutionModelContext) => {
        description?: string;
        inputSchema?: JsonSchema;
    };
    validateInput?: (input: unknown, context: ToolInputValidationContext) => ToolInputValidationResult;
    resolveInput?: (input: unknown, context: ToolInputResolutionContext) => Promise<ToolInputResolutionResult> | ToolInputResolutionResult;
    formatModelContent?: (output: unknown) => ModelMessageContent;
    formatPersistedModelContent?: (input: ToolPersistedModelContentInput) => ModelMessageContent | undefined;
    resolveTimeoutBudgetMs?: (input: unknown, context?: ToolExecutionModelContext) => number | undefined;
    resolvePermissionCapability?: (input: unknown, context?: ToolRuntimePermissionCapabilityContext) => ToolRuntimePermissionCapability | undefined;
    resolvePermissionRulePolicy?: (input: unknown, context?: ToolRuntimePermissionCapabilityContext) => ToolPermissionRulePolicy | undefined;
    prepareApproval?: (input: unknown) => ToolApprovalGate;
    inputSchema: JsonSchema;
    runtimeInputSchema?: unknown;
    runtimeOutputSchema?: unknown;
    timeout: ToolTimeoutPolicy;
    cancellation: ToolCancellationPolicy;
}
export type ToolApprovalGate = {
    gate: "proceed";
} | {
    gate: "ask";
    display?: ToolResultDisplayPayload;
};
export interface ToolPermissionRulePolicy {
    evaluateRules: (behavior: PermissionRuleBehavior, rules: readonly PermissionRuleValue[]) => boolean;
    suggestedPermissionUpdates: PermissionUpdate[];
}
export interface ToolPersistedModelContentInput {
    output: unknown;
    content: string;
    persistedPath: string;
    originalBytes: number;
}
export interface ToolRuntimePermissionCapability {
    allowedInPlanMode?: boolean;
    destructive?: boolean;
    needsApproval?: boolean;
    readOnly?: boolean;
    requiresUserInteraction?: boolean;
    riskLevel?: RiskLevel;
    sideEffectScope?: ModelToolSideEffectScope;
    permission?: Partial<ToolContractDeclaration["permission"]>;
}
export interface ToolRuntimePermissionCapabilityContext {
    runtimeScope?: ToolRuntimeScope;
    workingDirectory?: string;
    workspaceRoot?: string;
}
export interface ToolExecutionModelContext {
    model?: Model;
}

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/mcp.port.ts
import type { JsonSchema } from "../model/index.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { McpServerFailureKind, OfficialMcpAuthPortFailureReason } from "@knorvia/shared";
export type McpServerTransportType = "stdio" | "http" | "sse";
export type McpProtocolVersion = "legacy" | "auto" | "2026-07-28";
export type McpServerIsolation = "session" | "workspace";
export interface McpServerRuntimeSource {
    kind: "builtin" | "plugin";
}
export interface McpServerConfigBase {
    enabled?: boolean;
    isolation?: McpServerIsolation;
    protocolVersion?: McpProtocolVersion;
    source?: McpServerRuntimeSource;
    timeoutMs?: number;
}
export interface McpClientCredentialsOAuthConfig {
    type: "client_credentials";
    clientId: string;
    clientSecret: string;
    clientName?: string;
    scope?: string;
}
export interface McpAuthorizationCodeOAuthConfig {
    type: "authorization_code";
    clientId?: string;
    clientSecret?: string;
    clientName?: string;
    redirectPath?: string;
    scope?: string;
}
export type McpOAuthConfig = McpAuthorizationCodeOAuthConfig | McpClientCredentialsOAuthConfig;
export interface KnorviaOfficialMcpAuthConfig {
    type: "knorvia_official";
    provider: "jwt_token";
}
export interface McpOfficialProvenance {
    pluginId: string;
    mcpKey: string;
    source: "plugin";
}
export interface McpStdioServerConfig extends McpServerConfigBase {
    type: "stdio";
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    auth?: KnorviaOfficialMcpAuthConfig;
    official?: McpOfficialProvenance;
}
export interface McpHttpServerConfig extends McpServerConfigBase {
    type: "http";
    url: string;
    headers?: Record<string, string>;
    oauth?: McpOAuthConfig;
    auth?: KnorviaOfficialMcpAuthConfig;
    official?: McpOfficialProvenance;
}
export interface McpSseServerConfig extends McpServerConfigBase {
    type: "sse";
    url: string;
    headers?: Record<string, string>;
    oauth?: McpOAuthConfig;
}
export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig | McpSseServerConfig;
export type McpServerStatusKind = "connecting" | "connected" | "disabled" | "disconnected" | "failed" | "untrusted";
export interface McpServerStatus {
    status: McpServerStatusKind;
    transport: McpServerTransportType;
    toolCount: number;
    updatedAt: string;
    error?: string;
    failureKind?: McpServerFailureKind;
    serverRequestId?: string;
    protocolEra?: "legacy" | "modern";
    authorization?: {
        type: "oauth_authorization_code";
        authorizationUrl: string;
        startedAt: string;
    };
}
export interface McpToolAnnotations {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
}
export interface McpToolDescriptor {
    serverName: string;
    toolName: string;
    name?: string;
    description?: string;
    timeoutMs?: number;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
    annotations?: McpToolAnnotations;
    official?: boolean;
}
export type McpContentBlock = Record<string, unknown>;
export interface McpToolCallResult {
    content: McpContentBlock[];
    structuredContent?: unknown;
    isError?: boolean;
    _meta?: Record<string, unknown>;
}
export interface McpConnectionSnapshot {
    statuses: Record<string, McpServerStatus>;
    tools: McpToolDescriptor[];
}
export interface McpConnectOptions {
    oauthAuthorizationTimeoutMs?: number;
    revalidate?: boolean;
    signal?: AbortSignal;
    trace?: TraceContext;
    workingDirectory?: string;
    workspaceIdentity?: string;
}
export interface McpCallToolRequest {
    serverName: string;
    toolName: string;
    arguments?: Record<string, unknown>;
    trace?: TraceContext;
    runtimeScope?: "main" | "subagent";
    workspacePath?: string;
    workspaceIdentity?: string;
    workspaceKey?: string;
    remoteSessionId?: string;
    clientMode?: string;
    deliveryKind?: string;
    turnId?: string;
}
export interface McpCallToolOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface McpPort {
    connectConfiguredServers(servers: Record<string, McpServerConfig>, options?: McpConnectOptions): Promise<McpConnectionSnapshot>;
    connectServer(name: string, config: McpServerConfig, options?: McpConnectOptions): Promise<McpServerStatus>;
    disconnectServer(name: string): Promise<McpServerStatus | undefined>;
    pingServer?(name: string, options?: {
        timeoutMs?: number;
    }): Promise<boolean>;
    status(): Promise<Record<string, McpServerStatus>>;
    listTools(): Promise<McpToolDescriptor[]>;
    callTool(request: McpCallToolRequest, options?: McpCallToolOptions): Promise<McpToolCallResult>;
    close(): Promise<void>;
}

// Original public port/type owner: apps/cli/packages/contracts/src/model/index.ts
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import type { ProviderNativeToolSpec, ToolExecutionMode, ToolPermissionSpec, ToolResultBudget } from "../tools/contract.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { ModelApiCallObservation, ModelApiErrorPhase, ResolvedModelApiCallObservation } from "../telemetry/index.js";
export type JsonSchema = Record<string, unknown>;
export type ModelToolSideEffectScope = "none" | "workspace" | "git" | "network" | "system" | "session" | "userInteraction";

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/permission.port.ts
import type { PermissionDecision } from "../events/session.events.js";
import type { ModelToolSideEffectScope } from "../model/index.js";
import type { CollaborationMode, RiskLevel } from "./session.port.js";
import type { InteractionRequestOrigin, SessionId, ToolCallId, TraceId, TurnId } from "./shared.js";
export declare const PermissionCapabilityGroup: {
    readonly OfficialCua: "official_cua";
};
export type PermissionCapabilityGroup = (typeof PermissionCapabilityGroup)[keyof typeof PermissionCapabilityGroup];

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/session.port.ts
import type { RuntimeInputPresentation } from "./runtime-input-presentation.js";
import type { ErrorAttribution, SessionEvent } from "../events/session.events.js";
import type { InteractionRequestOrigin, MessageId, QueryId, SessionId, TurnId, TraceId } from "./shared.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { CompactProjectionInfo } from "../compact/index.js";
import type { CheckpointProjectionInfo, RewindProjectionInfo } from "../rewind/index.js";
import type { StreamRecoveryAnchorProjectionInfo, StreamingToolLedgerProjectionInfo } from "../events/stream-recovery.events.js";
import type { SessionGoal } from "../tools/target.js";
import type { GoalCompletionVerificationOutput } from "../tools/target.js";
import type { PermissionOptionsPolicy, PermissionUpdate } from "./permission.port.js";
import type { ToolResultDisplayPayload } from "../tools/tool-result-metadata.js";
import type { ModelSelection } from "../model/model.js";
export type RiskLevel = "low" | "medium" | "high" | "critical";

// Original public port/type owner: apps/cli/packages/contracts/src/tracing/tracer.ts
import type { QueryId, SessionId, TraceId, TurnId } from "../interfaces/shared.js";
import type { Logger, LogContext } from "../logging/logger.js";
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

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/tool-artifact-store.port.ts
import type { SessionId, ToolCallId, TurnId } from "./shared.js";
import type { TraceContext } from "../tracing/tracer.js";
export type ToolArtifactRetention = "session" | "project" | "temporary";
export interface ToolArtifactWriteRequest {
    sessionId: SessionId;
    turnId?: TurnId;
    toolCallId: ToolCallId | string;
    toolName: string;
    content: string;
    contentType?: string;
    retention?: ToolArtifactRetention;
    trace?: TraceContext;
}
export interface ToolBinaryArtifactWriteRequest {
    sessionId: SessionId;
    turnId?: TurnId;
    toolCallId: ToolCallId | string;
    toolName: string;
    content: Uint8Array;
    contentType: string;
    extension?: string;
    retention?: ToolArtifactRetention;
    trace?: TraceContext;
}
export interface ToolArtifactWriteResult {
    id: string;
    uri: string;
    path?: string;
    bytes: number;
    contentType: string;
    createdAt: Date;
}
export interface ToolArtifactReadRequest {
    uri: string;
    trace?: TraceContext;
}
export interface ToolArtifactReadResult {
    uri: string;
    content: string;
    contentType: string;
    bytes: number;
    path?: string;
}
export interface ToolBinaryArtifactReadResult {
    uri: string;
    bytes: Uint8Array;
    contentType: string;
    path?: string;
}
export interface ToolArtifactStatRequest {
    uri: string;
    trace?: TraceContext;
}
export interface ToolArtifactStatResult {
    uri: string;
    bytes: number;
    contentType: string;
    path?: string;
    mtimeMs?: number;
}
export interface ImageAttachmentPathPrimeRequest {
    uri: string;
    bytes: Uint8Array;
    mediaType: string;
}
export interface MediaAttachmentPathPrimeRequest {
    uri: string;
    bytes: Uint8Array;
    mediaType: string;
}
export interface MediaAttachmentPathEnsureRequest {
    uri: string;
    mediaType: string;
}
export type MediaAttachmentPathResult = {
    status: "ready";
    path: string;
} | {
    status: "unsupported";
};
export interface ToolArtifactStorePort {
    writeToolResultArtifact(request: ToolArtifactWriteRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolArtifactWriteResult>;
    writeToolResultBinaryArtifact?(request: ToolBinaryArtifactWriteRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolArtifactWriteResult>;
    readToolResultArtifact(request: ToolArtifactReadRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolArtifactReadResult>;
    readToolResultBinaryArtifact?(request: ToolArtifactReadRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolBinaryArtifactReadResult>;
    statToolResultArtifact?(request: ToolArtifactStatRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ToolArtifactStatResult>;
    primeImageAttachmentPath?(request: ImageAttachmentPathPrimeRequest): Promise<MediaAttachmentPathResult>;
    primeMediaAttachmentPath?(request: MediaAttachmentPathPrimeRequest): Promise<MediaAttachmentPathResult>;
    ensureMediaAttachmentPath?(request: MediaAttachmentPathEnsureRequest): Promise<MediaAttachmentPathResult>;
}

// Original public port/type owner: apps/cli/packages/contracts/src/interfaces/image-processor.port.ts
import type { TraceContext } from "../tracing/tracer.js";
export interface ImageResizeRequest {
    data: Uint8Array;
    mediaType: string;
    maxDimension: number;
    trace?: TraceContext;
}
export interface ImageResizeResult {
    data: Uint8Array;
    mediaType: string;
    originalWidth?: number;
    originalHeight?: number;
    width?: number;
    height?: number;
    resized: boolean;
}
export type ImageCompressionStrategy = "original" | "preserve-format" | "png-optimized" | "png-quantized" | "resized" | "jpeg-quality" | "jpeg-fallback";
export interface ImagePrepareForModelRequest extends ImageResizeRequest {
    maxBase64Bytes: number;
    maxRawBytes: number;
    maxTokens?: number;
    tokenToBase64CharRatio?: number;
}
export interface ImagePrepareForModelResult extends ImageResizeResult {
    compressed: boolean;
    originalSizeBytes: number;
    strategy: ImageCompressionStrategy;
    transformedSizeBytes: number;
}
export interface ImageProcessorPort {
    resizeToFit(request: ImageResizeRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ImageResizeResult>;
    prepareForModel(request: ImagePrepareForModelRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ImagePrepareForModelResult>;
}
