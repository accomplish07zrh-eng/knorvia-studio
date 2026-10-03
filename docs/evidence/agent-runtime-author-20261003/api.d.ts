import type { BackgroundBashOutputResult } from "@knorvia/shared";
import type {
  CollaborationMode,
  BackgroundTaskCancelResult,
  SessionEvent,
  MessageId,
  Model,
  ModelSelection,
  ModelSelectionOrigin,
  PermissionBrokerRequest,
  ProjectId,
  SessionEventSink,
  SessionEventStorePort,
  SessionId,
  SessionProjection,
  SessionGoal,
  SavedWorkflowScope,
  TargetChangedPayload,
  DynamicWorkflowRunProgressPayload,
  UserInputAutoResolutionUpdatedPayload,
  SkillLoadOutcome,
  ToolCallId,
  TraceContext,
  TurnSteerInput,
  TurnInputIntentMetadata,
  TurnSteerResult,
  ToolCall,
  TurnState,
  ToolSchedule,
  ToolExecutor,
  ToolRegistry,
  ContextBuilder,
  ExecutionShellSelection,
  TurnId,
} from "./deps.js";
import type { StartSavedWorkflowRunResult } from "./methods/dynamic-workflow-run-start.js";
import type {
  AmendWorkflowRunSettingsInput,
  AmendWorkflowRunSettingsResult,
} from "./methods/dynamic-workflow-run-settings.js";
import type {
  ModelConnectivityTestInput,
  WorkspaceGenerateTextInput,
  WorkspaceGenerateTextResult,
} from "./methods/workspace-generate-text.js";
import type {
  RuntimeBackgroundStopOptions,
  RuntimeBackgroundStopResult,
} from "./methods/background.js";
import type {
  ActiveTurnInfo,
  AcquireForegroundPromotionLeaseResult,
  AgentRuntimeConfig,
  AgentRuntimeDeps,
  ContinueActiveTargetLoopOptions,
  ConversationBeforeInputForkOptions,
  ConversationRewindResult,
  ExecuteToolsOptions,
  ExecuteToolsResult,
  ExecuteTurnOptions,
  PromptAdmissionOptions,
  PromptAdmissionReceipt,
  ForegroundPromotionLeaseMode,
  PermissionDecisionResult,
  ResumeSessionOptions,
  ResumeSessionResult,
  SelectionSideChatCreateOptions,
  StableConversationForkOptions,
  StopActiveForegroundExecutionOptions,
  StopActiveForegroundExecutionResult,
  TurnResult,
  WorkspaceCheckpointSummary,
  WorkspaceFileRewindApplyResult,
  WorkspaceFileRewindPreview,
  WorkspaceForkResult,
} from "./types.js";
import type { ChildClientPortsContext, ClientFacingPorts } from "./helpers/child-client-ports.js";
export declare class AgentRuntime {
  private sessionId;
  private turnNumber;
  private config;
  private appVersion;
  private permissionService;
  private permissionBroker;
  private toolScheduler;
  private eventReducer;
  private eventStore;
  private rootTraceContext;
  private logger?;
  private eventSinks;
  private now;
  private isRemoteWorkspace;
  private registry;
  private executor;
  private hookRunner?;
  private workspaceHookAdmission?;
  private modelFactory;
  private modelIoDir?;
  private providerRuntimeHeadersPort?;
  private browserControlPort?;

  private modelRequestAdmission?;
  private sessionModelSelection;
  private messageHistory;
  private readFileState;
  private cachedTools;
  private contextBuilder;
  private contextInitialized;
  private contextSourceSnapshot?;
  private latestContextBuildResult?;
  private memoryRoot?;
  private memoryIndexContent?;
  private memoryExtractionScheduler?;
  private contextSourcePort?;
  private skillPort?;
  private mcpPort?;
  private mcpStartupPromise?;
  private residencyBlockingWorkCount;
  private mcpInitialized;
  private mcpToolsRegistered;
  private subagentPort?;
  private dynamicWorkflowRunPort?;
  private modelCatalogPort?;
  private runtimeTaskRegistry;
  private branchGeneration;
  private artifactStore?;
  private executionPort?;
  private fileSystemPort?;
  private imageProcessorPort?;
  private pdfDocumentPort?;
  private skillLoadOutcome?;
  private workingDirectory;
  private workspaceRoot;
  private sessionStore?;
  private sessionPersisted;
  private needsPlanModeExitReminder;
  private latestConversationMessageId?;
  private latestAssistantMessageId?;
  private latestAssistantTurnId?;
  private mainTurnCacheHitAggregate;
  private currentTurnFileChanges;
  private lastAssistantCompletedAtMs?;
  private lastEmittedLocalDate?;
  private autoCompactConsecutiveFailures;
  private runtimeCommandQueue;
  private runtimeCommandDrainActive;
  private activeForegroundExecution?;

