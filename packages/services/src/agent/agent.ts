import type { BackgroundBashOutputResult, SessionDebugSnapshot } from "@knorvia/shared";
/* eslint-disable max-lines -- Knorvia agent service 接口集中声明 protocol/session/workspace 方法，拆分会增加 service descriptor 迁移成本。 */
import type { Event, IDisposable } from "@knorvia/rpc";
import { ServiceChannels } from "@knorvia/shared";
import type { AppUsageRange, AppUsageSnapshot, KnorviaTaskTokenUsageResult } from "@knorvia/shared";
import type { KnorviaAutomation, KnorviaAutomationRun } from "@knorvia/shared";
import type {
  KnorviaStorageStartupState,
  KnorviaDeliveryKind,
  KnorviaAgentMcpServer,
  KnorviaBackgroundTurnAttribution,
  TraceId,
  KnorviaSessionCompactResult,
  KnorviaSessionGoalAction,
  KnorviaSessionGoalResult,
  KnorviaMessageWithParts,
  ModelSelection,
  KnorviaSessionImportHistory,
  KnorviaPermissionRequestParams,
  AgentLaneResourceSample,
  KnorviaMcpTelemetryEvent,
  KnorviaMcpResourceSample,
  KnorviaToolExecResource,
  KnorviaProcessChildProcess,
  KnorviaMcpListResult,
  KnorviaPluginsListResult,
  KnorviaPluginsOverviewResult,
  KnorviaPluginsMarketplaceMutationResult,
  KnorviaPluginsInstallResult,
  KnorviaPluginsReferenceCatalogResult,
  KnorviaSkillsReferenceCatalogResult,
  KnorviaWorkflowsDeleteResult,
  KnorviaWorkflowsGetResult,
  KnorviaWorkflowsListResult,
  KnorviaWorkflowsMoveResult,
  KnorviaWorkflowsRunsResult,
  KnorviaWorkflowsUpdateMetaResult,
  KnorviaPluginsUninstallResult,
  KnorviaPluginsRestoreBuiltinResult,
  KnorviaPluginsConfigureResult,
  KnorviaPluginsDescribeResult,
  KnorviaPluginsValidateResult,
  KnorviaPluginsSetEnabledResult,
  KnorviaPluginsCancelOperationResult,
  KnorviaPluginOperationProgressNotification,
  KnorviaProviderTestModelConnectivityParams,
  KnorviaProviderTestModelConnectivityResult,
  KnorviaUserInputRequestParams,
  KnorviaUserInputResponse,
  KnorviaSessionEvent,
  KnorviaSessionInfo,
  KnorviaSessionMode,
  KnorviaSessionPersistence,
  KnorviaSessionSendResult,
  KnorviaSessionRequestRuntimePreferencesParams,
  KnorviaSessionRuntimePreferencesResult,
  KnorviaSessionStateSnapshot,
  KnorviaSessionSubagentsResult,
  KnorviaStateUpdatedNotification,
  KnorviaTaskClientMode,
  KnorviaBrowserAmbientContext,
  KnorviaWorkspacePresentation,
  KnorviaWorkspaceGenerateTextResult,
  KnorviaWorkspaceGenerateTextParams,
  KnorviaWorkspaceHookTrustGrantResult,
} from "@knorvia/shared";
import type {
  ClientHello,
  CommandAck,
  CommandEnvelope,
  CommandKey,
  CommandsQueryResult,
  ConversationTopicWireCandidate,
  ConversationTelemetryFact,
  CuaPermissionObservation,
  ConversationRowTarget,
  HelloMessage,
  SessionsIndexTopicWireCandidate,
  V4AttachmentBeginResult,
  V4AttachmentChunkResult,
  V4AttachmentCommitResult,
  V4AttachmentPreviewSourceResult,
  V4AttachmentReadResult,
  V4ConversationAttachmentReadResult,
  V4ConversationAttachmentStatResult,
  V4ConnectionFlowState,
  V4ConversationFileChangesResult,
  V4ConversationFileRewindPreviewResult,
  V4ConversationPlansResult,
  V4ConversationWorkflowRunEventsResult,
  V4ConversationWorkflowRunArtifactDataResult,
  V4ConversationWorkflowRunArtifactReadResult,
  V4ConversationWorkflowRunArtifactsResult,
  V4ConversationWorkflowRunNodeResultResult,
  V4ConversationWorkflowRunWorkspaceResult,
  V4ConversationWorkflowRunsResult,
  V4ConversationRowsRangeResult,
  V4ConversationResyncResult,
  V4ConversationSubscribeResult,
  V4SessionsIndexSubscribeResult,
  V4WorkspaceConfigSubscribeResult,
  WorkspaceConfigTopicWireCandidate,
} from "@knorvia/shared/protocol-v4";
import { createServiceDescriptor } from "../descriptors.js";

