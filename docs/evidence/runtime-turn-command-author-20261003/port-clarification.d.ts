export type ModelSelection = z.infer<typeof modelSelectionSchema>;
export type ModelPropertiesData = z.infer<typeof completeModelPropertiesDataSchema>;
export type LocalTtftDetail = z.infer<typeof localTtftDetailSchema>;
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
export interface TurnInputIntentMetadata {
    planEnabled?: boolean;
    sourceCommandId: string;
    queueItemId: string;
    clientId: string;
    kind: TurnSteerCommandKind;
    text?: string;
    modelSelection?: ModelSelection;
    mode?: "build" | "edit" | "plan" | "yolo";
    admissionSeq: number;
    admittedAt: number;
    requestedDelivery: "auto" | "startNow" | "queue" | "guide";
    admittedDelivery: "startNow" | "queue" | "guide";
    queuePosition?: number;
    fallbackReasonCode?: string;
    attachmentRefs?: Array<{
        ref: string;
        fileName: string;
        mime: string;
        bytes: number;
        previewRef?: string;
    }>;
    sharedContextRefs?: Array<{
        kind: "shared_context_import";
        context_id: string;
    }>;
    provenance?: {
        sourceCommandId: string;
        queueItemId?: string;
        clientId?: string;
    };
}
export interface CoreError extends Error {
    type: CoreErrorType;
    code: string;
    message: string;
    cause?: Error;
    context?: Record<string, unknown>;
    recoverable: boolean;
    retryable: boolean;
    timestamp: Date;
}
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
export interface AgentRuntimeConfig {
    clientMode?: "desktop-continuous" | "web-remote-replayable";
    deliveryKind?: "desktop-continuous" | "web-remote-replayable";
    remoteSessionId?: string;
    bashTimeoutPolicy?: BashTimeoutPolicy;
    presentationSurface?: PresentationSurface;
    mode?: CollaborationMode;
    planEnabled?: boolean;
    modelStreaming?: "off" | "on";
    streamingToolExecution?: "off" | "readOnly";
    modelContextBudgetStrategy?: "legacy" | "preflight-v1";
    maxTurns?: number;
    permissionTimeoutMs?: number;
    compact?: AutoCompactPolicyConfig;
    targetCompletionVerification?: {
        enabled?: boolean;
    };
    midConversationSystem?: {
        mode?: "auto" | "force";
    };
    subagents?: {
        enabled?: boolean;
        inactivityTimeoutMs?: number;
        autoBackgroundMs?: number;
        backgroundBashMaxMs?: number;
        maxTurns?: number;
        outputRootDir?: string;
        profiles?: readonly AgentProfile[];
        builtInModelSelectionOverrides?: Partial<Record<"general-purpose" | "Explore", ModelSelection>>;
    };
    toolAllowlist?: readonly string[];
    toolDisallowlist?: readonly string[];
    toolset?: "main" | "explore";
    toolConcurrency?: {
        maxConcurrency?: number;
    };
    runtimeFeatures?: {
        nodeRepl?: boolean;
        browserUse?: boolean;
        computerUse?: boolean;
        browserDocumentationRoot?: string;
    };
    modelAnomalyGuard?: Partial<ModelAnomalyGuardConfig>;
    mcp?: {
        enabled?: boolean;
        servers?: Record<string, McpServerConfig>;
        trustedOfficialCuaServerNames?: readonly string[];
        trustedWindowsComputerUseServerNames?: readonly string[];
    };
    pluginReferenceCatalog?: PluginReferenceCatalog;
    hooks?: HooksRuntimeConfig;
    bashShellSelection?: ExecutionShellSelection | undefined;
    embeddedSearchBackend?: EmbeddedSearchBackend;
    nativeSearchEnhancementsEnabled?: boolean;
    memory?: MemoryRuntimeConfig;
    modelSelection?: ModelSelection;
    titleGeneration?: {
        enabled?: boolean;
        modelSelection?: ModelSelection;
        timeoutMs?: number;
    };
    parentSessionId?: SessionId;
    taskType?: SessionTaskType;
    dynamicWorkflowEnabled?: boolean;
    systemPrompt?: string;
    workflowActor?: {
        name?: string;
        persona?: string;
    };
    subagentContext?: {
        agentPrompt: string;
        userInstructions?: ResolvedUserInstructions;
    };
    language?: string;
    outputStyle?: OutputStylePromptConfig;
    agentName?: string;
    workingDirectory?: string;
    workspacePath?: string;
    workspaceIdentity?: WorkspaceId;
    envInfo?: EnvInfo;
    currentDate?: string;
    userInstructions?: UserInstructionsOptions;
    projectContext?: ProjectContext;
    skillMetadataBudget?: number;
}
export interface TurnResult {
    response: string;
    turnId: TurnId;
    traceId: TraceId;
    usage?: ModelUsageSummary;
    events: SessionEvent[];
    projection: SessionProjection;
}
export type ExecuteTurnOptions = ExecuteTurnOptionsBase & import("@knorvia/contracts").TurnBackgroundAttribution;
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
export interface ActiveTurnStartReservation {
    kind: ActiveTurnKind;
    traceContext: TraceContext;
    turnId: TurnId;
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