  private foregroundPromotionLease?;
  private activeTurn?;
  private activeTurnStartReservation?;
  private pendingInputSequence;

  private pendingInputReservations;
  private queueAutoDrain;
  private queueExternalDrainActive;
  private shuttingDown;
  private backgroundTaskNotificationsSealed;
  private backgroundTaskNotificationSealReason?;
  private pendingModelChangeTimeline?;
  private sessionStartHookRan;
  private sessionTitleGenerationAttempted;
  private agentTelemetry;
  constructor(sessionId: SessionId, config: AgentRuntimeConfig, deps: AgentRuntimeDeps);
}
export interface AgentRuntime {
  lastPermissionGrantId?: string;
  beginShutdown(): void;
  closeBrowserSession(): Promise<void>;
  updateConfig(
    patch: Pick<AgentRuntimeConfig, "mode" | "planEnabled" | "language" | "outputStyle">,
  ): void;
  initializeSessionShellEnvironmentIfNeeded(
    selection: ExecutionShellSelection | (() => ExecutionShellSelection),
  ): boolean;
  getSessionShellSelection(): ExecutionShellSelection | undefined;
  getMode(): CollaborationMode;
  getPlanEnabled(): boolean;
  grantPermissionFullAccess(interactionId: string, signal?: AbortSignal): Promise<string>;
  setExecutionState(
    input: {
      mode?: string;
      planEnabled?: boolean;
    },
    traceContext?: TraceContext,
  ): Promise<void>;
  getSessionModelSelection(): ModelSelection | undefined;
  setSessionModelSelection(selection: ModelSelection | undefined): void;
  getProjectId(): ProjectId;
  ensureSessionPersistedForExternalActivity(
    input: string,
    options?: {
      traceContext?: TraceContext;
    },
  ): Promise<void>;
  maybeStartSessionTitleGenerationFromExternalInput(
    input: string,
    options?: {
      goalSummaryTargetID?: string;
      traceContext?: TraceContext;
    },
  ): void;

  setCustomSessionTitle(input: { title: string; traceContext: TraceContext }): Promise<void>;
  maybeStartGoalSummaryTitleGeneration(
    input: string,
    targetID: string,
    options?: {
      traceContext?: TraceContext;
    },
  ): boolean;
  recordExternalUserPrompt(
    input: string,
    options?: {
      goalSummaryTargetID?: string;
      traceContext?: TraceContext;
      intent?: TurnInputIntentMetadata;
    },
  ): Promise<MessageId>;
  recordPendingModelChange(input: {
    fromModel?: ModelSelection;
    fromModelLabel?: string;
    toModel: ModelSelection;
    toModelLabel: string;
  }): void;
  getActiveTurnInfo(): ActiveTurnInfo | undefined;
  admitPrompt(
    input: string,
    attachments?: TurnState["attachments"],
    options?: PromptAdmissionOptions,
  ): Promise<PromptAdmissionReceipt>;

  hasActiveOrQueuedTurnWork(): boolean;

  hasRunningBackgroundTasks(): boolean;

  hasResidencyBlockingWork(): boolean;

  trackResidencyBlockingWork<T>(work: Promise<T>): Promise<T>;

  isSessionPersisted(): boolean;
  getActiveForegroundExecutionId(): string | undefined;
  acquireForegroundPromotionLease(options: {
    leaseId: string;
    mode: ForegroundPromotionLeaseMode;
    promotedInputId: string;
  }): AcquireForegroundPromotionLeaseResult;
  releaseForegroundPromotionLease(leaseId: string): boolean;
  enqueueDeferredInput(input: string | TurnSteerInput): Promise<TurnSteerResult>;
  steerTurn(input: string | TurnSteerInput): Promise<TurnSteerResult>;