export * from "./agentPluginParams.js";
export * from "./agentWorkflowParams.js";
import type {
  KnorviaAgentAddPluginMarketplaceParams,
  KnorviaAgentAutomationIdParams,
  KnorviaAgentCancelPluginOperationParams,
  KnorviaAgentConfigurePluginParams,
  KnorviaAgentResetPluginConfigParams,
  KnorviaAgentCreateAutomationParams,
  KnorviaAgentDeleteAutomationRunParams,
  KnorviaAgentDescribePluginParams,
  KnorviaAgentInstallPluginParams,
  KnorviaAgentListMcpServerStatusesParams,
  KnorviaAgentPluginViewParams,
  KnorviaAgentPluginReferenceCatalogParams,
  KnorviaAgentSkillReferenceCatalogParams,
  KnorviaAgentResolveSuggestedPluginReferenceParams,
  KnorviaAgentRemovePluginMarketplaceParams,
  KnorviaAgentRestoreBuiltinPluginParams,
  KnorviaAgentSetPluginEnabledParams,
  KnorviaAgentSetAutomationEnabledParams,
  KnorviaAgentUninstallPluginParams,
  KnorviaAgentUpdatePluginMarketplaceParams,
  KnorviaAgentUpdatePluginParams,
  KnorviaAgentUpdateAutomationParams,
  KnorviaAgentValidatePluginParams,
  KnorviaAgentWorkspaceTarget,
} from "./agentPluginParams.js";
import type {
  KnorviaAgentDeleteSavedWorkflowParams,
  KnorviaAgentGetSavedWorkflowParams,
  KnorviaAgentListSavedWorkflowRunsParams,
  KnorviaAgentListSavedWorkflowsParams,
  KnorviaAgentMoveSavedWorkflowParams,
  KnorviaAgentUpdateSavedWorkflowMetaParams,
} from "./agentWorkflowParams.js";

export interface KnorviaAgentSessionTarget extends KnorviaAgentWorkspaceTarget {
  sessionId: string;
}

export interface KnorviaAgentResumeSessionParams extends KnorviaAgentSessionTarget {
  model?: ModelSelection;
  thoughtLevel?: string;
  mcpServers?: KnorviaAgentMcpServer[];
  // 冷恢复会重建 runtime，工具面隔离必须和 create 保持同一安全边界（CUA 只放行 cua 工具、
  // 禁 Bash 等）。否则 resume 后模型可见工具面/执行权限会比创建时更宽。
  toolAllowlist?: string[];
  toolDenylist?: string[];
}

export interface KnorviaAgentInitializeResult {
  available: boolean;
  workspaceKey: string;
  protocolName?: string;
  protocolVersion?: number;
  transportKind?: "stdio" | "websocket";
  reason?: string;
  reasonCode?: "provider_not_ready";
}

export interface KnorviaAgentRunAutomationNowResult {
  status: "queued" | "duplicate";
}

export interface KnorviaAgentWorkspaceRuntimeIdentity {
  generation: number;
  identity: string;
  processId?: number;
  workspaceKey: string;
}

export const KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE = "KNORVIA_AGENT_RUNTIME_UNAVAILABLE";

export type KnorviaAgentRuntimePolicy = "start-if-needed" | "existing-only";

export interface KnorviaAgentRuntimeLifecycleEvent extends KnorviaAgentWorkspaceTarget {
  workspaceKey: string;
  runtimeIdentity: KnorviaAgentWorkspaceRuntimeIdentity;
  state: "available" | "unavailable";
}

export type KnorviaAgentCuaPermissionObservation = CuaPermissionObservation &
  KnorviaAgentWorkspaceTarget;

export interface KnorviaAgentCreateSessionParams extends KnorviaAgentWorkspaceTarget {
  sessionId?: string;
  sessionTraceId?: TraceId;
  parentSessionId?: string;
  mode?: KnorviaSessionMode;
  model?: ModelSelection;
  persistence?: KnorviaSessionPersistence;
  thoughtLevel?: string;
  /** automation 执行会话关闭模型二次命名，保持首条用户 query 作为稳定标题。 */
  titleGenerationEnabled?: boolean;
  mcpServers?: KnorviaAgentMcpServer[];
  toolAllowlist?: string[];
  toolDenylist?: string[];
  importedHistory?: KnorviaSessionImportHistory;
}

export interface KnorviaAgentListSessionsParams extends KnorviaAgentWorkspaceTarget {
  sessionIds?: string[];
  runtimePolicy?: KnorviaAgentRuntimePolicy;
  includeArchived?: boolean;
  limit?: number;
}

export interface KnorviaAgentListSessionSubagentsParams extends KnorviaAgentSessionTarget {
  endedCursor?: string;
  endedLimit?: number;
  /** 远程 workspace 的宿主连接身份；只用于选择现有 Host，不进入 CLI wire query。 */
  remoteSessionId?: string;
}

export interface KnorviaAgentAppUsageParams {
  range: AppUsageRange;
  timeZone?: string;
}

export interface KnorviaAgentTaskTokenUsageParams extends KnorviaAgentSessionTarget {}

export interface KnorviaAgentReadSessionParams extends KnorviaAgentSessionTarget {
  deliveryKind?: KnorviaDeliveryKind;
  messageLimit?: number;
  afterSeq?: number;
  /** 被动索引/观察者只能读取现有 runtime，禁止为了读快照拉起 session。 */
  runtimePolicy?: KnorviaAgentRuntimePolicy;
}

export interface KnorviaAgentReadSessionMessagesParams extends KnorviaAgentSessionTarget {
  afterMessageId?: string;
  limit?: number;
}

export interface KnorviaAgentReadSessionEventsParams extends KnorviaAgentSessionTarget {
  afterSeq?: number;
  limit?: number;
}

export type KnorviaAgentReadWorkspacePresentationParams = KnorviaAgentWorkspaceTarget;

export interface KnorviaAgentGrantWorkspaceHookTrustParams extends KnorviaAgentWorkspaceTarget {
  bundleDigest: string;
  hookDeclarationDigest: string;
}

