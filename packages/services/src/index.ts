// Descriptors & collection (browser-safe)
export { ServiceCollection } from "./collection.js";
export { createServiceDescriptor, type ServiceDescriptor } from "./descriptors.js";
export {
  collectServiceMemoryDiagnostics,
  memoryDiagnosticsRegistry,
  registerMemoryDiagnosticsProvider,
} from "./memoryDiagnostics.js";
export {
  IModelSelectionService,
  IProviderSettingsService,
  type ModelSelectionView,
  type ModelSelectionViewInput,
  type ProviderSettingsProviderView,
  type ProviderSettingsView,
} from "./model-provider/providerFacadeServices.js";

// Accessor
export type { IServiceAccessor } from "./accessor.js";
// Conversation share 的具体实现依赖 Node 文件系统，只能从 @knorvia/services/node 引入；
// 根入口必须保持 browser-safe，避免 renderer 解析到 node:* 模块。
export {
  createConversationTelemetryService,
  type ConversationTelemetryWorkspaceTarget,
  type IConversationTelemetryService,
} from "./conversation-telemetry/conversationTelemetry.js";

// File service — IFileService is both a type (interface) and value (descriptor)
export { IFileService } from "./file/file.js";
export { IMediaPreviewService } from "./media-preview/mediaPreview.js";
export type { MediaPreviewPreparation } from "./media-preview/mediaPreview.js";

// Git service — IGitService is both a type (interface) and value (descriptor)
export { IGitService } from "./git/git.js";
export { IGitCheckpointService } from "./git/gitCheckpoint.js";

// System service — ISystemService is both a type (interface) and value (descriptor)
export { ISystemService } from "./system/system.js";

// Terminal service — ITerminalService is both a type (interface) and value (descriptor)
export { ITerminalService } from "./terminal/terminal.js";

// Setting service — ISettingService is both a type (interface) and value (descriptor)
export { ISettingService } from "./setting/setting.js";
export type { SettingDataLocation } from "./setting/setting.js";

// Credential service — ICredentialService is both a type (interface) and value (descriptor)
export { ICredentialService } from "./credential/credential.js";

// Broadcast service — IBroadcastService is both a type (interface) and value (descriptor)
export { IBroadcastService } from "./broadcast/broadcast.js";

// Onboarding 完成记录服务（本地持久化，后续上传服务器）
export { IOnboardingRecordService } from "./onboarding/onboardingRecord.js";
export type { OnboardingRecordServiceFactory } from "./onboarding/onboardingRecord.js";
// 这里只能导出 descriptor 和类型。根 index 会被 renderer 经 value import 拉进浏览器包，
// 若 value 导出 createOnboardingRecordService，会连带 fs/atomicFileUtils → @knorvia/shared/node →
// node:timers/promises 整条 Node 链进浏览器，模块加载直接抛错导致整个应用黑屏。
// 工厂函数由 host 侧（node.ts）与测试从实现文件路径直接导入，与 createSettingService 同惯例。
export type {
  BroadcastClaimAcquireResult,
  BroadcastClaimLease,
  BroadcastMessage,
} from "./broadcast/broadcast.js";

// Knorvia task wrapper service — task 列表/置顶/归档等 app 侧包装状态入口。
export type { KnorviaTaskListItem } from "./session/taskListTypes.js";
export { IKnorviaTaskService } from "./session/taskService.js";
export type {
  KnorviaArchivedTaskDeletionResult,
  KnorviaGroupedTaskRef,
  KnorviaGroupedTaskView,
  KnorviaGroupedTaskViewNode,
  KnorviaGroupedTaskViewOrderInput,
  KnorviaGroupedTaskViewQuery,
  KnorviaGroupedTaskViewStructure,
  KnorviaGroupedTaskViewStructureMember,
  KnorviaGroupedTaskViewStructureTopOrder,
  KnorviaGroupedTaskViewTopLevelNodeRef,
  KnorviaModelTrajectory,
  KnorviaModelTrajectoryCallSource,
  KnorviaModelTrajectoryCallSourceKind,
  KnorviaModelTrajectoryContentPart,
  KnorviaModelTrajectoryMessage,
  KnorviaModelTrajectoryRecord,
  KnorviaModelTrajectoryUsage,
  KnorviaTaskGroup,
  KnorviaTaskGroupColor,
  KnorviaTaskListKind,
  KnorviaTaskListQuery,
  KnorviaTaskListResult,
  KnorviaTaskListSortBy,
  KnorviaTaskListWorkspaceScope,
  KnorviaTaskReadyOutcome,
} from "./session/taskService.js";

export { IWindowControllerService } from "./window-controller/windowController.js";
export type {
  WindowHostControllerFrame,
  WindowHostControllerMutation,
  WindowHostControllerTaskListItem,
  WindowHostControllerTaskListResult,
} from "./window-controller/windowController.js";