  removePendingInputById(options: {
    pendingInputId: string;
    reason: "user_removed" | "promoted";
    reservationId?: string;
    traceContext?: TraceContext;
  }): Promise<boolean>;
  reservePendingInputById(options: {
    pendingInputId: string;
    reservationId: string;
    traceContext?: TraceContext;
  }): Promise<boolean>;
  markPendingInputPromoting(options: {
    pendingInputId: string;
    reservationId: string;
    traceContext?: TraceContext;
  }): Promise<boolean>;
  releasePendingInputReservation(options: {
    pendingInputId: string;
    reservationId: string;
    traceContext?: TraceContext;
  }): Promise<boolean>;

  editPendingInputById(options: {
    pendingInputId: string;
    newText: string;
    traceContext?: TraceContext;
  }): Promise<boolean>;

  reorderPendingInput(options: {
    pendingInputId: string;
    beforePendingInputId: string | null;
    traceContext?: TraceContext;
  }): Promise<boolean>;

  clearAllPendingInputs(traceContext: TraceContext): Promise<number>;

  setQueueAutoDrain(options: { autoDrain: boolean; traceContext?: TraceContext }): Promise<void>;

  completeExternalQueueDrain(): void;

  setFollowupMode(options: { mode: "queue" | "guide"; traceContext?: TraceContext }): Promise<void>;

  emitModelSelected(options: {
    modelSelection: ModelSelection;
    model?: Model;
    effectiveReasoningLevel?: string;
    previousModelSelection?: ModelSelection | null;
    origin?: ModelSelectionOrigin;
    supportedThoughtLevels?: readonly string[];
    traceContext?: TraceContext;
  }): Promise<void>;

  emitModeChanged(options: {
    mode: CollaborationMode;
    previousMode: CollaborationMode;
    traceContext: TraceContext;
  }): Promise<void>;
  getToolRegistry(): ToolRegistry;

  invalidateToolCache(): void;
  getToolExecutor(): ToolExecutor;
  subscribeEvents(sink: SessionEventSink): () => void;

  appendEvent(event: SessionEvent, traceContext: TraceContext): Promise<void>;

  getSessionEventStore(): SessionEventStorePort;

  notifyExternalChildSessionEvent(input: {
    childSessionId: SessionId;
    event: SessionEvent;
    traceContext?: TraceContext;
  }): Promise<void>;

  createChildClientPorts(context: ChildClientPortsContext): ClientFacingPorts;
  getContextBuilder(): ContextBuilder;

  getSkillCatalog(traceContext: TraceContext): Promise<SkillLoadOutcome>;
  resumeFromStore(options?: ResumeSessionOptions): Promise<ResumeSessionResult>;
  recordTargetChanged(
    input: TargetChangedPayload & {
      traceContext: TraceContext;
    },
  ): Promise<void>;
  recordUserInputAutoResolutionUpdate(
    input: UserInputAutoResolutionUpdatedPayload & {
      traceContext?: TraceContext;
    },
  ): Promise<void>;

  recordDynamicWorkflowRunProgress(
    input: DynamicWorkflowRunProgressPayload & {
      traceContext?: TraceContext;
    },
  ): Promise<void>;

  trackResumedDynamicWorkflowRun(input: {
    runId: string;
    toolCallId?: string;
    name?: string;
    traceContext?: TraceContext;
  }): Promise<void>;

  startSavedWorkflowRun(input: {
    name: string;
    scope?: SavedWorkflowScope;
    args?: Record<string, unknown>;
    traceContext?: TraceContext;
  }): Promise<StartSavedWorkflowRunResult>;