export interface KnorviaAgentSendPromptParamsBase extends KnorviaAgentSessionTarget {
  modelSelection?: ModelSelection;
  modelExecution?: import("@knorvia/shared/protocol-v4").CommandPayloadMap["sendText"]["modelExecution"];
  inputId?: string;
  queryId?: string;
  messageId?: string;
  sessionTraceId?: TraceId;
  content: string;
  attachments?: Record<string, unknown>[];
  /** provider-only 的当前 IAB 状态；UI/session persistence 仍使用 content 原文。 */
  browserAmbientContext?: KnorviaBrowserAmbientContext;
  clientMode?: KnorviaTaskClientMode;
  expectedRevision?: number;
  expectedProviderRevision?: string;
  runtimeProviderHeaders?: Record<string, string>;
  toolDenylist?: string[];
}

export type KnorviaAgentSendPromptParams = KnorviaAgentSendPromptParamsBase &
  KnorviaBackgroundTurnAttribution;

export interface KnorviaAgentCompactParams extends KnorviaAgentSessionTarget {
  inputId?: string;
  instructions?: string;
  expectedRevision?: number;
}

export interface KnorviaAgentGoalParams extends KnorviaAgentSessionTarget {
  inputId?: string;
  action: KnorviaSessionGoalAction;
  objective?: string;
  expectedRevision?: number;
}

