export type AgentErrorCode = (typeof AgentErrorCode)[keyof typeof AgentErrorCode];
export type CoreErrorType = (typeof CoreErrorType)[keyof typeof CoreErrorType];
export type SessionEventType = (typeof SessionEventType)[keyof typeof SessionEventType];
export interface AgentBackgroundedOutput {
    status: "async_launched";
    isAsync: true;
    agentId: string;
    agentType: AgentType;
    description: string;
    prompt: string;
    childSessionId: string;
    backgroundTaskId: string;
    outputFile: string;
    canReadOutputFile: boolean;
}
export interface BackgroundResultOriginMeta {
    backgroundSource: "bash" | "subagent" | "workflow";
    workId: string;
    title: string;
    workflowNotification?: WorkflowNotificationMeta;
}
export interface AgentCompletedOutput {
    status: "completed";
    agentId: string;
    agentType: AgentType;
    description: string;
    prompt: string;
    content: AgentTextContentBlock[];
    totalToolUseCount: number;
    totalDurationMs: number;
    totalTokens?: number;
    usage?: ModelUsage;
}
export type AgentOutput = AgentCompletedOutput | AgentBackgroundedOutput;
export interface Logger {
    debug(message: string, context?: LogContext): void;
    info(message: string, context?: LogContext): void;
    warn(message: string, context?: LogContext): void;
    error(message: string, error?: Error, context?: LogContext): void;
    child(context: LogContext): Logger;
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
export type SessionId = string & {
    readonly __brand: "SessionId";
};
export type SubagentLaunchOptions = SubagentRunOptions;
export interface SubagentLaunchRequest extends SubagentRunRequest {
    runInBackground?: boolean;
}
export interface SubagentPort {
    launch(request: SubagentLaunchRequest, options?: SubagentLaunchOptions): Promise<AgentOutput>;
    run(request: SubagentRunRequest, options?: SubagentRunOptions): Promise<AgentOutput>;
    start?(request: SubagentStartRequest, options?: SubagentStartOptions): Promise<AgentBackgroundedOutput>;
    backgroundTask?(taskId: string): Promise<SubagentTaskSnapshot | undefined>;
    getTask?(taskId: string): Promise<SubagentTaskSnapshot | undefined>;
    waitForTask?(taskId: string, options?: SubagentWaitOptions): Promise<SubagentTaskSnapshot | undefined>;
    stopTask?(taskId: string, options?: SubagentStopOptions): Promise<SubagentTaskSnapshot | undefined>;
    sendMessage?(request: SubagentSendMessageRequest, options?: SubagentSendMessageOptions): Promise<SubagentSendMessageResult>;
}
export interface SubagentRunOptions {
    signal?: AbortSignal;
    model?: Model;
    modelOverride?: {
        selection: ModelSelection;
        requestDependencies?: ModelRequestDependencies;
        background: "deny";
    };
}
export interface SubagentRunRequest {
    sessionId: SessionId;
    turnId?: TurnId;
    parentToolCallId: ToolCallId | string;
    agentType: string;
    description: string;
    prompt: string;
    callerCanReadOutputFile?: boolean;
    workingDirectory: string;
    workspaceRoot: string;
    trace: TraceContext;
}
export interface SubagentSendMessageOptions {
    signal?: AbortSignal;
}
export interface SubagentSendMessageRequest {
    sessionId: SessionId;
    turnId?: TurnId;
    parentToolCallId: ToolCallId | string;
    to: string;
    summary: string;
    message: string;
    workingDirectory: string;
    workspaceRoot: string;
    trace: TraceContext;
}
export interface SubagentSendMessageResult {
    status: "success" | "failed";
    messageId: string;
    delivery?: SubagentSendMessageDelivery;
    message?: string;
    error?: string;
    agentId?: string;
    taskId?: string;
    outputFile?: string;
}
export interface SubagentStartOptions {
    signal?: AbortSignal;
    model?: Model;
}
export type SubagentStartRequest = SubagentRunRequest;
export interface SubagentStopOptions {
    signal?: AbortSignal;
}
export interface SubagentTaskSnapshot {
    taskId: string;
    agentId: string;
    agentType: string;
    description: string;
    status: SubagentTaskStatus;
    startedAt: Date;
    completedAt?: Date;
    childSessionId?: SessionId;
    parentToolCallId?: ToolCallId | string;
    pid?: number;
    error?: string;
    output?: AgentOutput;
    outputFile?: string;
    notified?: boolean;
}
export interface SubagentWaitOptions {
    signal?: AbortSignal;
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
export interface AgentProfile {
    background?: boolean;
    color?: "red" | "blue" | "green" | "yellow" | "purple" | "orange" | "pink" | "cyan";
    description: string;
    disallowedTools?: readonly string[];
    injectAgentsMd?: boolean;
    maxTurns?: number;
    mcpServers?: readonly string[];
    memory?: AgentMemoryScope;
    modelSelection?: ModelSelection;
    name: string;
    path?: string;
    permissionMode?: AgentPermissionMode;
    skills?: readonly string[];
    source: AgentProfileSource;
    systemPrompt: string;
    tools?: readonly string[];
}
export type ErrorPayloadRole = (typeof ErrorPayloadRole)[keyof typeof ErrorPayloadRole];
export interface RuntimeTaskMessageSink {
    send(message: RuntimeTaskPendingMessage): Promise<"queued" | "steered">;
}
export interface RuntimeTaskPendingMessage {
    id: string;
    isMeta?: boolean;
    message: string;
    origin?: {
        kind: "coordinator";
        toolCallId?: string;
    };
    queuedAt: Date;
    summary?: string;
    traceContext?: TraceContext;
}
export interface RuntimeTaskRegistry {
    all(): Record<string, RuntimeTaskSnapshot>;
    get(id: string): RuntimeTaskSnapshot | undefined;
    drainMessages(id: string): RuntimeTaskPendingMessage[];
    queueMessage(id: string, message: RuntimeTaskPendingMessage): RuntimeTaskSnapshot | undefined;
    register(task: RuntimeTaskSnapshot): void;
    remove(id: string): void;
    requestBackground(id: string): boolean;
    setActiveBranchGeneration?(generation: number): void;
    update(id: string, patcher: (task: RuntimeTaskSnapshot) => RuntimeTaskSnapshot): RuntimeTaskSnapshot | undefined;
    waitForBackgroundRequest(id: string, options?: {
        signal?: AbortSignal;
    }): Promise<RuntimeTaskSnapshot | undefined>;
    waitForTerminal(id: string, options?: {
        signal?: AbortSignal;
    }): Promise<RuntimeTaskSnapshot | undefined>;
}
export interface RuntimeTaskSnapshot extends SubagentTaskSnapshot {
    branchGeneration?: number;
    exitCode?: number;
    type: RuntimeTaskType;
    isBackgrounded?: boolean;
    messageSink?: RuntimeTaskMessageSink;
    output?: AgentOutput;
    parentSessionId?: SessionId;
    pendingMessages?: RuntimeTaskPendingMessage[];
    prompt?: string;
    resultText?: string;
    stopInitiator?: "user" | "model";
    taskType?: RuntimeTaskType;
    traceContext?: TraceContext;
    turnId?: TurnId;
    usage?: RuntimeTaskUsageSnapshot;
}
