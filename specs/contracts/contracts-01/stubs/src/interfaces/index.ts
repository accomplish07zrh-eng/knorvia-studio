// SPDX-License-Identifier: MIT
/* eslint-disable max-lines -- 桩文件按 interface.md 的导出清单生成，行数由导出数量决定。 */
// contracts-01 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的桩替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-01");
};

const _unimplementedValue = (): never => notImplemented();

export type ActiveToolCall = never;
export type AgentPart = never;
export type AppUsageDayModelRow = never;
export type AppUsageDayRow = never;
export type AppUsageModelRow = never;
export type AppUsageQueryInput = never;
export type AppUsageQueryResult = never;
export type AppUsageToolRow = never;
export type AppUsageToolTotalsRow = never;
export type AppUsageTotalsRow = never;
export type AppUsageTurnTotalsRow = never;
export type AssistantErrorInfo = never;
export type AssistantMessageInfo = never;
export type AttachmentStorageMetadata = never;
export const AUTOMATION_CREATE_LIMIT_ERROR_CODE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type AutomationCreateContext = never;
export class AutomationCreateLimitError {
  constructor(..._args: unknown[]) {
    notImplemented();
  }
}
export type AutomationPort = never;
export type BackgroundExecutionSnapshot = never;
export type BackgroundExecutionStartResult = never;
export type BackgroundExecutionStatus = never;
export type BackgroundTaskCancelResult = never;
export type BackgroundTaskInfo = never;
export type BackgroundTaskInfoStatus = never;
export function boundDynamicWorkflowRunEventPayload(..._args: unknown[]): never {
  return notImplemented();
}
export const BROWSER_VIEWPORT_LIMITS = new Proxy({} as never, { get: _unimplementedValue });
export type BrowserBackendDescriptor = never;
export type BrowserBackendListResult = never;
export type BrowserBackendType = never;
export type BrowserCapabilityDescriptor = never;
export type BrowserClientMode = never;
export type BrowserCommand = never;
export type BrowserCommandMethod = never;
export type BrowserCommandResult = never;
export type BrowserControlExecuteInput = never;
export type BrowserControlListInput = never;
export type BrowserControlPort = never;
export type BrowserDialog = never;
export type BrowserDiscoveryContext = never;
export type BrowserErrorCode = never;
export type BrowserKeyModifier = never;
export type BrowserMouseButton = never;
export type BrowserPageState = never;
export type BrowserPlaywrightAction = never;
export type BrowserPlaywrightLocatorOperation = never;
export type BrowserPlaywrightModifier = never;
export type BrowserPoint = never;
export type BrowserRecordingAction = never;
export type BrowserRecordingArtifact = never;
export type BrowserRecordingJob = never;
export type BrowserRecordingOptions = never;
export type BrowserResponseMeta = never;
export type BrowserSessionContext = never;
export type BrowserSessionContextKind = never;
export type BrowserSnapshot = never;
export type BrowserSnapshotDomNode = never;
export type BrowserSnapshotElement = never;
export type BrowserTabSummary = never;
export type BrowserUserTabInfo = never;
export type BrowserViewportSize = never;
export type ClaimLegacySessionWorkspaceInput = never;
export type CollaborationMode = never;
export type CompactionPart = never;
export type ContextCompactionTimelinePart = never;
export type ContextSourceDiagnostic = never;
export type ContextSourcePort = never;
export type ContextSourceRequest = never;
export type ContextSourceResolveOptions = never;
export type ContextSourceSnapshot = never;
export function createEventId(..._args: unknown[]): never {
  return notImplemented();
}
export function createFileSystemError(..._args: unknown[]): never {
  return notImplemented();
}
export function createHttpClientError(..._args: unknown[]): never {
  return notImplemented();
}
export function createImageProcessorError(..._args: unknown[]): never {
  return notImplemented();
}
export function createInputHistoryId(..._args: unknown[]): never {
  return notImplemented();
}
export function createMessageId(..._args: unknown[]): never {
  return notImplemented();
}
export function createPartId(..._args: unknown[]): never {
  return notImplemented();
}
export function createProjectId(..._args: unknown[]): never {
  return notImplemented();
}
export function createQueryId(..._args: unknown[]): never {
  return notImplemented();
}
export function createSessionId(..._args: unknown[]): never {
  return notImplemented();
}
export type CreateSessionInput = never;
export function createToolCallId(..._args: unknown[]): never {
  return notImplemented();
}
export function createTraceId(..._args: unknown[]): never {
  return notImplemented();
}
export function createTurnId(..._args: unknown[]): never {
  return notImplemented();
}
export function createWorkspaceId(..._args: unknown[]): never {
  return notImplemented();
}
export const DYNAMIC_WORKFLOW_RUN_EVENT_PAYLOAD_LIMITS = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type DynamicWorkflowResolveQuestionRefusalReason = never;
export type DynamicWorkflowResolveQuestionResult = never;
export type DynamicWorkflowRunActor = never;
export type DynamicWorkflowRunAmendRefusalReason = never;
export type DynamicWorkflowRunAmendRequest = never;
export type DynamicWorkflowRunAmendResult = never;
export type DynamicWorkflowRunArtifact = never;
export type DynamicWorkflowRunArtifactBytes = never;
export type DynamicWorkflowRunArtifactItem = never;
export type DynamicWorkflowRunArtifactItemPage = never;
export type DynamicWorkflowRunArtifactKind = never;
export type DynamicWorkflowRunArtifactVersion = never;
export type DynamicWorkflowRunCancelInitiator = never;
export type DynamicWorkflowRunConcurrencyHealth = never;
export type DynamicWorkflowRunDetail = never;
export type DynamicWorkflowRunError = never;
export type DynamicWorkflowRunEvent = never;
export type DynamicWorkflowRunEventPage = never;
export type DynamicWorkflowRunHealth = never;
export type DynamicWorkflowRunLifecycleStatus = never;
export type DynamicWorkflowRunListItem = never;
export type DynamicWorkflowRunListQuery = never;
export type DynamicWorkflowRunListResult = never;
export type DynamicWorkflowRunLogEntry = never;
export type DynamicWorkflowRunPendingQuestion = never;
export type DynamicWorkflowRunPhaseState = never;
export type DynamicWorkflowRunPhaseView = never;
export type DynamicWorkflowRunPort = never;
export type DynamicWorkflowRunProviderStop = never;
export type DynamicWorkflowRunResumeErrorReason = never;
export type DynamicWorkflowRunResumeResult = never;
export type DynamicWorkflowRunSessionSummary = never;
export type DynamicWorkflowRunSnapshot = never;
export type DynamicWorkflowRunStopReason = never;
export type DynamicWorkflowRunSubagentAsk = never;
export type DynamicWorkflowRunSubagentLastTool = never;
export type DynamicWorkflowRunSubagentState = never;
export type DynamicWorkflowRunSubagentView = never;
export type DynamicWorkflowRunSubagentWait = never;
export type DynamicWorkflowRunSubmitOptions = never;
export type DynamicWorkflowRunSubmitRequest = never;
export type DynamicWorkflowRunSubmitResult = never;
export type DynamicWorkflowRunSummary = never;
export type DynamicWorkflowRunUsage = never;
export type DynamicWorkflowRunWaitOptions = never;
export type DynamicWorkflowRunWorkspaceNode = never;
export type DynamicWorkflowRunWorkspaceNodeKind = never;
export type DynamicWorkflowRunWorkspaceNodeResult = never;
export type DynamicWorkflowRunWorkspaceNodeResultQuery = never;
export type DynamicWorkflowRunWorkspaceNodeStatus = never;
export type DynamicWorkflowRunWorkspaceNodeSummary = never;
export type DynamicWorkflowSnippetDiagnostic = never;
export type DynamicWorkflowSnippetEvalOptions = never;
export type DynamicWorkflowSnippetEvalRequest = never;
export type DynamicWorkflowSnippetEvalResult = never;
export type DynamicWorkflowSnippetPort = never;
export type EmbeddedSearchArgv0DispatchBackend = never;
export type EmbeddedSearchBackend = never;
export type EmbeddedSearchInternalCliBackend = never;
export type EmbeddedSearchNativeBinariesBackend = never;
export type EnvInfo = never;
export type ErrorInfo = never;
export type EscalateQuestionRequest = never;
export type EventId = never;
export type EventReducerPort = never;
export type ExecutionCommand = never;
export type ExecutionEmbeddedSearchPrelude = never;
export type ExecutionEnvBase = never;
export type ExecutionEnvOverlay = never;
export type ExecutionEvent = never;
export type ExecutionFailure = never;
export type ExecutionFailureType = never;
export type ExecutionOutputLimit = never;
export type ExecutionOutputPreview = never;
export type ExecutionPort = never;
export type ExecutionRequest = never;
export type ExecutionResult = never;
export type ExecutionRunOptions = never;
export type ExecutionSandboxPolicy = never;
export type ExecutionShellDialect = never;
export type ExecutionShellDisplay = never;
export type ExecutionShellOverride = never;
export type ExecutionShellSelection = never;
export type ExecutionShellSource = never;
export type ExecutionStatus = never;
export type ExecutionStreamResult = never;
export type FileDiff = never;
export type FilePart = never;
export type FilePartSource = never;
export type FileSystemCreateDirectoryRequest = never;
export type FileSystemCreateDirectoryResult = never;
export type FileSystemErrorCode = never;
export type FileSystemErrorDetails = never;
export type FileSystemLineEndings = never;
export type FileSystemListDirectoryEntry = never;
export type FileSystemListDirectoryRequest = never;
export type FileSystemListDirectoryResult = never;
export type FileSystemNodeKind = never;
export type FileSystemOperationOptions = never;
export type FileSystemPort = never;
export class FileSystemPortError {
  constructor(..._args: unknown[]) {
    notImplemented();
  }
}
export type FileSystemReadBytesRequest = never;
export type FileSystemReadBytesResult = never;
export type FileSystemReadTextRangeRequest = never;
export type FileSystemReadTextRangeResult = never;
export type FileSystemReadTextRequest = never;
export type FileSystemReadTextResult = never;
export type FileSystemRemoveFileRequest = never;
export type FileSystemRemoveFileResult = never;
export type FileSystemRevision = never;
export type FileSystemSearchFilesRequest = never;
export type FileSystemSearchFilesResult = never;
export type FileSystemSearchTextEntry = never;
export type FileSystemSearchTextRequest = never;
export type FileSystemSearchTextResult = never;
export type FileSystemStatRequest = never;
export type FileSystemStatResult = never;
export type FileSystemTextEncoding = never;
export type FileSystemTextSearchOutputMode = never;
export type FileSystemWriteTextRequest = never;
export type FileSystemWriteTextResult = never;
export type ForkChildSessionMetadata = never;
export type ForkCommandResult = never;
export type ForkCommitBundle = never;
export type GoalVerificationTimelinePart = never;
export type HttpClientEgressInfo = never;
export type HttpClientEgressPolicy = never;
export type HttpClientErrorCode = never;
export type HttpClientErrorDetails = never;
export type HttpClientMethod = never;
export type HttpClientPort = never;
export class HttpClientPortError {
  constructor(..._args: unknown[]) {
    notImplemented();
  }
}
export type HttpClientRedirectPolicy = never;
export type HttpClientRequest = never;
export type HttpClientResponse = never;
export type HttpClientRunOptions = never;
export type ImageAttachmentPathPrimeRequest = never;
export type ImageCompressionStrategy = never;
export type ImagePrepareForModelRequest = never;
export type ImagePrepareForModelResult = never;
export type ImageProcessorErrorCode = never;
export type ImageProcessorErrorDetails = never;
export type ImageProcessorPort = never;
export class ImageProcessorPortError {
  constructor(..._args: unknown[]) {
    notImplemented();
  }
}
export type ImageResizeRequest = never;
export type ImageResizeResult = never;
export type InputDelivery = never;
export type InputHistoryId = never;
export type InteractionRequestOrigin = never;
export function isAutomationCreateLimitError(..._args: unknown[]): never {
  return notImplemented();
}
export function isFileSystemPortError(..._args: unknown[]): never {
  return notImplemented();
}
export function isHttpClientPortError(..._args: unknown[]): never {
  return notImplemented();
}
export function isImageProcessorPortError(..._args: unknown[]): never {
  return notImplemented();
}
export const KNORVIA_MCP_BROWSER_SCREENSHOT_CONTENT_INDICES_META_KEY = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const KNORVIA_MCP_ERROR_PRESENTATION_MESSAGE_ONLY = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const KNORVIA_MCP_ERROR_PRESENTATION_META_KEY = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const KNORVIA_MCP_NODE_REPL_CUA_APP_META_KEY = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const KNORVIA_MCP_SERVER_REQUEST_ID_META_KEY = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type KnorviaOfficialMcpAuthConfig = never;
export type ListSessionsInput = never;
export type LocalSettingStorePort = never;
export type McpAuthorizationCodeOAuthConfig = never;
export type McpCallToolOptions = never;
export type McpCallToolRequest = never;
export type McpClientCredentialsOAuthConfig = never;
export type McpConnectionSnapshot = never;
export type McpConnectOptions = never;
export type McpContentBlock = never;
export type McpHttpServerConfig = never;
export type McpOAuthConfig = never;
export type McpOfficialProvenance = never;
export type McpPort = never;
export type McpProtocolVersion = never;
export type McpServerConfig = never;
export type McpServerConfigBase = never;
export type McpServerIsolation = never;
export type McpServerRuntimeSource = never;
export type McpServerStatus = never;
export type McpServerStatusKind = never;
export type McpServerTransportType = never;
export type McpSseServerConfig = never;
export type McpStdioServerConfig = never;
export type McpToolAnnotations = never;
export type McpToolCallResult = never;
export type McpToolDescriptor = never;
export type MediaAttachmentPathEnsureRequest = never;
export type MediaAttachmentPathPrimeRequest = never;
export type MediaAttachmentPathResult = never;
export const MESSAGE_ANCHOR_ORIGINS = new Proxy({} as never, { get: _unimplementedValue });
export const MESSAGE_VISIBILITIES = new Proxy({} as never, { get: _unimplementedValue });
export type MessageAnchorOrigin = never;
export type MessageContextSnapshot = never;
export type MessageId = never;
export type MessageInfo = never;
export type MessagePart = never;
export type MessageProjectionAnchor = never;
export type MessageSemantics = never;
export type MessageSemanticsKind = never;
export type MessageSemanticsOrigin = never;
export type MessageSummary = never;
export type MessageVisibility = never;
export type MessageWithParts = never;
export type ModelCatalogEntry = never;
export type ModelCatalogPort = never;
export type ModelChangeTimelinePart = never;
export type ModelUsageRecord = never;
export type OfficialMcpAuthFailureReason = never;
export type OfficialMcpAuthHeadersPort = never;
export type OfficialMcpAuthHeadersResult = never;
export type OfficialMcpTrustedOriginRegistry = never;
export type OutputFormat = never;
export type PackageManager = never;
export type PartId = never;
export type PatchPart = never;
export type PdfDocumentErrorCode = never;
export type PdfDocumentPageCountRequest = never;
export type PdfDocumentPort = never;
export class PdfDocumentPortError {
  constructor(..._args: unknown[]) {
    notImplemented();
  }
}
export type PdfDocumentRenderedPage = never;
export type PdfDocumentRenderPagesRequest = never;
export type PendingPermission = never;
export type PendingSteerInputInfo = never;
export type PendingTurnAttachment = never;
export type PendingTurnInput = never;
export const PERMISSION_FULL_ACCESS_ENTRY = new Proxy({} as never, { get: _unimplementedValue });
export type PermissionBrokerPort = never;
export type PermissionBrokerReasonSource = never;
export type PermissionBrokerRequest = never;
export type PermissionBrokerRequestOptions = never;
export type PermissionBrokerResult = never;
export type PermissionCapabilityGroup = never;
export const permissionFullAccessReceiptSchema = new Proxy({} as never, {
  get: _unimplementedValue,
});
export type PermissionOptionsPolicy = never;
export type PermissionRuleBehavior = never;
export type PermissionRuleset = never;
export type PermissionRuleValue = never;
export type PermissionUpdate = never;
export type PreparedPermissionRequest = never;
export type ProjectContext = never;
export type ProjectId = never;
export type ProjectPermissionUpdateInput = never;
export type ProjectPermissionUpdatePort = never;
export type ProjectType = never;
export type QueryId = never;
export type ReasoningPart = never;
export type RepairLegacyRemoteSessionWorkspaceInput = never;
export type RepairRemoteSessionPathsInput = never;
export type ResolvedUserInstructions = never;
export type ResolvedUserInstructionSource = never;
export type RetryPart = never;
export type RiskLevel = never;
export function serializeWorkflowArtifact(..._args: unknown[]): never {
  return notImplemented();
}
export type Session = never;
export const SESSION_ENTRY_BASH_SHELL_SELECTION = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SESSION_ENTRY_EXECUTION_STATE = new Proxy({} as never, { get: _unimplementedValue });
export const SESSION_ENTRY_MODEL_SELECTION = new Proxy({} as never, { get: _unimplementedValue });
export const SESSION_ENTRY_TARGET_COMPLETION_VERIFICATION = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SESSION_ENTRY_TYPES = new Proxy({} as never, { get: _unimplementedValue });
export const SESSION_ENTRY_USER_INPUT_AUTO_RESOLUTION = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SESSION_ENTRY_WORKSPACE_CHECKPOINT = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SESSION_ENTRY_WORKSPACE_FILE_REWIND = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const SESSION_TASK_TYPES = new Proxy({} as never, { get: _unimplementedValue });
export const SESSION_TITLE_SOURCES = new Proxy({} as never, { get: _unimplementedValue });
export type SessionConfig = never;
export type SessionEntryInfo = never;
export type SessionEntryType = never;
export type SessionEventSink = never;
export type SessionEventStorePort = never;
export type SessionEventStoreStats = never;
export type SessionForkTimelinePart = never;
export type SessionId = never;
export type SessionInfo = never;
export type SessionInputDelivery = never;
export type SessionInputRecord = never;
export type SessionInputStatus = never;
export type SessionMailboxEnvelope = never;
export type SessionMailboxPort = never;
export type SessionManagerPort = never;
export type SessionProjection = never;
export type SessionRevert = never;
export type SessionStatus = never;
export type SessionStorePort = never;
export type SessionSummary = never;
export type SessionTaskType = never;
export type SessionTitleSource = never;
export type SharedContextImportCommitBundle = never;
export type SharedContextImportStatus = never;
export type SharedContextImportTransition = never;
export type SnapshotPart = never;
export type StableForkGoalBoundaryMetadata = never;
export type StableForkTargetMetadata = never;
export type StepFinishPart = never;
export type StepStartPart = never;
export type SubagentInteractionRequestOrigin = never;
export type SubagentLaunchOptions = never;
export type SubagentLaunchRequest = never;
export type SubagentPort = never;
export type SubagentRunOptions = never;
export type SubagentRunRequest = never;
export type SubagentSendMessageDelivery = never;
export type SubagentSendMessageOptions = never;
export type SubagentSendMessageRequest = never;
export type SubagentSendMessageResult = never;
export type SubagentStartOptions = never;
export type SubagentStartRequest = never;
export type SubagentStopOptions = never;
export type SubagentTaskSnapshot = never;
export type SubagentTaskStatus = never;
export type SubagentWaitOptions = never;
export type SubmitAccepted = never;
export type SubmitRejected = never;
export type SubmitResultRequest = never;
export type SubmitVerdict = never;
export type SubmitViolation = never;
export type SubtaskPart = never;
export const SYNTHETIC_USER_MESSAGE_SOURCES = new Proxy({} as never, { get: _unimplementedValue });
export type SyntheticUserMessageSource = never;
export type TargetCompletionVerificationProjectionInfo = never;
export type TaskUsageQueryInput = never;
export type TaskUsageQueryResult = never;
export type TextPart = never;
export type TimelineModelSelection = never;
export type TimelinePart = never;
export type TimelinePartBase = never;
export type TimelinePartDisplay = never;
export type TimelinePartDraft = never;
export type TimelinePartStatus = never;
export type TokenUsageInfo = never;
export type ToolArtifactReadRequest = never;
export type ToolArtifactReadResult = never;
export type ToolArtifactRetention = never;
export type ToolArtifactStatRequest = never;
export type ToolArtifactStatResult = never;
export type ToolArtifactStorePort = never;
export type ToolArtifactWriteRequest = never;
export type ToolArtifactWriteResult = never;
export type ToolBinaryArtifactReadResult = never;
export type ToolBinaryArtifactWriteRequest = never;
export type ToolCallId = never;
export type ToolCallStatus = never;
export type ToolPart = never;
export type ToolState = never;
export type ToolStateCompleted = never;
export type ToolStateError = never;
export type ToolStatePending = never;
export type ToolStateRunning = never;
export type ToolUsageRecord = never;
export type TraceId = never;
export type TurnId = never;
export type TurnInputIntentMetadata = never;
export type TurnSteerCommandKind = never;
export type TurnSteerDeliveryMode = never;
export type TurnSteerInput = never;
export type TurnSteerRejectReason = never;
export type TurnSteerResult = never;
export type TurnSteerSource = never;
export type TurnUsageRecord = never;
export type UpdateSessionInput = never;
export type UsageQuerySource = never;
export type UsageStatus = never;
export type UsageStorePort = never;
export type UserInstructionsOptions = never;
export type UserInstructionSourceScope = never;
export type UserMessageInfo = never;
export type WorkflowEscalateOutcome = never;
export type WorkflowEscalatePort = never;
export type WorkflowPort = never;
export type WorkflowStartOptions = never;
export type WorkflowStartRequest = never;
export type WorkflowSubmitPort = never;
export type WorkflowTaskSnapshot = never;
export type WorkflowTaskStatus = never;
export type WorkspaceId = never;
