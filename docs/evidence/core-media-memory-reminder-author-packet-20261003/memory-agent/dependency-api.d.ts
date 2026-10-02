// Body-free collaborator/type fragments; original module ownership, not standalone compilation.
export declare const createRuntimeModel: typeof import("../methods/runtime-model.js").createRuntimeModel;
export declare const withModelInvocationContext: typeof import("../methods/runtime-model.js").withModelInvocationContext;
export declare const createRefreshRuntimeHeadersBeforeModelAttempt: typeof import("../methods/model-runtime-headers.js").createRefreshRuntimeHeadersBeforeModelAttempt;
export declare const getSessionShellSelectionFromConfig: typeof import("../methods/session-shell-environment.js").getSessionShellSelectionFromConfig;
export declare const createToolExecutor: typeof import("../deps.js").createToolExecutor;
export declare const PermissionService: typeof import("../deps.js").PermissionService;
export declare const createDenyPermissionBroker: typeof import("../deps.js").createDenyPermissionBroker;
export declare const defaultPermissionConfig: typeof import("../deps.js").defaultPermissionConfig;
export declare const traceContextToLogContext: typeof import("../deps.js").traceContextToLogContext;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/runtime-provider-request-messages.ts
export declare function buildRuntimeProviderRequestMessages(runtime: {
    readonly config: Pick<AgentRuntimeConfig, "midConversationSystem">;
}, input: {
    entries: readonly RuntimeMessageEntry[];
    applyCacheControl?: boolean;
    model: Model;
}): ProviderRequestMessageProjectionResult;
// Original type owner: apps/cli/packages/core/src/tool/executor/types.ts
export interface ToolExecutorOptions {
    agentTelemetry?: AgentExecutionTelemetryPort;
    agentTelemetryActorKind?: AgentTelemetryActorKind;
    registry: ToolRegistry;
    permissionService: PermissionService;
    permissionBroker?: PermissionBrokerPort;
    emitEvent: (event: SessionEvent) => Promise<void>;
    enqueueBackgroundTaskNotification?: EnqueueBackgroundTaskNotification;
    shouldEnqueueBackgroundTaskNotification?: ShouldEnqueueBackgroundTaskNotification;
    sessionId: SessionId;
    turnId?: TurnId;
    defaultTimeoutMs?: number;
    permissionTimeoutMs?: number;
    logger?: Logger;
    backgroundTaskControlPort?: BackgroundTaskControlPort;
    executionPort?: ExecutionPort;
    browserControlPort?: BrowserControlPort;
    browserDocumentationRoot?: string;
    fileSystemPort?: FileSystemPort;
    httpClientPort?: HttpClientPort;
    imageProcessorPort?: ImageProcessorPort;
    pdfDocumentPort?: PdfDocumentPort;
    model?: Model;
    embeddedSearchBackend?: EmbeddedSearchBackend;
    nativeSearchEnhancementsEnabled?: boolean;
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
    subagentBackgroundBashMaxMs?: number;
    bashShellSelection?: ExecutionShellSelection;
    getBashShellSelection?: () => ExecutionShellSelection | undefined;
    workingDirectory?: string;
    workspaceRoot?: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode?: "desktop-continuous" | "web-remote-replayable";
    deliveryKind?: "desktop-continuous" | "web-remote-replayable";
    runtimeScope?: ToolRuntimeScope;
    getWorkingDirectory?: () => string;
    setWorkingDirectory?: (cwd: string) => Promise<void> | void;
    getWorkspaceRoot?: () => string;
    getMemoryRoot?: () => string | undefined;
    traceContext?: TraceContext;
    mode?: CollaborationMode;
    getMode?: () => CollaborationMode;
    maxConcurrency?: number;
    hookRunner?: HookRunner;
}
export interface ToolExecutor {
    execute(toolCall: ExecutableToolCall, options?: ToolExecuteOptions): Promise<ToolExecutionResult>;
    executeBatch(toolCalls: ExecutableToolCall[], options?: ToolBatchExecuteOptions): Promise<ToolExecutionResult[]>;
    executeSchedule(toolCalls: ExecutableToolCall[], schedule: ToolSchedule, options?: ToolBatchExecuteOptions): AsyncGenerator<ToolBatchEvent, ToolExecutionResult[], void>;
    trackExternalBackgroundTask(toolCall: ExecutableToolCall, output: Record<string, unknown>, traceContext: TraceContext, turnId?: TurnId): Promise<void>;
}
export interface ToolExecuteOptions {
    automationTurn?: boolean;
    offPeakTurn?: boolean;
    signal?: AbortSignal;
    traceContext?: TraceContext;
    subagentModelOverride?: SubagentRunOptions["modelOverride"];
    model?: Model;
}
// Original type owner: apps/cli/packages/core/src/tool/types.ts
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