export interface KnorviaAgentSetModelParams extends KnorviaAgentSessionTarget {
  model: ModelSelection;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface KnorviaAgentSetThoughtLevelParams extends KnorviaAgentSessionTarget {
  thoughtLevel?: string;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface KnorviaAgentSetModeParams extends KnorviaAgentSessionTarget {
  mode: KnorviaSessionMode;
  expectedRevision?: number;
}

export interface KnorviaAgentGenerateWorkspaceTextParams extends KnorviaAgentWorkspaceTarget {
  selection: KnorviaWorkspaceGenerateTextParams["selection"];
  prompt?: string;
  messages?: KnorviaWorkspaceGenerateTextParams["messages"];
  tools?: KnorviaWorkspaceGenerateTextParams["tools"];
  querySource: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  /**
   * 协议层 RPC 超时。thinking 模型的长请求会超过协议 client 默认的
   * 3 分钟；调用方必须把自身 deadline 透传到这里，否则默认超时先触发、
   * 还会被 onRequestTimeout 误判 stale 杀进程。
   */
  requestTimeoutMs?: number;
}

export interface KnorviaAgentTestModelConnectivityParams extends KnorviaAgentWorkspaceTarget {
  selection: KnorviaProviderTestModelConnectivityParams["selection"];
  signal?: AbortSignal;
}

export interface KnorviaAgentSessionRuntimePreferencesRequest extends KnorviaSessionRequestRuntimePreferencesParams {
  requestId: string;
}

export interface KnorviaAgentRespondSessionRuntimePreferencesParams {
  requestId: string;
  resolution:
    | { status: "resolved"; preferences: KnorviaSessionRuntimePreferencesResult }
    | { status: "failed"; message: string };
}

export interface KnorviaAgentSessionSubscribeParams extends KnorviaAgentSessionTarget {
  deliveryKind: KnorviaDeliveryKind;
  afterSeq?: number;
  includeSnapshot?: boolean;
  eventCoalescing?: {
    mode: "background-summary";
    intervalMs?: number;
  };
}

// ── v4 conversation 通道（竖切）──
// host 只做转发：subscribe/unsubscribe/command 透传给 CLI v4 gateway，
// v4/conversation/frame 通知按 workspace fan-out 给 renderer。

export interface KnorviaAgentConversationSubscribeParams extends KnorviaAgentSessionTarget {
  /** 水位不变量：仅当客户端真持有该时刻一致状态才允许带。 */
  base?: { logEpoch: string; seq: number };
  visibility?: "foreground" | "background";
}

export interface KnorviaAgentConversationUnsubscribeParams extends KnorviaAgentWorkspaceTarget {
  subscriptionId: string;
  runtimePolicy?: KnorviaAgentRuntimePolicy;
}

export interface KnorviaAgentConversationResyncParams extends KnorviaAgentWorkspaceTarget {
  subscriptionId: string;
  base: { logEpoch: string; seq: number } | null;
  forceSnapshot?: boolean;
  runtimePolicy?: KnorviaAgentRuntimePolicy;
}

/** 行分页 query（rows/range）：按游标向上取一窗历史行。 */
export interface KnorviaAgentConversationRowsRangeParams extends KnorviaAgentSessionTarget {
  /** 取 rowId < beforeRowId 的行；缺省 = 从当前尾部向前。 */
  beforeRowId?: number;
  /** 1..rowsRangeMaxLimit（200）。 */
  limit: number;
}

/** 当前有效分支里的终态 ExitPlanMode 目录。 */
export type KnorviaAgentConversationPlansParams = KnorviaAgentSessionTarget;

/** workflow run 的事件日志分页（详情页审计面）；cursor = journal sequence。 */
export interface KnorviaAgentConversationWorkflowRunEventsParams extends KnorviaAgentSessionTarget {
  runId: string;
  afterSequence?: number;
  limit?: number;
}

/** dwf run 的枚举（重启后的发现查询）。 */
export interface KnorviaAgentConversationWorkflowRunsParams extends KnorviaAgentSessionTarget {
  limit?: number;
}

// ── dwf 用户面产物──
// ⚠ 术语：artifact = 脚本经 `artifact.*` 发布给**用户**看的产出（文件 / markdown / 预置看板），
// 不是 run 的顶层返回值（引擎内部对后者的同名叫法）。

/** 产物清单；UI 冷恢复与中枢详情的 durable 读法。 */
export interface KnorviaAgentConversationWorkflowRunArtifactsParams extends KnorviaAgentSessionTarget {
  runId: string;
}

/** 预置看板的取数面；cursor = journal sequence（严格大于）。 */
export interface KnorviaAgentConversationWorkflowRunArtifactDataParams extends KnorviaAgentSessionTarget {
  runId: string;
  artifactId: string;
  afterSequence?: number;
  limit?: number;
}

/** 内容产物的字节，一次一块（≤ 512 KiB，形状逐字照 attachmentRead）。 */
export interface KnorviaAgentConversationWorkflowRunArtifactReadParams extends KnorviaAgentSessionTarget {
  runId: string;
  artifactId: string;
  version: number;
  offset: number;
  limit: number;
}

// ── dwf 工作区 transcript──
/** 轻行清单：一个 run 的 files.* / git.* / world.run 行，不带正文。 */
export interface KnorviaAgentConversationWorkflowRunWorkspaceParams extends KnorviaAgentSessionTarget {
  runId: string;
}

/** 一个工作区节点的正文，按 maxBytes 保形有界化（缺省与上限在 CLI 网关侧）。 */
export interface KnorviaAgentConversationWorkflowRunNodeResultParams extends KnorviaAgentSessionTarget {
  runId: string;
  siteId: string;
  ordinal: number;
  maxBytes?: number;
}

export interface KnorviaAgentBackgroundBashOutputParams extends KnorviaAgentSessionTarget {
  workId: string;
}

export interface KnorviaAgentConversationFileChangesParams extends KnorviaAgentSessionTarget {
  target: ConversationRowTarget;
  baseRevision: number;
  baseLogEpoch: string;
}

export interface KnorviaAgentConversationFileRewindPreviewParams extends KnorviaAgentSessionTarget {
  target: ConversationRowTarget;
  baseRevision: number;
  baseLogEpoch: string;
}

export interface KnorviaAgentConversationCommandParams extends KnorviaAgentWorkspaceTarget {
  envelope: CommandEnvelope;
  /** 仅 host 内部用于 Browser Use runtime 边界，不进入 v4 wire envelope。 */
  clientMode?: KnorviaTaskClientMode;
}

export interface KnorviaAgentCommandsQueryParams extends KnorviaAgentWorkspaceTarget {
  clock?: true;
  commands: CommandKey[];
}

/** UI 不携带 connectionId；connection scope 以 trusted carrier 注入 wire identity。 */
export interface KnorviaAgentAttachmentBeginParams extends KnorviaAgentSessionTarget {
  uploadId: string;
  fileName: string;
  mime: string;
  totalBytes: number;
  totalChunks: number;
  checksum: string;
}

export interface KnorviaAgentAttachmentChunkParams extends KnorviaAgentSessionTarget {
  uploadId: string;
  chunkIndex: number;
  dataBase64: string;
}

export interface KnorviaAgentAttachmentTerminalParams extends KnorviaAgentSessionTarget {
  uploadId: string;
}

export interface KnorviaAgentAttachmentReadParams extends KnorviaAgentSessionTarget {
  ref: string;
  target?: ConversationRowTarget;
  attachmentIndex?: number;
  offset: number;
  limit: number;
}

export interface KnorviaAgentConversationAttachmentReadParams extends KnorviaAgentSessionTarget {
  ref: string;
  target: ConversationRowTarget;
  attachmentIndex: number;
  offset: number;
  limit: number;
}

export interface KnorviaAgentConversationAttachmentStatParams extends KnorviaAgentSessionTarget {
  ref: string;
  target: ConversationRowTarget;
  attachmentIndex: number;
}

export interface KnorviaAgentAttachmentPreviewSourceParams extends KnorviaAgentSessionTarget {
  ref: string;
  target?: ConversationRowTarget;
  attachmentIndex?: number;
}

/** host scope 内部 transport 控制面；connectionId 只能经 trusted carrier 注入。 */
export interface KnorviaAgentConnectionFlowParams extends KnorviaAgentWorkspaceTarget {
  state: V4ConnectionFlowState;
}

/** sessions-index：workspace 级列表订阅（无 sessionId 维度）。 */
export interface KnorviaAgentSessionsIndexSubscribeParams extends KnorviaAgentWorkspaceTarget {
  base?: { logEpoch: string; seq: number };
  visibility?: "foreground" | "background";
  /**
   * 订阅者作用域后缀：CLI 侧重订阅替换按 (connectionId, topic) 判定，
   * host 进程内多个独立消费者（renderer 侧栏 / task-index syncer）订阅同一 topic 时
   * 必须用不同 connectionId，否则互相替换对方的订阅代际。缺省共享 host 连接 id。
   */
  subscriberScope?: string;
  /**
   * task-list 等被动观察者必须使用 existing-only；runtime 不存在时返回稳定 unavailable，
   * 禁止为了建立列表订阅而启动 Agent。缺省保持显式会话入口的旧行为。
   */
  runtimePolicy?: KnorviaAgentRuntimePolicy;
}

/** workspace-config：workspace 级配置目录订阅（config options + slash 目录）。 */
export interface KnorviaAgentWorkspaceConfigSubscribeParams extends KnorviaAgentWorkspaceTarget {
  base?: { logEpoch: string; seq: number };
  visibility?: "foreground" | "background";
  subscriberScope?: string;
  runtimePolicy?: KnorviaAgentRuntimePolicy;
}

export type KnorviaAgentServiceEvent =
  | { type: "session.event"; event: KnorviaSessionEvent }
  | { type: "state.updated"; notification: KnorviaStateUpdatedNotification }
  | { type: "permission.request"; request: KnorviaPermissionRequestParams }
  | { type: "userInput.request"; request: KnorviaUserInputRequestParams }
  | {
      type: "userInput.response";
      requestId: string;
      response: KnorviaUserInputResponse;
    }
  | { type: "snapshot"; snapshot: KnorviaSessionStateSnapshot };

export interface KnorviaAgentAppRuntimePreferences {
  askUserQuestionAutoResolutionEnabled: boolean;
  modelIoFullRetentionEnabled?: boolean;
}

export interface KnorviaAgentLocalRuntimeChildProcesses {
  pid: number;
  provider: string;
  workspacePath: string;
  lane?: string;
  children: KnorviaProcessChildProcess[];
}

export interface KnorviaAgentStorageStartupSnapshot {
  generation: number;
  state: KnorviaStorageStartupState | null;
}

export interface IKnorviaAgentService {
  /** 控制面不需要账号或模型，且不发送普通协议请求。 */
  prepareStorage(params: KnorviaAgentWorkspaceTarget): Promise<void>;
  getStorageStartupState(
    params: KnorviaAgentWorkspaceTarget,
  ): Promise<KnorviaAgentStorageStartupSnapshot | null>;
  onDynamicStorageStartupState(
    params: KnorviaAgentWorkspaceTarget,
  ): Event<KnorviaAgentStorageStartupSnapshot>;
  initialize(params: KnorviaAgentWorkspaceTarget): Promise<KnorviaAgentInitializeResult>;
  /**
   * 同步 App 全局运行时偏好到所有已活动 workspace；不得为此启动空闲 Agent。
   */
  syncAppRuntimePreferences(preferences: KnorviaAgentAppRuntimePreferences): Promise<void>;
  getWorkspaceRuntimeIdentity(
    params: KnorviaAgentWorkspaceTarget,
  ): Promise<KnorviaAgentWorkspaceRuntimeIdentity>;
  createSession(params: KnorviaAgentCreateSessionParams): Promise<KnorviaSessionStateSnapshot>;
  resumeSession(params: KnorviaAgentResumeSessionParams): Promise<KnorviaSessionStateSnapshot>;
  listSessions(params: KnorviaAgentListSessionsParams): Promise<KnorviaSessionInfo[]>;
  listSessionSubagents(
    params: KnorviaAgentListSessionSubagentsParams,
  ): Promise<KnorviaSessionSubagentsResult>;
  getAppUsageStats(params: KnorviaAgentAppUsageParams): Promise<AppUsageSnapshot>;
  getTaskTokenUsage(params: KnorviaAgentTaskTokenUsageParams): Promise<KnorviaTaskTokenUsageResult>;
  readSession(params: KnorviaAgentReadSessionParams): Promise<KnorviaSessionStateSnapshot>;
  readSessionMessages(
    params: KnorviaAgentReadSessionMessagesParams,
  ): Promise<KnorviaMessageWithParts[]>;
  readSessionDebug(params: KnorviaAgentSessionTarget): Promise<SessionDebugSnapshot>;
  readSessionEvents(params: KnorviaAgentReadSessionEventsParams): Promise<KnorviaSessionEvent[]>;
  readWorkspacePresentation(
    params: KnorviaAgentReadWorkspacePresentationParams,
  ): Promise<KnorviaWorkspacePresentation>;
  /** 无 task/session 的 Settings 预信任；Agent 会重新发现并校验 canonical snapshot。 */
  grantWorkspaceHookTrust(
    params: KnorviaAgentGrantWorkspaceHookTrustParams,
  ): Promise<KnorviaWorkspaceHookTrustGrantResult>;
  listMcpServerStatuses(params: KnorviaAgentListMcpServerStatusesParams): Promise<KnorviaMcpListResult>;
  listPlugins(params: KnorviaAgentPluginViewParams): Promise<KnorviaPluginsListResult>;
  /**
   * Plugin 对话引用 catalog：session-scoped 只读投影。
   * 走 workspace 级 agent client（session 记录只存在于该进程），不走独立插件管理进程。
   */
  getPluginReferenceCatalog(
    params: KnorviaAgentPluginReferenceCatalogParams,
  ): Promise<KnorviaPluginsReferenceCatalogResult>;
  /** Composer Skill 引用 catalog；带 sessionId 时读取该 runtime 的冻结快照。 */
  getSkillReferenceCatalog(
    params: KnorviaAgentSkillReferenceCatalogParams,
  ): Promise<KnorviaSkillsReferenceCatalogResult>;
  // 已保存工作流的 GUI 中枢：workspace 级、无会话，每次调用现扫 `<cwd>/.knorvia-studio/workflows/`。
  // 全局档传 `scope: "global"`：带 workspace 就用它当载体，不带则由 services 层自选本机载体运行时。
  listSavedWorkflows(params: KnorviaAgentListSavedWorkflowsParams): Promise<KnorviaWorkflowsListResult>;
  getSavedWorkflow(params: KnorviaAgentGetSavedWorkflowParams): Promise<KnorviaWorkflowsGetResult>;
  updateSavedWorkflowMeta(
    params: KnorviaAgentUpdateSavedWorkflowMetaParams,
  ): Promise<KnorviaWorkflowsUpdateMetaResult>;
  deleteSavedWorkflow(
    params: KnorviaAgentDeleteSavedWorkflowParams,
  ): Promise<KnorviaWorkflowsDeleteResult>;
  listSavedWorkflowRuns(
    params: KnorviaAgentListSavedWorkflowRunsParams,
  ): Promise<KnorviaWorkflowsRunsResult>;
  // 在项目档 / 全局档之间移动同名文件：
  // `workspace` 是载体（移到项目传目标项目、移到全局传源项目），`to` 是落点档；不覆盖已存在的目标。
  moveSavedWorkflow(params: KnorviaAgentMoveSavedWorkflowParams): Promise<KnorviaWorkflowsMoveResult>;
  resolveSuggestedPluginReference(
    params: KnorviaAgentResolveSuggestedPluginReferenceParams,
  ): Promise<import("@knorvia/shared").KnorviaPluginsResolveSuggestedReferenceResult>;
  /** 推荐项 Plugin 首次本地检查缺失后的 operation-scoped 刷新进度。 */
  onDynamicPluginOperationProgress(
    operationId: string,
  ): Event<KnorviaPluginOperationProgressNotification>;
  getPluginsOverview(params: KnorviaAgentPluginViewParams): Promise<KnorviaPluginsOverviewResult>;
  /**
   * 资源管理器：枚举本 Host 内全部本地 Agent 进程（含 plugin / mcp-status 泳道），
   * 并向每个存活 runtime 请求 `process/childProcesses`；单个 runtime 失败只让它的 children 为空。
   */
  collectLocalRuntimeChildProcesses(
    signal?: AbortSignal,
  ): Promise<KnorviaAgentLocalRuntimeChildProcesses[]>;
  addPluginMarketplace(
    params: KnorviaAgentAddPluginMarketplaceParams,
  ): Promise<KnorviaPluginsMarketplaceMutationResult>;
  removePluginMarketplace(
    params: KnorviaAgentRemovePluginMarketplaceParams,
  ): Promise<KnorviaPluginsMarketplaceMutationResult>;
  updatePluginMarketplace(
    params: KnorviaAgentUpdatePluginMarketplaceParams,
  ): Promise<KnorviaPluginsMarketplaceMutationResult>;
  installPlugin(params: KnorviaAgentInstallPluginParams): Promise<KnorviaPluginsInstallResult>;
  cancelPluginOperation(
    params: KnorviaAgentCancelPluginOperationParams,
  ): Promise<KnorviaPluginsCancelOperationResult>;
  uninstallPlugin(params: KnorviaAgentUninstallPluginParams): Promise<KnorviaPluginsUninstallResult>;
  updatePlugin(params: KnorviaAgentUpdatePluginParams): Promise<KnorviaPluginsInstallResult>;
  restoreBuiltinPlugin(
    params: KnorviaAgentRestoreBuiltinPluginParams,
  ): Promise<KnorviaPluginsRestoreBuiltinResult>;
  configurePlugin(params: KnorviaAgentConfigurePluginParams): Promise<KnorviaPluginsConfigureResult>;
  resetPluginConfig(
    params: KnorviaAgentResetPluginConfigParams,
  ): Promise<KnorviaPluginsConfigureResult>;
  validatePlugin(params: KnorviaAgentValidatePluginParams): Promise<KnorviaPluginsValidateResult>;
  describePlugin(params: KnorviaAgentDescribePluginParams): Promise<KnorviaPluginsDescribeResult>;
  setPluginEnabled(params: KnorviaAgentSetPluginEnabledParams): Promise<KnorviaPluginsSetEnabledResult>;
  // ---- 定时任务(automation)管理 ----
  listAutomations(params: KnorviaAgentWorkspaceTarget): Promise<KnorviaAutomation[]>;
  listAllAutomations(): Promise<KnorviaAutomation[]>;
  createAutomation(params: KnorviaAgentCreateAutomationParams): Promise<KnorviaAutomation>;
  updateAutomation(params: KnorviaAgentUpdateAutomationParams): Promise<KnorviaAutomation | null>;
  deleteAutomation(params: KnorviaAgentAutomationIdParams): Promise<void>;
  setAutomationEnabled(params: KnorviaAgentSetAutomationEnabledParams): Promise<void>;
  restartAutomation(params: KnorviaAgentAutomationIdParams): Promise<void>;
  runAutomationNow(params: KnorviaAgentAutomationIdParams): Promise<KnorviaAgentRunAutomationNowResult>;
  listAutomationRuns(params: KnorviaAgentAutomationIdParams): Promise<KnorviaAutomationRun[]>;
  deleteAutomationRun(params: KnorviaAgentDeleteAutomationRunParams): Promise<void>;
  generateWorkspaceText(
    params: KnorviaAgentGenerateWorkspaceTextParams,
  ): Promise<KnorviaWorkspaceGenerateTextResult>;
  testModelConnectivity(
    params: KnorviaAgentTestModelConnectivityParams,
  ): Promise<KnorviaProviderTestModelConnectivityResult>;
  /**
   * @deprecated：send 主路径已收敛 v4 sendText 命令。仅剩两个消费点——
   * adapter 带附件输入回退（待附件命令面落地后移除）与 sessionService
   * pass-through；新代码禁止回用。
   */
  sendPrompt(params: KnorviaAgentSendPromptParams): Promise<KnorviaSessionSendResult>;
  compactSession(params: KnorviaAgentCompactParams): Promise<KnorviaSessionCompactResult>;
  goalSession(params: KnorviaAgentGoalParams): Promise<KnorviaSessionGoalResult>;
  closeSession(
    params: KnorviaAgentSessionTarget & { expectedPersistence?: "deferred" | "immediate" },
  ): Promise<boolean>;
  setModel(params: KnorviaAgentSetModelParams): Promise<KnorviaSessionStateSnapshot>;
  setThoughtLevel(params: KnorviaAgentSetThoughtLevelParams): Promise<KnorviaSessionStateSnapshot>;
  setMode(params: KnorviaAgentSetModeParams): Promise<KnorviaSessionStateSnapshot>;
  respondSessionRuntimePreferences(
    params: KnorviaAgentRespondSessionRuntimePreferencesParams,
  ): Promise<void>;
  onDynamicSessionRuntimePreferencesRequest(): Event<KnorviaAgentSessionRuntimePreferencesRequest>;
  /**
   * CLI 进程级资源样本，带 services 打的 lane 标签（CLI 自己不知道 lane）。
   * 使用 dynamic event 避免 RPC 服务在无人订阅时缓冲周期事件；
   * 该事件不属于 session/conversation continuous 或 replayable 状态。
   */
  onDynamicProcessResourceSample(): Event<AgentLaneResourceSample>;
  /** MCP 进程生命周期与低频内存事件，仅供可信 Host relay 上报 ARMS。 */
  onDynamicMcpTelemetry(): Event<KnorviaMcpTelemetryEvent>;
  /** MCP 进程树资源事实，只供可信 Host 汇总上报。 */
  onDynamicMcpResourceSamples(): Event<KnorviaMcpResourceSample[]>;
  /** Bash 完成事实，仅可信 Host 资源旁路订阅。 */
  onDynamicToolExecResource(): Event<KnorviaToolExecResource>;
  /**
   * @deprecated 旧协议订阅面（session/subscribe + session/event + state.updated）。
   * task-index syncer 已迁 v4 sessions-index/workspace-config 帧；
   * 仅剩 taskServiceAdapter.onDynamicTaskEvent（replayable 读路径）消费。
   * 写路径已收敛 v4 命令面；本订阅是读路径投影源。
   */
  onDynamicSessionEvent(params: KnorviaAgentSessionSubscribeParams): Event<KnorviaAgentServiceEvent>;
  // ── v4 conversation 通道（竖切）──
  /** RPC attachment 建立后先读取 host 可信 hello。 */
  helloConversationV4(): Promise<HelloMessage>;
  /** hello 校验后回送 clientHello；metadata 不能覆盖 connection mode/profile。 */
  initializeConversationV4(clientHello: ClientHello): Promise<void>;
  /** 仅供 trusted host relay/facade；terminal RPC caller 必须被 connection scope 拒绝。 */
  setConnectionFlowStateV4(params: KnorviaAgentConnectionFlowParams): Promise<void>;
  subscribeConversationV4(
    params: KnorviaAgentConversationSubscribeParams,
  ): Promise<V4ConversationSubscribeResult>;
  resyncConversationV4(
    params: KnorviaAgentConversationResyncParams,
  ): Promise<V4ConversationResyncResult>;
  unsubscribeConversationV4(params: KnorviaAgentConversationUnsubscribeParams): Promise<void>;
  /** rows/range 行分页 query（loadOlder 游标向上补历史）。 */
  conversationRowsRangeV4(
    params: KnorviaAgentConversationRowsRangeParams,
  ): Promise<V4ConversationRowsRangeResult>;
  conversationPlansV4(
    params: KnorviaAgentConversationPlansParams,
  ): Promise<V4ConversationPlansResult>;
  /** workflow run 事件日志分页；与 plans 同族（只读、无状态、超时重发安全）。 */
  conversationWorkflowRunEventsV4(
    params: KnorviaAgentConversationWorkflowRunEventsParams,
  ): Promise<V4ConversationWorkflowRunEventsResult>;
  /** workflow run 枚举；journal-backed 的重启后发现面。 */
  conversationWorkflowRunsV4(
    params: KnorviaAgentConversationWorkflowRunsParams,
  ): Promise<V4ConversationWorkflowRunsResult>;
  /** workflow run 的用户面产物清单；与 plans 同族（只读、无状态、超时重发安全）。 */
  conversationWorkflowRunArtifactsV4(
    params: KnorviaAgentConversationWorkflowRunArtifactsParams,
  ): Promise<V4ConversationWorkflowRunArtifactsResult>;
  /** 预置看板的条目分页；hook 以 itemCount 变化为信号增量拉取。 */
  conversationWorkflowRunArtifactDataV4(
    params: KnorviaAgentConversationWorkflowRunArtifactDataParams,
  ): Promise<V4ConversationWorkflowRunArtifactDataResult>;
  /** 内容产物的字节，一次一块；授权在 CLI 侧（journal 行才是取字节的依据）。 */
  conversationWorkflowRunArtifactReadV4(
    params: KnorviaAgentConversationWorkflowRunArtifactReadParams,
  ): Promise<V4ConversationWorkflowRunArtifactReadResult>;
  /** dwf 工作区 transcript 的清单。 */
  conversationWorkflowRunWorkspaceV4(
    params: KnorviaAgentConversationWorkflowRunWorkspaceParams,
  ): Promise<V4ConversationWorkflowRunWorkspaceResult>;
  /** 一个工作区节点的有界正文。 */
  conversationWorkflowRunNodeResultV4(
    params: KnorviaAgentConversationWorkflowRunNodeResultParams,
  ): Promise<V4ConversationWorkflowRunNodeResultResult>;
  backgroundBashOutputV4(
    params: KnorviaAgentBackgroundBashOutputParams,
  ): Promise<BackgroundBashOutputResult>;
  conversationFileChangesV4(
    params: KnorviaAgentConversationFileChangesParams,
  ): Promise<V4ConversationFileChangesResult>;
  conversationFileRewindPreviewV4(
    params: KnorviaAgentConversationFileRewindPreviewParams,
  ): Promise<V4ConversationFileRewindPreviewResult>;
  sendConversationCommandV4(params: KnorviaAgentConversationCommandParams): Promise<CommandAck>;
  queryConversationCommandsV4(params: KnorviaAgentCommandsQueryParams): Promise<CommandsQueryResult>;
  attachmentBeginV4(params: KnorviaAgentAttachmentBeginParams): Promise<V4AttachmentBeginResult>;
  attachmentChunkV4(params: KnorviaAgentAttachmentChunkParams): Promise<V4AttachmentChunkResult>;
  attachmentCommitV4(params: KnorviaAgentAttachmentTerminalParams): Promise<V4AttachmentCommitResult>;
  attachmentAbortV4(params: KnorviaAgentAttachmentTerminalParams): Promise<void>;
  /** Desktop local 已发送视频 source query；远端与 Web 返回 chunked。 */
  attachmentPreviewSourceV4(
    params: KnorviaAgentAttachmentPreviewSourceParams,
  ): Promise<V4AttachmentPreviewSourceResult>;
  /** 已发送 image/video 只读分块查询；connection scope 注入可信 workspace 连接。 */
  attachmentReadV4(params: KnorviaAgentAttachmentReadParams): Promise<V4AttachmentReadResult>;
  /** Share 读取 userInput 附件，允许 text/plain 等非媒体类型。 */
  conversationAttachmentReadV4(
    params: KnorviaAgentConversationAttachmentReadParams,
  ): Promise<V4ConversationAttachmentReadResult>;
  /** Share 选择阶段只读 userInput 附件元数据，不读取完整内容。 */
  conversationAttachmentStatV4(
    params: KnorviaAgentConversationAttachmentStatParams,
  ): Promise<V4ConversationAttachmentStatResult>;
  /** workspace 级下行帧流（v4/conversation/frame），renderer 侧按 topic 自行路由。 */
  onDynamicConversationFrame(
    params: KnorviaAgentWorkspaceTarget,
  ): Event<ConversationTopicWireCandidate>;
  /** workspace 级 live telemetry 事实；connection facade 仅向可信 desktop-continuous 下游暴露。 */
  onDynamicLocalTtftFacts(
    params: KnorviaAgentWorkspaceTarget,
  ): Event<import("@knorvia/shared").LocalTtftFacts>;
  onDynamicConversationTelemetryFact(
    params: KnorviaAgentWorkspaceTarget,
  ): Event<ConversationTelemetryFact>;
  /** 当前窗口全部本地 live task 的 CUA 权限观察；历史、远程与 replayable 不在此事件面。 */
  onDynamicCuaPermissionObservation(): Event<KnorviaAgentCuaPermissionObservation>;
  // ── sessions-index 通道（列表活性）──
  subscribeSessionsIndexV4(
    params: KnorviaAgentSessionsIndexSubscribeParams,
  ): Promise<V4SessionsIndexSubscribeResult>;
  resyncSessionsIndexV4(
    params: KnorviaAgentConversationResyncParams,
  ): Promise<V4ConversationResyncResult>;
  unsubscribeSessionsIndexV4(params: KnorviaAgentConversationUnsubscribeParams): Promise<void>;
  /** workspace 级 sessions-index 下行帧流（与 conversation 同一通知，按 topic 前缀分流）。 */
  onDynamicSessionsIndexFrame(
    params: KnorviaAgentWorkspaceTarget,
  ): Event<SessionsIndexTopicWireCandidate>;
  // ── workspace-config 通道（配置目录活性；task-index syncer 消费）──
  subscribeWorkspaceConfigV4(
    params: KnorviaAgentWorkspaceConfigSubscribeParams,
  ): Promise<V4WorkspaceConfigSubscribeResult>;
  resyncWorkspaceConfigV4(
    params: KnorviaAgentConversationResyncParams,
  ): Promise<V4ConversationResyncResult>;
  unsubscribeWorkspaceConfigV4(params: KnorviaAgentConversationUnsubscribeParams): Promise<void>;
  /** workspace 级 workspace-config 下行帧流（与 conversation 同一通知，按 topic 前缀分流）。 */
  onDynamicWorkspaceConfigFrame(
    params: KnorviaAgentWorkspaceTarget,
  ): Event<WorkspaceConfigTopicWireCandidate>;
  /**
   * （CLI 重连重订）：agent 进程换代通知（超时回收/崩溃后重新拉起）。
   * v4 订阅活在 CLI 进程内存，进程换代即失效；订阅方（task-index syncer 等）
   * 收到后必须对该 workspaceKey 重发 subscribe，否则帧流静默中断。
   */
  onAgentRuntimeRestarted(listener: (event: { workspaceKey: string }) => void): IDisposable;
  /**
   * Agent client 在 service 内完成登记后发布 available，当前 client 关闭后发布 unavailable。
   * 这是被动 observer attach/detach 的唯一生命周期信号，不表达用户使用租约。
   */
  onAgentRuntimeLifecycle?: (
    listener: (event: KnorviaAgentRuntimeLifecycleEvent) => void,
  ) => IDisposable;
  /** 当前 desktop-local CUA turn 是否仍在执行，用于 Helper recovery 避免中途回收 Agent。 */
  hasActiveCuaOperationTurn(): boolean;
  disposeWorkspace(params: KnorviaAgentWorkspaceTarget): Promise<void>;
  disposeAll(): void;
}

export const IKnorviaAgentService = createServiceDescriptor<IKnorviaAgentService>(
  ServiceChannels.KnorviaAgent,
);