// Knorvia agent service — IKnorviaAgentService is both a type (interface) and value (descriptor)
export {
  IKnorviaAgentService,
  KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE,
  type KnorviaAgentLocalRuntimeChildProcesses,
} from "./agent/agent.js";
export type {
  KnorviaAgentAttachmentBeginParams,
  KnorviaAgentAttachmentChunkParams,
  KnorviaAgentAttachmentTerminalParams,
  KnorviaAgentCreateSessionParams,
  KnorviaAgentCuaPermissionObservation,
  KnorviaAgentInitializeResult,
  KnorviaAgentReadSessionParams,
  KnorviaAgentResumeSessionParams,
  KnorviaAgentRunAutomationNowResult,
  KnorviaAgentRuntimeLifecycleEvent,
  KnorviaAgentRuntimePolicy,
  KnorviaAgentSavedWorkflowTarget,
  KnorviaAgentSendPromptParams,
  KnorviaAgentServiceEvent,
  KnorviaAgentSessionSubscribeParams,
  KnorviaAgentSessionTarget,
  KnorviaAgentSetModeParams,
  KnorviaAgentSetModelParams,
  KnorviaAgentSetThoughtLevelParams,
  KnorviaAgentStorageStartupSnapshot,
  KnorviaAgentWorkspaceTarget,
} from "./agent/agent.js";
export {
  createKnorviaAgentConnectionScope,
  readTrustedKnorviaAgentV4Connection,
} from "./agent/agentConnectionScope.js";
export type {
  KnorviaAgentConnectionScope,
  KnorviaAgentV4ClientMode,
  KnorviaAgentV4ConnectionContext,
} from "./agent/agentConnectionScope.js";
export {
  KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED_ERROR_CODE,
  KnorviaAgentMcpStatusModeUnsupportedError,
  isKnorviaAgentMcpStatusModeUnsupportedError,
} from "./agent/agentErrors.js";

// Knorvia session service — app-facing session facade without Knorvia Agent naming.
export { IKnorviaSessionService } from "./agent-session/session.js";
export type {
  KnorviaSessionCreateParams,
  KnorviaSessionEventsParams,
  KnorviaSessionInitializeResult,
  KnorviaSessionListParams,
  KnorviaSessionMessagesParams,
  KnorviaSessionReadParams,
  KnorviaSessionResumeParams,
  KnorviaSessionServiceEvent,
  KnorviaSessionSetModeParams,
  KnorviaSessionSetModelParams,
  KnorviaSessionSetThoughtLevelParams,
  KnorviaSessionSubscribeParams,
  KnorviaSessionWorkspaceTarget,
  KnorviaTaskTarget,
} from "./agent-session/session.js";

// Hooks service — IHooksService is both a type (interface) and value (descriptor).
export { IHooksService } from "./hooks/hooks.js";

// Memory service — IMemoryService is both a type (interface) and value (descriptor).
export {
  IMemoryService,
  PROJECT_MEMORY_FILE_CHANGED_ERROR_CODE,
  PROJECT_MEMORY_PREVIEW_LIMIT_EXCEEDED_ERROR_CODE,
} from "./memory/memory.js";
export type { ProjectMemoryFileSummary, ProjectMemoryWorkspaceSummary } from "./memory/memory.js";

export type { SessionRealtimePort } from "./session/sessionRealtimePort.js";

// FileWatcher service — IFileWatcherService is both a type (interface) and value (descriptor)
export { IFileWatcherService } from "./fileWatcher/fileWatcher.js";

// UsageStats service — IUsageStatsService is both a type (interface) and value (descriptor)
export { IUsageStatsService } from "./usage-stats/usageStats.js";

// Storage（资源管理器「存储」tab）：数据类型在 @knorvia/shared；这里只导出服务接口与卷分组纯函数
export { isValidCronExpr } from "./session/automationCronValidation.js";
export type { IStorageService } from "./storage/contract.js";

// Skills service — ISkillsService is both a type (interface) and value (descriptor)
export {
  ICuaPermissionService,
  isCuaPermissionStatusAvailable,
  type CuaPermissionRestartOptions,
  type CuaPermissionState,
  type CuaPermissionStatus,
  type CuaPermissionStatusQueryOptions,
  type CuaPermissionStatusResult,
  type CuaPermissionStatusUnavailable,
} from "./cua-permission-broker/cuaPermissionService.js";
export {
  ICuaPipSessionService,
  type CuaPipSessionService,
} from "./cua-permission-broker/cuaPipSession.js";
export { IMcpSyncService } from "./mcp-sync/mcpSync.js";
export { IPluginSyncService } from "./plugin-sync/pluginSync.js";
export { ISkillSyncService } from "./skill-sync/skillSync.js";
export { ISkillsService } from "./skills/skills.js";

// Plugins service — IPluginsService is both a type (interface) and value (descriptor)
export { IPluginsService } from "./plugins/plugins.js";
// 设置页插件管理薄服务（UI 平台能力面不再直触 agentService）
export { IPluginManagementService } from "./plugins/pluginManagement.js";

// Subagents service — ISubagentsService is both a type (interface) and value (descriptor)
export { ISubagentsService } from "./subagents/subagents.js";

// Commands service — ICommandsService is both a type (interface) and value (descriptor)
export { ICommandsService } from "./commands/commands.js";

export { IPromptAttachmentTransferService } from "./prompt-attachment-transfer/promptAttachmentTransfer.js";
export type {
  PromptAttachmentStageParams,
  PromptAttachmentStageResult,
  PromptAttachmentTransferPhase,
  PromptAttachmentTransferProgress,
} from "./prompt-attachment-transfer/promptAttachmentTransfer.js";
export { ISettingsSyncService } from "./settings-sync/settingsSync.js";
export * from "./studio-runtime/contract.js";
export * from "./creation/contract.js";