  amendWorkflowRunSettings(
    input: AmendWorkflowRunSettingsInput,
  ): Promise<AmendWorkflowRunSettingsResult>;
  recordGoalStateChangeReminder(input: {
    text: string;
    traceContext?: TraceContext;
  }): Promise<void>;
  continueActiveTargetIfIdle(options?: {
    abortSignal?: AbortSignal;
    inputId?: string;
    intent?: TurnInputIntentMetadata;
    traceContext?: TraceContext;
    verifyBeforeContinue?: boolean;
  }): Promise<TurnResult | null>;
  continueActiveTargetLoop(options: ContinueActiveTargetLoopOptions): Promise<TurnResult | null>;
  stopActiveForegroundExecution(
    options?: StopActiveForegroundExecutionOptions,
  ): StopActiveForegroundExecutionResult;
  activatePausedTargetAfterResume(traceContext: TraceContext): Promise<SessionGoal | null>;
  executeTurn(
    input: string,
    attachments?: TurnState["attachments"],
    options?: ExecuteTurnOptions,
  ): Promise<TurnResult>;
  scheduleTools(toolCalls: ToolCall[]): Promise<ToolSchedule>;
  executeTools(
    toolCalls: ToolCall[],
    schedule: ToolSchedule,
    options?: ExecuteToolsOptions,
  ): Promise<ExecuteToolsResult>;
  emitPermissionRequest(toolCallId: ToolCallId, toolName: string, riskLevel: string): Promise<void>;
  resolvePermission(toolCallId: ToolCallId, decision: PermissionDecisionResult): Promise<void>;
  getPendingPermissionRequests(): PermissionBrokerRequest[];
  getProjection(): Promise<SessionProjection>;
  readBackgroundBashOutput(workId: string, sessionId?: string): Promise<BackgroundBashOutputResult>;
  cancelBackgroundTask(
    taskId: string,
    options?: {
      traceContext?: TraceContext;
    },
  ): Promise<BackgroundTaskCancelResult>;
  stopBackgroundTask(
    taskId: string,
    options: RuntimeBackgroundStopOptions,
  ): Promise<RuntimeBackgroundStopResult>;
  cancelRunningRuntimeBackgroundTasks(input: {
    reason: "subagent_cancelled";
    traceContext?: TraceContext;
  }): Promise<void>;
  sealBackgroundTaskNotifications(input: {
    reason: "subagent_terminal" | "subagent_cancelled";
    traceContext?: TraceContext;
  }): void;
  getSessionId(): SessionId;
  listWorkspaceCheckpoints(options?: { limit?: number }): Promise<WorkspaceCheckpointSummary[]>;
  forkWorkspaceFromCheckpoint(options?: {
    abortSignal?: AbortSignal;
    forkedSessionId?: SessionId;
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
    traceContext?: TraceContext;
  }): Promise<WorkspaceForkResult>;
  forkStableConversationAtMessage(
    options: StableConversationForkOptions,
  ): Promise<WorkspaceForkResult>;
  createSelectionSideConversation(
    options: SelectionSideChatCreateOptions,
  ): Promise<WorkspaceForkResult>;
  forkConversationBeforeMessage(
    options: ConversationBeforeInputForkOptions,
  ): Promise<WorkspaceForkResult>;

  rewindConversationToMessage(options: {
    abortSignal?: AbortSignal;
    events: SessionEvent[];
    targetMessageId: MessageId;
    traceContext: TraceContext;
  }): Promise<ConversationRewindResult>;
  previewWorkspaceFileRewind(options?: {
    abortSignal?: AbortSignal;
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
    targetMessageIds?: MessageId[];
    targetTurnId?: TurnId;
    traceContext?: TraceContext;
  }): Promise<WorkspaceFileRewindPreview>;
  applyWorkspaceFileRewind(options?: {
    abortSignal?: AbortSignal;
    targetCheckpointId?: string;
    targetMessageId?: MessageId;
    targetMessageIds?: MessageId[];
    targetTurnId?: TurnId;
    traceContext?: TraceContext;
    commitAfterApply?: () => Promise<void>;
  }): Promise<WorkspaceFileRewindApplyResult>;
  generateWorkspaceText(
    input: WorkspaceGenerateTextInput,
    options?: {
      abortSignal?: AbortSignal;
      traceContext?: TraceContext;
    },
  ): Promise<WorkspaceGenerateTextResult>;
  testModelConnectivity(
    input: ModelConnectivityTestInput,
    options?: {
      abortSignal?: AbortSignal;
      traceContext?: TraceContext;
    },
  ): Promise<void>;
  isProjectMemoryEnabled(): boolean;

  drainMemoryExtractions(timeoutMs?: number | null): Promise<void>;
}
//# sourceMappingURL=agent-runtime.d.ts.map
