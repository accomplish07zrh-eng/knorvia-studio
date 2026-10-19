# services-01 接口（interface.md）

本文件只列**兼容所需的模块路径、导出名、参数与返回类型**：替换包必须让这些模块路径与导出在编译产物中保持可用，签名不变。行为见 `behavior.md`，调用方见 `callers.md`。

机器生成：`node --import tsx specs/contracts/services-01/tests/gen-interface.mjs`（抽取器 `tests/exports-ast.mjs`，范围真源 `tests/scope.mjs` / `scope-files.json`）。**不要手改**；B2 的 oracle 是本文件的导出声明块。

覆盖范围：`packages/services/src/` 下 7 个目录的 **58 个 .ts 文件 / 336 项顶层导出**（另有 2 份继承文档，见 README）。

## 兼容入口面（重写后必须原样可用）

- **根桶 `@knorvia/services`（`src/index.ts` / `dist/index.js`）**：浏览器安全的类型与 descriptor 面。
- **Node 组合入口 `@knorvia/services/node`（`src/node.ts` / `dist/node.js`）**：Host/Server/CLI 的装配面。
- **子路径**：`@knorvia/services/cua-permission-broker`（`src/cua-permission-broker/index.ts`）、`@knorvia/services/storage-startup`、`@knorvia/services/process/processTreeTerminator`、`@knorvia/services/window-controller`。
- **包内深层路径**：本文件逐节列出。包内调用方（`node.ts`、`taskServiceAdapter.ts`、`taskIndexSyncer.ts` 等）按相对路径或 `#src/*` 引用；重写时模块路径与导出名必须保持可用，内部拆文件可以，但不得让调用方改导入。
- `cua-permission-broker/index.ts` 的 `export * from "@knorvia/cua/broker/server"` 是**委托面**：名字归属生产包 `@knorvia/cua`，本包只冻结再导出关系，不复制实现。

## 不在兼容面上的东西

- `packages/services/src/index.ts`、`node.ts` 与 6 个子路径入口桶不在本包 60 文件范围内（它们是 original）；本合同把它们当**调用方与装配面**读取。
- `git/`、`session/`、`plugins/`、`process/`、`runtime-tools/` 等目录不在本次 60 文件范围；替换阶段不得顺手改动。

## agent（协议、进程与会话运行时）（31 个文件）

### `packages/services/src/agent/agent.ts`

导出 66 项（运行时 2 / 纯类型 64），分类 `unreviewed`。签名逐字取自源码。

```ts
export * from "./agentPluginParams.js";
export * from "./agentWorkflowParams.js";
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
export interface KnorviaAgentConversationRowsRangeParams extends KnorviaAgentSessionTarget {
  /** 取 rowId < beforeRowId 的行；缺省 = 从当前尾部向前。 */
  beforeRowId?: number;
  /** 1..rowsRangeMaxLimit（200）。 */
  limit: number;
}
export type KnorviaAgentConversationPlansParams = KnorviaAgentSessionTarget;
export interface KnorviaAgentConversationWorkflowRunEventsParams extends KnorviaAgentSessionTarget {
  runId: string;
  afterSequence?: number;
  limit?: number;
}
export interface KnorviaAgentConversationWorkflowRunsParams extends KnorviaAgentSessionTarget {
  limit?: number;
}
export interface KnorviaAgentConversationWorkflowRunArtifactsParams extends KnorviaAgentSessionTarget {
  runId: string;
}
export interface KnorviaAgentConversationWorkflowRunArtifactDataParams extends KnorviaAgentSessionTarget {
  runId: string;
  artifactId: string;
  afterSequence?: number;
  limit?: number;
}
export interface KnorviaAgentConversationWorkflowRunArtifactReadParams extends KnorviaAgentSessionTarget {
  runId: string;
  artifactId: string;
  version: number;
  offset: number;
  limit: number;
}
export interface KnorviaAgentConversationWorkflowRunWorkspaceParams extends KnorviaAgentSessionTarget {
  runId: string;
}
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
export interface KnorviaAgentConnectionFlowParams extends KnorviaAgentWorkspaceTarget {
  state: V4ConnectionFlowState;
}
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
  listMcpServerStatuses(
    params: KnorviaAgentListMcpServerStatusesParams,
  ): Promise<KnorviaMcpListResult>;
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
  listSavedWorkflows(
    params: KnorviaAgentListSavedWorkflowsParams,
  ): Promise<KnorviaWorkflowsListResult>;
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
  moveSavedWorkflow(
    params: KnorviaAgentMoveSavedWorkflowParams,
  ): Promise<KnorviaWorkflowsMoveResult>;
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
  uninstallPlugin(
    params: KnorviaAgentUninstallPluginParams,
  ): Promise<KnorviaPluginsUninstallResult>;
  updatePlugin(params: KnorviaAgentUpdatePluginParams): Promise<KnorviaPluginsInstallResult>;
  restoreBuiltinPlugin(
    params: KnorviaAgentRestoreBuiltinPluginParams,
  ): Promise<KnorviaPluginsRestoreBuiltinResult>;
  configurePlugin(
    params: KnorviaAgentConfigurePluginParams,
  ): Promise<KnorviaPluginsConfigureResult>;
  resetPluginConfig(
    params: KnorviaAgentResetPluginConfigParams,
  ): Promise<KnorviaPluginsConfigureResult>;
  validatePlugin(params: KnorviaAgentValidatePluginParams): Promise<KnorviaPluginsValidateResult>;
  describePlugin(params: KnorviaAgentDescribePluginParams): Promise<KnorviaPluginsDescribeResult>;
  setPluginEnabled(
    params: KnorviaAgentSetPluginEnabledParams,
  ): Promise<KnorviaPluginsSetEnabledResult>;
  // ---- 定时任务(automation)管理 ----
  listAutomations(params: KnorviaAgentWorkspaceTarget): Promise<KnorviaAutomation[]>;
  listAllAutomations(): Promise<KnorviaAutomation[]>;
  createAutomation(params: KnorviaAgentCreateAutomationParams): Promise<KnorviaAutomation>;
  updateAutomation(params: KnorviaAgentUpdateAutomationParams): Promise<KnorviaAutomation | null>;
  deleteAutomation(params: KnorviaAgentAutomationIdParams): Promise<void>;
  setAutomationEnabled(params: KnorviaAgentSetAutomationEnabledParams): Promise<void>;
  restartAutomation(params: KnorviaAgentAutomationIdParams): Promise<void>;
  runAutomationNow(
    params: KnorviaAgentAutomationIdParams,
  ): Promise<KnorviaAgentRunAutomationNowResult>;
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
  onDynamicSessionEvent(
    params: KnorviaAgentSessionSubscribeParams,
  ): Event<KnorviaAgentServiceEvent>;
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
  queryConversationCommandsV4(
    params: KnorviaAgentCommandsQueryParams,
  ): Promise<CommandsQueryResult>;
  attachmentBeginV4(params: KnorviaAgentAttachmentBeginParams): Promise<V4AttachmentBeginResult>;
  attachmentChunkV4(params: KnorviaAgentAttachmentChunkParams): Promise<V4AttachmentChunkResult>;
  attachmentCommitV4(
    params: KnorviaAgentAttachmentTerminalParams,
  ): Promise<V4AttachmentCommitResult>;
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
```

### `packages/services/src/agent/agentBrowserAmbientContext.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface BrowserAmbientContextExecutor {
  list(input: {
    requestId: string;
    sessionId: string;
    turnId?: string;
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode: BrowserClientMode;
    sessionContext: "live" | "cached";
  }): Promise<BrowserBackendDescriptor[]>;
  execute(input: {
    requestId: string;
    browserId?: string;
    browserGeneration?: number;
    sessionId: string;
    turnId?: string;
    workspaceKey: string;
    workspacePath: string;
    workspaceIdentity?: string;
    remoteSessionId?: string;
    clientMode: BrowserClientMode;
    sessionContext: "live" | "cached";
    command: BrowserCommand;
  }): Promise<{ ok: boolean; [key: string]: unknown }>;
}
export async function collectBrowserAmbientContext(
  executor: BrowserAmbientContextExecutor | undefined,
  target: BrowserAmbientContextTarget,
): Promise<KnorviaBrowserAmbientContext | undefined>;
```

### `packages/services/src/agent/agentConnectionScope.ts`

导出 6 项（运行时 3 / 纯类型 3），分类 `unreviewed`。签名逐字取自源码。

```ts
export type KnorviaAgentV4ClientMode = "desktop-continuous" | "web-remote-replayable";
export interface KnorviaAgentV4ConnectionContext {
  connectionId: string;
  clientMode: KnorviaAgentV4ClientMode;
  role?: "terminal-client" | "trusted-host-relay";
}
export function readTrustedKnorviaAgentV4UnsubscribeRoute(
  value: unknown,
): TrustedKnorviaAgentV4UnsubscribeRoute | null;
export function readTrustedKnorviaAgentV4Connection(
  value: unknown,
): KnorviaAgentV4ConnectionContext | null;
export interface KnorviaAgentConnectionScope {
  readonly service: IKnorviaAgentService;
  /** MessagePort/transport sideband only；不是 UI-facing RPC。 */
  setTransportFlowState(state: V4ConnectionFlowState): Promise<void>;
  dispose(): Promise<void>;
}
export function createKnorviaAgentConnectionScope(
  base: IKnorviaAgentService,
  context: KnorviaAgentV4ConnectionContext,
): KnorviaAgentConnectionScope;
```

### `packages/services/src/agent/agentErrors.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export const KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED_ERROR_CODE = "KNORVIA_AGENT_MCP_STATUS_MODE_UNSUPPORTED"
export class KnorviaAgentMcpStatusModeUnsupportedError extends Error {{ … }
export function isKnorviaAgentMcpStatusModeUnsupportedError(error: unknown): boolean
```

### `packages/services/src/agent/agentPluginParams.ts`

导出 24 项（运行时 0 / 纯类型 24），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface KnorviaAgentWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  /** 远程 workspace 的运行时会话身份；只用于隔离/路由，不能替代 workspacePath。 */
  remoteSessionId?: string;
}
export interface KnorviaAgentPluginViewParams extends KnorviaAgentWorkspaceTarget {
  configScope?: "user" | "workspace";
}
export interface KnorviaAgentListMcpServerStatusesParams extends KnorviaAgentWorkspaceTarget {
  mcpServers?: KnorviaAgentMcpServer[];
  mode?: KnorviaMcpListMode;
}
export interface KnorviaAgentAddPluginMarketplaceParams extends KnorviaAgentWorkspaceTarget {
  dryRun?: boolean;
  operationId?: string;
  source: string;
}
export interface KnorviaAgentRemovePluginMarketplaceParams extends KnorviaAgentWorkspaceTarget {
  marketplace: string;
}
export interface KnorviaAgentUpdatePluginMarketplaceParams extends KnorviaAgentWorkspaceTarget {
  marketplace?: string;
  operationId?: string;
}
export interface KnorviaAgentInstallPluginParams extends KnorviaAgentWorkspaceTarget {
  dryRun?: boolean;
  marketplace: string;
  operationId?: string;
  pluginName: string;
  scope?: "user" | "workspace";
}
export interface KnorviaAgentCancelPluginOperationParams {
  operationId: string;
}
export interface KnorviaAgentUninstallPluginParams extends KnorviaAgentWorkspaceTarget {
  marketplace?: string;
  pluginId?: string;
  pluginName?: string;
  removeCache?: boolean;
}
export interface KnorviaAgentUpdatePluginParams extends KnorviaAgentWorkspaceTarget {
  pluginId?: string;
  marketplace?: string;
}
export interface KnorviaAgentRestoreBuiltinPluginParams extends KnorviaAgentWorkspaceTarget {
  pluginId: string;
}
export interface KnorviaAgentConfigurePluginParams extends KnorviaAgentWorkspaceTarget {
  clearOptionKeys?: string[];
  dryRun?: boolean;
  options: Record<string, unknown>;
  pluginId: string;
  scope?: "user" | "workspace";
}
export interface KnorviaAgentResetPluginConfigParams extends KnorviaAgentWorkspaceTarget {
  pluginId: string;
  scope?: "user" | "workspace";
}
export interface KnorviaAgentValidatePluginParams extends KnorviaAgentWorkspaceTarget {
  marketplace?: string;
  pluginName?: string;
  source?: string;
}
export interface KnorviaAgentDescribePluginParams extends KnorviaAgentWorkspaceTarget {
  marketplace: string;
  pluginName: string;
}
export interface KnorviaAgentSetPluginEnabledParams extends KnorviaAgentWorkspaceTarget {
  enabled: boolean;
  operationId?: string;
  pluginId: string;
  scope?: "user" | "workspace";
}
export interface KnorviaAgentPluginReferenceCatalogParams extends KnorviaAgentWorkspaceTarget {
  sessionId?: string;
}
export interface KnorviaAgentSkillReferenceCatalogParams extends KnorviaAgentWorkspaceTarget {
  sessionId?: string;
}
export interface KnorviaAgentResolveSuggestedPluginReferenceParams extends KnorviaAgentWorkspaceTarget {
  stableId: string;
  operationId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryKind: "desktop-continuous" | "web-remote-replayable";
}
export interface KnorviaAgentCreateAutomationParams extends KnorviaAgentWorkspaceTarget {
  title: string;
  cronExpr: string;
  relativeDelayMinutes?: number;
  prompt: string;
  studioWorkflowId?: string;
  modelSelection?: ModelSelection;
  mode?: string;
  recurring?: boolean;
  maxRuns?: number;
  endAt?: number;
  scheduleRule?: KnorviaAutomationScheduleRule;
}
export interface KnorviaAgentUpdateAutomationParams extends KnorviaAgentWorkspaceTarget {
  automationId: string;
  title?: string;
  cronExpr?: string;
  prompt?: string;
  modelSelection?: ModelSelection | null;
  mode?: string | null;
  recurring?: boolean;
  maxRuns?: number | null;
  endAt?: number | null;
  scheduleRule?: KnorviaAutomationScheduleRule | null;
  scheduleEditedByUser?: boolean;
}
export interface KnorviaAgentAutomationIdParams extends KnorviaAgentWorkspaceTarget {
  automationId: string;
}
export interface KnorviaAgentSetAutomationEnabledParams extends KnorviaAgentWorkspaceTarget {
  automationId: string;
  enabled: boolean;
}
export interface KnorviaAgentDeleteAutomationRunParams extends KnorviaAgentWorkspaceTarget {
  runId: string;
}
```

### `packages/services/src/agent/agentPresentationSurface.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export type KnorviaAgentPresentationSurface = "desktop";
export function resolveKnorviaAgentPresentationSurface(
  facts: KnorviaAgentPresentationHostFacts,
): KnorviaAgentPresentationSurface | undefined;
```

### `packages/services/src/agent/agentProcessManager.ts`

导出 7 项（运行时 2 / 纯类型 5），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface KnorviaAgentCommand {
  /** 本地配套 CLI bundle 的存储专用 Worker 入口；远端/自定义命令不推断能力。 */
  storagePreparationEntry?: string;
  /** 本次部署的 Agent 支持迁移前的启动通知；旧自定义命令保持原协议。 */
  supportsStorageStartup?: boolean;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}
export interface KnorviaAgentCommandResolverContext {
  presentationSurface?: KnorviaAgentPresentationSurface;
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceKey: string;
}
export type KnorviaAgentCommandResolver = (
  context: KnorviaAgentCommandResolverContext,
) => Promise<KnorviaAgentCommand | null> | KnorviaAgentCommand | null;
export interface KnorviaAgentProcessManagerOptions {
  commandResolver?: KnorviaAgentCommandResolver;
  presentationSurface?: KnorviaAgentPresentationSurface;
  requestTimeoutMs?: number;
  processLifecycleReporter?: RuntimeProcessLifecycleReporter;
  /**
   * 进程泳道标识。同一 workspace 的不同泳道各走独立 manager 实例；lane 会写入
   * runtimeIdentity 与 spawn/exit 日志，便于排障区分。
   * 缺省为 chat 主泳道，不追加任何标记。
   */
  lane?: string;
  /**
   * 空闲回收阈值：连接上没有请求在飞持续超过该时长，就主动回收整棵进程树，
   * 下次 getClient 透明重新拉起。只给 mcp-status 这类“按需探测、进程内挂着 MCP 子进程”
   * 的控制面 lane 使用；chat / plugin 缺省不回收。
   */
  idleTimeoutMs?: number;
  /**
   * 仅当默认进程 cwd 等于目标 workspace 且该目录不可用时使用。
   * 业务 workspacePath/workspaceKey 不随 cwd 兜底改变。
   */
  spawnFallbackCwd?: string;
  /**
   * 每次 spawn agent 子进程前解析的额外环境变量（在 process.env 之后、workspace 变量之前合入）。
   * 用于把设置页的代理等配置注入子进程；按 spawn 时读取，天然「下次启动生效」。
   *
   * context 携带本次 spawn 的 workspace 标识三元组（workspacePath/workspaceIdentity/workspaceKey），
   * 让 CUA broker 凭据注入能按 workspace 记录 Helper admission（见 services/node.ts 的
   * cuaProductHelperWorkspaceRegistry）。Helper lifecycle 不再回收或重启已有 Agent。
   */
  resolveSpawnEnv?: (context: {
    workspacePath: string;
    workspaceIdentity?: string;
    workspaceKey: string;
  }) => Promise<Record<string, string>> | Record<string, string>;
  /**
   * 可选的外部 spawn admission hook。CUA 默认装配不再注入 Helper recovery gate，
   * 避免 Helper lifecycle 阻塞或间接重启 Agent；保留该通用 hook 供其他产品策略使用。
   */
  waitForSpawnAdmission?: (context: {
    workspacePath: string;
    workspaceIdentity?: string;
    workspaceKey: string;
    signal?: AbortSignal;
  }) => Promise<void> | void;
}
export interface KnorviaAgentRuntimeLifecycleEvent {
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceKey: string;
  runtimeIdentity: KnorviaAgentRuntimeIdentity;
  state: "available" | "unavailable";
}
export function resolveDefaultKnorviaAgentCommand(
  context: KnorviaAgentCommandResolverContext,
): KnorviaAgentCommand | null
export class KnorviaAgentProcessManager {{ … }
```

### `packages/services/src/agent/agentService.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function createKnorviaAgentService(
  options?: CreateKnorviaAgentServiceOptions,
): IKnorviaAgentService & { disposeAllAndWait(): Promise<void> };
```

### `packages/services/src/agent/agentSpawnCwd.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export async function resolveKnorviaAgentSpawnCwd(
  options: { requestedCwd: string; workspacePath: string; spawnFallbackCwd?: string },
  probe: (path: string) => Promise<{ isDirectory(): boolean }> = stat,
): Promise<{ cwd: string; usedFallback: boolean; cwdExists: boolean }>;
```

### `packages/services/src/agent/agentStderrCollector.ts`

导出 2 项（运行时 2 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export const EXIT_STDERR_DRAIN_MS = 250
export class AgentStderrCollector {{ … }
```

### `packages/services/src/agent/agentWorkflowParams.ts`

导出 7 项（运行时 0 / 纯类型 7），分类 `unreviewed`。签名逐字取自源码。

```ts
export type KnorviaAgentSavedWorkflowTarget =
  | (KnorviaAgentWorkspaceTarget & { scope?: KnorviaSavedWorkflowScope })
  | ({ scope: "global" } & Partial<KnorviaAgentWorkspaceTarget>);
export type KnorviaAgentListSavedWorkflowsParams = KnorviaAgentSavedWorkflowTarget;
export type KnorviaAgentGetSavedWorkflowParams = KnorviaAgentSavedWorkflowTarget & {
  name: string;
};
export type KnorviaAgentUpdateSavedWorkflowMetaParams = KnorviaAgentSavedWorkflowTarget & {
  name: string;
  meta: KnorviaSavedWorkflowMeta;
};
export type KnorviaAgentDeleteSavedWorkflowParams = KnorviaAgentSavedWorkflowTarget & {
  name: string;
};
export type KnorviaAgentListSavedWorkflowRunsParams = KnorviaAgentSavedWorkflowTarget & {
  /** 只要这个工作流名下的 run；缺省即（该 scope 下）全部。 */
  name?: string;
  /** [1, 50]；服务端钳制。 */
  limit: number;
};
export type KnorviaAgentMoveSavedWorkflowParams = KnorviaAgentWorkspaceTarget & {
  name: string;
};
```

### `packages/services/src/agent/automationToolPolicy.ts`

导出 4 项（运行时 4 / 纯类型 0），分类 `upstream-unchanged`。签名逐字取自源码。

```ts
export const AUTOMATION_MUTATION_TOOL_NAMES = ["CronCreate", "CronUpdate", "CronDelete"] as const;
export function mergeAutomationMutationToolDenylist(
  current: readonly string[] | undefined,
): string[];
export const OFF_PEAK_MUTATION_TOOL_NAMES = ["OffPeakCreate"] as const;
export function mergeOffPeakMutationToolDenylist(current: readonly string[] | undefined): string[];
```

### `packages/services/src/agent/configOptions.ts`

导出 8 项（运行时 8 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export const MODEL_CONFIG_ID = "model";
export const MODE_CONFIG_ID = "mode";
export const THOUGHT_LEVEL_CONFIG_ID = "thought_level";
export function formatModelPickerValue(ref: ModelSelection | undefined): string;
export function formatTaskMetaModelSelectionFromSnapshot(
  snapshot: Pick<KnorviaSessionStateSnapshot, "messages" | "settings">,
): string;
export function normalizeAvailableKnorviaMode(mode: KnorviaSessionMode): string;
export function getKnorviaAgentAvailableModes(): KnorviaTaskModeInfo[];
export function settingsToConfigOptions(
  settings: KnorviaSessionSettingsState,
): KnorviaConfigOption[];
```

### `packages/services/src/agent/cuaOperationTurnTracker.ts`

导出 4 项（运行时 1 / 纯类型 3），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface CuaOperationWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
}
export interface CuaOperationState {
  active: boolean;
  sessionId: string;
  turnId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}
export interface CuaOperationStateReporter {
  onStateChanged(event: CuaOperationState): void;
}
export function createCuaOperationTurnTracker(options: {
  /** Windows 顶部提示条的桌面投影；非 win32 不注入。 */
  reporter?: CuaOperationStateReporter;
  /** Windows operation indicator 的聚合边界；PiP 不再消费该聚合状态。 */
  onTurnsActive?: () => void;
  onTurnsIdle?: () => void;
  /** macOS desktop-local PiP 只消费这些产品事实；panel policy 留在 producer。 */
  onPipSessionLifecycle?: (
    workspace: CuaOperationWorkspaceTarget,
    event: Exclude<PipSessionEvent, { kind: "focus-changed" }>,
  ) => void;
  logger?: TrackerLogger;
}): CuaOperationTurnTracker;
```

### `packages/services/src/agent/independentPlanSupport.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function ensureIndependentPlanSupport(
  client: Pick<KnorviaProtocolClient, "request">,
): Promise<void>;
```

### `packages/services/src/agent/modelTrajectory.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export async function readModelTrajectory(
  taskId: string,
  limit = DEFAULT_TRAJECTORY_LIMIT,
): Promise<KnorviaModelTrajectory>;
```

### `packages/services/src/agent/modelTrajectoryFileTail.ts`

导出 4 项（运行时 3 / 纯类型 1），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface TrajectoryFileTail {
  text: string;
  bytesRead: number;
  truncated: boolean;
}
export function resolveModelIODirs(): string[];
export function sanitizeSessionSegment(value: string): string;
export async function readTrajectoryFileTail(filePath: string): Promise<TrajectoryFileTail>;
```

### `packages/services/src/agent/pluginReferenceCatalogRequest.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export async function requestPluginReferenceCatalog(
  client: Pick<KnorviaProtocolClient, "request">,
  params: KnorviaPluginsReferenceCatalogParams,
);
```

### `packages/services/src/agent/protocolClient.ts`

导出 2 项（运行时 2 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export class KnorviaProtocolRequestTimeoutError extends Error {{ … }
export class KnorviaProtocolClient implements IDisposable {{ … }
```

### `packages/services/src/agent/protocolTransport.ts`

导出 3 项（运行时 0 / 纯类型 3），分类 `unreviewed`。签名逐字取自源码。

```ts
export type KnorviaProtocolTransportKind = "stdio" | "websocket" | "memory";
export interface KnorviaProtocolTransportClosedEvent {
  code?: number | null;
  signal?: NodeJS.Signals | null;
  reason?: string;
}
export interface KnorviaProtocolTransport extends IDisposable {
  readonly kind: KnorviaProtocolTransportKind;
  readonly onMessage: Event<KnorviaProtocolMessage>;
  readonly onClose: Event<KnorviaProtocolTransportClosedEvent>;
  send(message: KnorviaProtocolMessage): Promise<void>;
  disposeAndWait?(): Promise<void>;
}
```

### `packages/services/src/agent/repairSubagentTaskIndex.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export async function repairSubagentTaskIndex(params: {
  target: KnorviaAgentWorkspaceTarget;
  visibleSessionIds: ReadonlySet<string>;
  agentService: Pick<IKnorviaAgentService, "listSessions">;
  taskIndexRepo: Pick<TaskIndexRepo, "listTaskMetas" | "updateTaskState">;
  isCurrent: () => boolean;
  onRemoved: () => void;
}): Promise<void>;
```

### `packages/services/src/agent/sessionEventCoalescer.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function createBackgroundSessionEventCoalescer(params: {
  emit: (event: KnorviaAgentServiceEvent) => void;
  flushDelayMs?: number;
  maxItems?: number;
}): BackgroundSessionEventCoalescer;
```

### `packages/services/src/agent/stdioTapDevConfig.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function getKnorviaStdioTapDevLogDir(): string;
export function readKnorviaStdioTapDevState(): KnorviaStdioTapDevState;
export function setKnorviaStdioTapDevEnabled(enabled: boolean): KnorviaStdioTapDevState;
```

### `packages/services/src/agent/stdioTransport.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export class KnorviaStdioTransport {{ … }
```

### `packages/services/src/agent/storageStartupGate.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export class KnorviaStorageStartupGate {{ … }
```

### `packages/services/src/agent/task-index-ingestion/sessionIndexProjection.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function createSessionIndexProjection(ports: SummaryPorts);
```

### `packages/services/src/agent/task-index-ingestion/snapshotProjection.ts`

导出 6 项（运行时 3 / 纯类型 3），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface SnapshotSyncOptions {
  modelOverride?: string;
  thoughtLevelOverride?: string;
  moveGroupedTaskToTop?: boolean;
  unreadSignal?: KnorviaWorkspaceTaskListChanged["unreadSignal"];
  broadcastReason: KnorviaWorkspaceTaskListChanged["reason"];
}
export interface WorkspaceBroadcastTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId?: string;
}
export type BroadcastTask = (
  target: WorkspaceBroadcastTarget,
  meta: KnorviaTaskMeta | undefined,
  reason: KnorviaWorkspaceTaskListChanged["reason"],
  options?: Pick<KnorviaWorkspaceTaskListChanged, "unreadSignal">,
) => void;
export function projectSnapshotMeta(
  snapshot: KnorviaSessionStateSnapshot,
  options: Pick<SnapshotSyncOptions, "modelOverride" | "thoughtLevelOverride">,
): KnorviaTaskMeta;
export function projectSnapshotSearchText(snapshot: KnorviaSessionStateSnapshot): string;
export function createSnapshotProjection(
  repo: TaskIndexRepo,
  emit: BroadcastTask,
  logger: IngestLogger,
);
```

### `packages/services/src/agent/task-index-ingestion/topicTypes.ts`

导出 10 项（运行时 0 / 纯类型 10），分类 `unreviewed`。签名逐字取自源码。

```ts
export type IngestLogger = ReturnType<typeof createServiceLogger>;
export type Delivery = "initial" | "online" | "recovery";
export type TopicKind = "sessions-index" | "workspace-config";
export type TopicWire = SessionsIndexTopicWireCandidate | WorkspaceConfigTopicWireCandidate;
export type SubscriptionReason =
  | "initial"
  | "runtime-restart"
  | "snapshot-recovery-gap"
  | "recovery-frame-timeout"
  | "resync-ack-mismatch"
  | "resync-failed"
  | "force-recovery-gap"
  | "pre-ack-overflow"
  | "provider-not-ready-wait"
  | "retry";
export interface LogicalTopicFrame {
  topic: string;
  subscriptionId: string;
  fromSeq: number;
  toSeq: number;
  payload:
    | { kind: "snapshot"; snapshot: { logEpoch: string } }
    | { kind: "deltas"; deltas: unknown[] };
}
export interface RecoveryFlight {
  subscription: string;
  forceSnapshot: boolean;
  acknowledged: boolean;
  applied: boolean;
  upgrade: boolean;
  followup: boolean;
  deadline: ReturnType<typeof setTimeout> | null;
}
export interface TopicOwnership {
  generation: number;
  subscription: string | null;
  epoch: string | null;
  sequence: number;
  hasBase: boolean;
  flight: RecoveryFlight | null;
}
export interface TopicPorts<F extends LogicalTopicFrame> {
  kind: TopicKind;
  target: KnorviaAgentWorkspaceTarget;
  topic(): string;
  live(): boolean;
  logger: IngestLogger;
  assembler: TopicWireFrameAssembler<F>;
  subscribe(): Promise<V4SessionsIndexSubscribeResult>;
  unsubscribe(subscriptionId: string): Promise<void>;
  resync(input: {
    subscriptionId: string;
    base: { logEpoch: string; seq: number } | null;
    forceSnapshot?: boolean;
  }): Promise<V4ConversationResyncResult>;
  becameUnavailable(): void;
  apply(frame: F): void;
  commitDeltaBeforeProjection: boolean;
  expiryChanged(): void;
}
export interface TopicIngest {
  readonly generation: number;
  readonly nextExpiryAt: number | null;
  receive(wire: TopicWire): void;
  expire(now: number): void;
  subscribe(reason: SubscriptionReason, unsubscribeActive: boolean): Promise<void>;
  reset(unsubscribeActive: boolean): void;
}
```

### `packages/services/src/agent/taskIndexSyncer.ts`

导出 4 项（运行时 1 / 纯类型 3），分类 `unreviewed`。签名逐字取自源码。

```ts
export interface KnorviaTaskIndexTerminalEvent {
  target: KnorviaAgentSessionTarget;
  kind: "turn.completed" | "turn.failed";
}
export interface KnorviaTaskIndexReadyEvent {
  target: KnorviaAgentSessionTarget;
  reason: "prompt_completed" | "prompt_failed";
}
export interface KnorviaTaskIndexSyncer {
  ensureWorkspaceSubscription(target: KnorviaAgentWorkspaceTarget): void;
  ensureSessionSubscription(
    target: KnorviaAgentSessionTarget,
    options?: { includeSnapshot?: boolean },
  ): void;
  syncSnapshotAndBroadcast(
    snapshot: KnorviaSessionStateSnapshot,
    options: SnapshotSyncOptions,
  ): Promise<KnorviaTaskMeta>;
  syncTaskModel(target: KnorviaAgentSessionTarget, model: string): Promise<KnorviaTaskMeta | null>;
  emitWorkspaceTaskListChanged(
    target: WorkspaceBroadcastTarget,
    meta: KnorviaTaskMeta | undefined,
    reason: KnorviaWorkspaceTaskListChanged["reason"],
    options?: Pick<KnorviaWorkspaceTaskListChanged, "unreadSignal">,
  ): void;
  getWorkspaceEmitter(workspace: WorkspaceEventInput): Emitter<KnorviaWorkspaceEvent>;
  onDynamicWorkspaceEvent(workspace: WorkspaceEventInput): Event<KnorviaWorkspaceEvent>;
  onSessionTerminalEvent: Event<KnorviaTaskIndexTerminalEvent>;
  onSessionReadyEvent: Event<KnorviaTaskIndexReadyEvent>;
  disposeAll(): void;
}
export function createKnorviaTaskIndexSyncer({
  agentService,
  taskIndexRepo,
}: CreateKnorviaTaskIndexSyncerOptions): KnorviaTaskIndexSyncer;
```

### `packages/services/src/agent/taskServiceAdapter.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function createKnorviaTaskServiceAdapter(
  options: CreateKnorviaTaskServiceAdapterOptions,
): IKnorviaTaskService;
```

### `packages/services/src/agent/v4HostCommand.ts`

导出 4 项（运行时 4 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function uuidv7(now: number = Date.now()): string;
export function createHostCommandEnvelope<T extends CommandType>(
  input: CreateHostCommandEnvelopeInput<T>,
): CommandEnvelope;
export function assertV4CommandAckOk(
  commandType: CommandType,
  ack: CommandAck,
  contextMessage: string,
): CommandAck;
export async function sendHostCasCommandV4<T extends CommandType>(input: {
  send: (envelope: CommandEnvelope) => Promise<CommandAck>;
  type: T;
  payload: CommandPayloadMap[T];
  sessionId: string;
  contextMessage: string;
  maxAttempts?: number;
}): Promise<CommandAck>;
```

## broadcast（跨窗口广播）（2 个文件）

### `packages/services/src/broadcast/broadcast.ts`

导出 5 项（运行时 1 / 纯类型 4），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface BroadcastMessage {
  /** 频道名，如 "state:theme"、"state:locale" */
  channel: string;
  /** 消息负载 */
  payload: unknown;
  /** 发送源窗口 ID（由 BroadcastHub 填充，接收端可用来跳过自己） */
  sourceWindowId?: number;
}
export interface BroadcastClaimLease {
  key: string;
  token: string;
}
export type BroadcastClaimAcquireResult =
  | { status: "acquired"; lease: BroadcastClaimLease }
  | { status: "busy"; retryAfterMs: number }
  | { status: "committed" }
  | { status: "unavailable" };
export interface IBroadcastService {
  /** 发送广播消息 */
  send(message: BroadcastMessage): Promise<void>;
  /** 申请带 token 的临时 reservation；busy 可在 retryAfterMs 后重试。 */
  acquireClaim(key: string): Promise<BroadcastClaimAcquireResult>;
  /** 把 reservation 提交为应用进程生命周期内的永久 claim。 */
  commitClaim(lease: BroadcastClaimLease): Promise<void>;
  /** 按 token 释放尚未 commit 的 reservation；迟到 token 不影响后来 winner。 */
  releaseClaim(lease: BroadcastClaimLease): Promise<void>;
  /** 在当前应用进程内原子占用 opaque key；同一 key 仅首次返回 true。 */
  tryClaim(key: string): Promise<boolean>;
  /** 接收来自其他窗口的广播 */
  onMessage: Event<BroadcastMessage>;
}
export const IBroadcastService = createServiceDescriptor<IBroadcastService>(
  ServiceChannels.Broadcast,
);
```

### `packages/services/src/broadcast/broadcastService.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function createBroadcastService(parentPort: ParentPort | null): IBroadcastService;
```

## commands（用户命令发现与持久化）（5 个文件）

### `packages/services/src/commands/commandConfig.ts`

导出 10 项（运行时 8 / 纯类型 2），分类 `unreviewed`。签名逐字取自源码。

```ts
export type CommandConfiguration = Record<string, unknown>;
export function isRecord(value: unknown): value is Record<string, unknown>;
export async function readCommandConfiguration(): Promise<CommandConfiguration>;
export async function writeCommandConfiguration(config: CommandConfiguration): Promise<void>;
export function enabledOverrides(config: CommandConfiguration): Map<string, boolean>;
export async function readEnabledOverrides(): Promise<Map<string, boolean>>;
export function withCommandEnabled(
  config: CommandConfiguration,
  filePath: string,
  enabled: boolean,
): CommandConfiguration;
export interface CommandPluginConfiguration {
  dirs: string[];
  enabled: boolean;
  enabledPlugins: Record<string, boolean>;
  suppressedBuiltins: string[];
  storageDir: string;
}
export function configuredPluginPath(directory: string): string;
export function commandPluginConfiguration(
  config: CommandConfiguration,
): CommandPluginConfiguration;
```

### `packages/services/src/commands/commandDiscovery.ts`

导出 3 项（运行时 3 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function userCommand(
  parsed: CommandInfo,
  filePath: string,
  agentSource: CommandAgentSource,
  target: CommandTarget,
  enabled: boolean,
): UserCommand;
export async function discoverUserCommands(
  sources: readonly CommandAgentSource[],
  workspacePath: string | undefined,
  overrides: Map<string, boolean>,
): Promise<UserCommand[]>;
export async function discoverPluginCommands(
  overrides: Map<string, boolean>,
): Promise<PluginCommand[]>;
```

### `packages/services/src/commands/commandFileParser.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export type CommandFileFormat = "markdown";
export class CommandFileParser {{ … }
```

### `packages/services/src/commands/commands.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface ICommandsService {
  list(params: {
    agentSource?: CommandAgentSource;
    workspacePath?: string;
    workspaceIdentity?: string;
  }): Promise<CommandsListResult>;
  writeCommandFile(params: CommandCreateParams): Promise<{ command: UserCommand }>;
  updateCommandFile(params: CommandUpdateParams): Promise<{ command: UserCommand }>;
  deleteCommandFile(params: CommandDeleteParams): Promise<void>;
  setCommandEnabled(params: CommandSetEnabledParams): Promise<void>;
  getPrimaryUserCommandsDirectory(params?: {
    agentSource?: CommandAgentSource;
  }): Promise<{ path: string }>;
}
export const ICommandsService = createServiceDescriptor<ICommandsService>(ServiceChannels.Commands);
```

### `packages/services/src/commands/commandsService.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function createCommandsService(_options?: { isDesktopRuntime?: boolean }): ICommandsService;
```

## conversation-telemetry（Workspace 级埋点）（1 个文件）

### `packages/services/src/conversation-telemetry/conversationTelemetry.ts`

导出 3 项（运行时 1 / 纯类型 2），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface ConversationTelemetryWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
}
export interface IConversationTelemetryService {
  onFact(target: ConversationTelemetryWorkspaceTarget): Event<ConversationTelemetryFact>;
}
export function createConversationTelemetryService(
  agentService: Pick<IKnorviaAgentService, "onDynamicConversationTelemetryFact">,
): IConversationTelemetryService;
```

## credential（凭据存储与密文）（3 个文件）

### `packages/services/src/credential/credential.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface ICredentialService {
  load(key: string): Promise<string | null>;
  save(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
export const ICredentialService = createServiceDescriptor<ICredentialService>(
  ServiceChannels.Credential,
);
```

### `packages/services/src/credential/credentialService.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function createCredentialService(
  dependencies: CredentialServiceDependencies = {},
): ICredentialService;
```

### `packages/services/src/credential/providers/credentialCipherProvider.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface CredentialCipherProvider {
  encrypt(value: string): string;
  decrypt(value: string): string;
}
export function createCredentialCipherProvider(
  options: CredentialCipherProviderOptions = {},
): CredentialCipherProvider;
```

## cua-permission-broker（Computer Use 权限与 Helper）（9 个文件）

### `packages/services/src/cua-permission-broker/cuaAgentAdmissionGate.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface CuaAgentSpawnAdmissionContext {
  workspaceKey: string;
  workspacePath?: string;
  workspaceIdentity?: string;
  signal?: AbortSignal;
}
export class CuaAgentAdmissionGate {{ … }
```

### `packages/services/src/cua-permission-broker/cuaHelperInstaller.ts`

导出 4 项（运行时 4 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export function normalizeCuaHelperArch(rawArch: string): string;
export function normalizeCuaHelperArchs(archs: readonly string[]): string[];
export function canonicalizeCuaHelperInstallerOptions(
  options: CuaHelperInstallerOptions,
): CuaHelperInstallerOptions;
export function createCanonicalCuaHelperInstaller(
  options: CuaHelperInstallerOptions,
  createInstaller: CuaHelperInstallerFactory = createCuaHelperInstaller,
): CuaHelperInstaller;
```

### `packages/services/src/cua-permission-broker/cuaPermissionService.ts`

导出 11 项（运行时 3 / 纯类型 8），分类 `upstream-modified`。签名逐字取自源码。

```ts
export type { CuaPermissionState } from
export type { CuaPermissionStatus } from
export type { CuaPermissionStatusUnavailable } from
export type { CuaPermissionStatusResult } from
export type { CuaPermissionStatusQueryOptions } from
export type { CuaPermissionRestartResult } from
export type { CuaPermissionRestartOptions } from
export { isCuaPermissionStatusAvailable } from "@knorvia/cua/broker/ports"
export { shouldRunCuaScreenCaptureProbe } from "@knorvia/cua/broker/ports"
export interface ICuaPermissionService extends BrokerICuaPermissionService {}
export const ICuaPermissionService = createServiceDescriptor<BrokerICuaPermissionService>(
  ServiceChannels.CuaPermission,
)
```

### `packages/services/src/cua-permission-broker/cuaPipSession.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface CuaPipSessionService {
  publishFocus(event: FocusEvent): Promise<void>;
  publishLifecycle(event: LifecycleEvent): Promise<void>;
  dispose(): void;
}
export const ICuaPipSessionService = createServiceDescriptor<CuaPipSessionService>(
  ServiceChannels.CuaPipSession,
);
```

### `packages/services/src/cua-permission-broker/cuaPipSessionService.ts`

导出 3 项（运行时 2 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface CuaPipPresentationCredentials {
  socketPath: string;
}
export function createCuaPipSessionService(options: {
  enabled: boolean;
  resolveCredentials: () => Promise<CuaPipPresentationCredentials | undefined>;
  createClient?: (options: PipSessionClientOptions) => PipSessionClient;
  logger?: ServiceLogger;
}): CuaPipSessionService;
export function createCuaPipSessionOwner(
  options: {
    enabled: boolean;
    resolveCredentials: () => Promise<{ socketPath: string } | undefined>;
    createClient?: (options: PipSessionClientOptions) => PipSessionClient;
    logger?: ServiceLogger;
  },
  ports: {
    createClient: (options: PipSessionClientOptions) => PipSessionClient;
    createLogger: () => ServiceLogger;
    eventLogContext: (event: PipSessionEvent) => Record<string, unknown>;
  },
): CuaPipSessionService;
```

### `packages/services/src/cua-permission-broker/index.ts`

导出 56 项（运行时 33 / 纯类型 23），分类 `upstream-modified`。签名逐字取自源码。

```ts
export * from "@knorvia/cua/broker/server";
export { CuaAgentAdmissionGate } from "./cuaAgentAdmissionGate.js";
export type { CuaAgentSpawnAdmissionContext } from "./cuaAgentAdmissionGate.js";
export { ICuaPermissionService } from "./cuaPermissionService.js";
export { isCuaPermissionStatusAvailable } from "./cuaPermissionService.js";
export { shouldRunCuaScreenCaptureProbe } from "./cuaPermissionService.js";
export type { CuaPermissionState } from "./cuaPermissionService.js";
export type { CuaPermissionStatus } from "./cuaPermissionService.js";
export type { CuaPermissionStatusUnavailable } from "./cuaPermissionService.js";
export type { CuaPermissionStatusResult } from "./cuaPermissionService.js";
export type { CuaPermissionStatusQueryOptions } from "./cuaPermissionService.js";
export type { CuaPermissionRestartResult } from "./cuaPermissionService.js";
export type { CuaPermissionRestartOptions } from "./cuaPermissionService.js";
export { BrokerError } from "@knorvia/cua/broker";
export { actionUnavailable } from "@knorvia/cua/broker";
export { dispatchRequest } from "@knorvia/cua/broker";
export { errorResponse } from "@knorvia/cua/broker";
export { errorResponseFromException } from "@knorvia/cua/broker";
export { handleRequestLine } from "@knorvia/cua/broker";
export { elementUnavailable } from "@knorvia/cua/broker";
export { foregroundRequired } from "@knorvia/cua/broker";
export { isBrokerMethod } from "@knorvia/cua/broker";
export { isReadOnlyBrokerMethod } from "@knorvia/cua/broker";
export { okResponse } from "@knorvia/cua/broker";
export { notAuthorized } from "@knorvia/cua/broker";
export { notSelectable } from "@knorvia/cua/broker";
export { notSettable } from "@knorvia/cua/broker";
export { parseRequestLine } from "@knorvia/cua/broker";
export { serializeResponse } from "@knorvia/cua/broker";
export { callBrokerMethod } from "@knorvia/cua/broker";
export { BROKER_SOCKET_ENV } from "@knorvia/cua/broker";
export { BROKER_UNAVAILABLE_ENV } from "@knorvia/cua/broker";
export { mintBrokerSocketPath } from "@knorvia/cua/broker";
export { resolveBrokerSocketPath } from "@knorvia/cua/broker";
export { CuaHelperError } from "@knorvia/cua/broker";
export { isCuaHelperError } from "@knorvia/cua/broker";
export type { BrokerErrorCode } from "@knorvia/cua/broker";
export type { BrokerMethod } from "@knorvia/cua/broker";
export type { BrokerRequest } from "@knorvia/cua/broker";
export type { BrokerResponse } from "@knorvia/cua/broker";
export type { CuaHelperErrorCode } from "@knorvia/cua/broker";
export type { NativeAutomationBackend } from "@knorvia/cua/broker";
export { WindowsCuaHelperHost } from "./windowsCuaDevHelperHost.js";
export type { ManagedCuaProductHelperHost } from "./windowsCuaDevHelperHost.js";
export type { WindowsCuaChild } from "./windowsCuaDevHelperHost.js";
export type { WindowsCuaChildProcessAdapter } from "./windowsCuaDevHelperHost.js";
export type { WindowsCuaHelperHostOptions } from "./windowsCuaDevHelperHost.js";
export { createCuaPipSessionService } from "./cuaPipSessionService.js";
export { ICuaPipSessionService } from "./cuaPipSession.js";
export type { CuaPipPresentationCredentials } from "./cuaPipSessionService.js";
export type { CuaPipSessionService } from "./cuaPipSession.js";
export { createCuaRestrictedRuntimeStopController } from "./cuaRestrictedGateWiring.js";
export { evaluateCuaRestrictedRequestForRuntime } from "./cuaRestrictedGateWiring.js";
export { readCuaRestrictedRuntimeAvailability } from "./cuaRestrictedGateWiring.js";
export type { CuaRestrictedRuntimeAvailability } from "./cuaRestrictedGateWiring.js";
export type { CuaRestrictedRuntimeDecisionInput } from "./cuaRestrictedGateWiring.js";
```

### `packages/services/src/cua-permission-broker/windowsCuaDevHelperHost.ts`

导出 5 项（运行时 1 / 纯类型 4），分类 `upstream-modified`。签名逐字取自源码。

```ts
export type { WindowsCuaChild } from "#src/cua-permission-broker/windowsCuaHelperHostSupport.js"
export type { WindowsCuaChildProcessAdapter } from "#src/cua-permission-broker/windowsCuaHelperHostSupport.js"
export type { WindowsCuaHelperHostOptions } from "#src/cua-permission-broker/windowsCuaHelperHostSupport.js"
export type ManagedCuaProductHelperHost = CuaProductHelperHost & {
  stop(): Promise<void>;
  checkHealth(timeoutMs?: number): Promise<unknown>;
  waitForTransport?(timeoutMs?: number): Promise<CuaHelperTransportHandle>;
};
export class WindowsCuaHelperHost implements ManagedCuaProductHelperHost {{ … }
```

### `packages/services/src/cua-permission-broker/windowsCuaDevRuntime.ts`

导出 3 项（运行时 2 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface WindowsCuaRuntime {
  root: string;
  entryPath: string;
  addonPath: string;
  command: string;
  commandEnv: Record<string, string>;
}
export class WindowsCuaDevRuntimeResolutionError extends Error {{ … }
export async function resolveWindowsCuaRuntime(
  options: WindowsCuaRuntimeResolveOptions = {},
): Promise<WindowsCuaRuntime>
```

### `packages/services/src/cua-permission-broker/windowsCuaHelperHostSupport.ts`

导出 12 项（运行时 8 / 纯类型 4），分类 `upstream-modified`。签名逐字取自源码。

```ts
export const ADDON_ENV = HELPER_ADDON_ENV
export interface WindowsCuaChild {
  readonly pid?: number;
  send(message: unknown): boolean;
  kill(): boolean;
  on(event: "message" | "error" | "exit", listener: (...args: unknown[]) => void): this;
  off(event: "message" | "error" | "exit", listener: (...args: unknown[]) => void): this;
}
export interface WindowsCuaChildProcessAdapter {
  /** command 是运行时 Node/Electron，argv[0] 是 Helper entry。 */
  fork(command: string, argv: string[], options: ForkOptions): WindowsCuaChild;
}
export interface WindowsCuaHelperHostOptions {
  runtime: WindowsCuaRuntime;
  childProcess?: WindowsCuaChildProcessAdapter;
  mintSocketPath?: () => string;
  mintPluginAuthority?: () => string;
  healthProbe?: (socketPath: string, timeoutMs: number) => Promise<HelperHealth>;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  logger?: ServiceLogger;
  /** Ready Helper 意外退出后通知生命周期 owner，仅触发 Helper recovery。 */
  onUnexpectedExit?: (info: { generation: number; pid: number | undefined }) => void;
}
export interface Generation {
  id: number;
  child: WindowsCuaChild;
  socketPath: string;
  stopped: boolean;
  exitObserved: boolean;
  abort?: (error: Error) => void;
  terminationPromise?: Promise<void>;
  removeMainListeners(): void;
}
export const defaultChildProcess: WindowsCuaChildProcessAdapter = …
export const defaultSocketPathFactory = mintBrokerSocketPath
export const defaultHealthProbe = (socketPath: string, timeoutMs: number): Promise<HelperHealth> =>
  probeHelperHealth(socketPath, { timeoutMs })
export class WindowsCuaChildLifecycle {{ … }
export function parseReadyMessage(
  message: unknown,
): WindowsDevHelperControlMessage | "ignore" | null
export function isExactHealthPid(
  health: HelperHealth,
  childPid: number | undefined,
): health is HelperHealth & { pid: number }
export function asError(error: unknown): Error
```

## file（工作区文件服务与搜索索引）（7 个文件）

### `packages/services/src/file/file.ts`

导出 3 项（运行时 1 / 纯类型 2），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface WorkspaceFileSearchParams {
  rootPath: string;
  workspaceIdentity?: string;
  query: string;
  limit?: number;
  /** 无命中补扫：绕过尚未过期的文件索引。 */
  refresh?: boolean;
}
export interface IFileService {
  /** Host 匹配并返回有界候选，避免 Renderer 下载完整文件索引。 */
  searchWorkspaceFiles(params: WorkspaceFileSearchParams): Promise<WorkspaceFileEntry[]>;
  readdir(params: { path: string; includeHidden?: boolean }): Promise<FileEntry[]>;
  stat(params: { path: string }): Promise<FileStat>;
  checkFilesExist(params: { paths: string[] }): Promise<Array<{ path: string; exists: boolean }>>;
  resolvePath(params: { path: string }): Promise<string>;
  ensureConversationWorkspace(): Promise<{
    path: string;
    created: boolean;
    workspacePurpose: "conversation";
  }>;
  createDefaultWorkspace(): Promise<{ path: string }>;
  createScratchWorkspace(params: { name: string }): Promise<{ path: string }>;
  readTextFile(params: { path: string; offset?: number; length?: number }): Promise<FileTextSlice>;
  readMediaPreview(params: { path: string; maxBytes?: number }): Promise<FileMediaPreview>;
  /**
   * 按偏移读取文件的一段原始字节，供大二进制文件（如 PDF）按需分段加载。
   * 返回值必须保持顶层 Uint8Array：RPC 序列化只对顶层二进制走原始字节通道，
   * 嵌套在对象字段里会退化成 JSON+base64。EOF 时返回短数组。
   */
  readFileRange(params: { path: string; offset: number; length: number }): Promise<Uint8Array>;
  readBinaryPreview(params: { path: string; maxBytes?: number }): Promise<FileBinaryPreview>;
  /**
   * workspace 文件索引的列式打包长度（字符数）。与 listWorkspaceFilesRange 配对，
   * 调用方按长度分块拉取（见 fetchWorkspaceFileEntriesPacked）。
   * 返回 number：RPC Int 快速路径。
   */
  listWorkspaceFilesLength(params: { rootPath: string }): Promise<number>;
  /**
   * 分块返回列式打包字符串（workspaceFileEntriesCodec 格式，[offset, offset+length)）。
   * 必须是裸 string 顶层返回：RPC String 快速路径（长度前缀+原始字节）；Object 会
   * JSON 转义大字符串（实测 6-9s 主线程长任务）。单块不超过 ~4MB：大消息在
   * renderer 接收端的分帧重组是秒级长任务（实测 4.6-6.3s），分块 + 块间让出后
   * 主线程每次只处理一小块（~50ms），输入永不冻结。
   * Host 侧有 60s TTL + .knorviaignore 指纹签名的整包缓存，分块只是切片。
   */
  listWorkspaceFilesRange(params: {
    rootPath: string;
    offset: number;
    length: number;
  }): Promise<string>;
  /**
   * workspace 搜索忽略规则（.knorviaignore）的读写，供设置页编辑使用。
   * source: "file" 已存在文件内容；"template" 尚未创建时的初始内容预览（保存时才落盘）。
   */
  readWorkspaceFileSearchIgnore(params: {
    rootPath: string;
  }): Promise<{ content: string; source: "file" | "template" }>;
  /**
   * 设置页分区操作（返回新内容填充编辑框，保存才落盘）：
   * "sync-gitignore" 只重写 gitignore 同步区（保留默认段与自定义区）；
   * "reset-defaults" 只重置默认排除段（保留 gitignore 区与自定义区）。
   */
  applyWorkspaceFileSearchIgnoreTransform(params: {
    rootPath: string;
    transform: "sync-gitignore" | "reset-defaults";
  }): Promise<{ content: string }>;
  writeWorkspaceFileSearchIgnore(params: { rootPath: string; content: string }): Promise<void>;
}
export const IFileService = createServiceDescriptor<IFileService>(ServiceChannels.File);
```

### `packages/services/src/file/fileService.ts`

导出 2 项（运行时 1 / 纯类型 1），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface CreateFileServiceOptions {
  workspaceFileSearchFilter?: WorkspaceFileSearchFilter;
}
export function createFileService(options: CreateFileServiceOptions = {}): IFileService;
```

### `packages/services/src/file/fileServiceIndex.ts`

导出 1 项（运行时 1 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export function createWorkspaceIndexOwner(
  filter: WorkspaceFileSearchFilter,
  logger: ReturnType<typeof createServiceLogger>,
): (root: string, identity?: string, refresh?: boolean) => Promise<WorkspaceIndex>;
```

### `packages/services/src/file/fileServiceIO.ts`

导出 5 项（运行时 5 / 纯类型 0），分类 `unreviewed`。签名逐字取自源码。

```ts
export async function classifyFileEntry(path: string, entry: Dirent): Promise<FileEntry["type"]>;
export async function readTextSlice(params: {
  path: string;
  offset?: number;
  length?: number;
}): Promise<FileTextSlice>;
export async function readByteRange(params: {
  path: string;
  offset: number;
  length: number;
}): Promise<Uint8Array>;
export async function readMediaFilePreview(params: {
  path: string;
  maxBytes?: number;
}): Promise<FileMediaPreview>;
export async function readBinaryFilePreview(params: {
  path: string;
  maxBytes?: number;
}): Promise<FileBinaryPreview>;
```

### `packages/services/src/file/workspaceFileIgnore.ts`

导出 6 项（运行时 6 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export const WORKSPACE_FILE_SEARCH_IGNORE_FILE_NAME = ".knorviaignore";
export async function loadWorkspaceFileSearchIgnoreRules(
  rootPath: string,
  logger?: Logger,
): Promise<SearchIgnoreRules>;
export function isWorkspaceFileSearchPathIgnored(
  rules: SearchIgnoreRules,
  relativePath: string,
  type: "file" | "directory",
): boolean;
export async function readWorkspaceFileSearchIgnore(
  rootPath: string,
): Promise<{ content: string; source: "file" | "template" }>;
export async function transformWorkspaceFileSearchIgnore(
  rootPath: string,
  transform: "sync-gitignore" | "reset-defaults",
): Promise<{ content: string }>;
export async function writeWorkspaceFileSearchIgnore(
  rootPath: string,
  content: string,
): Promise<void>;
```

### `packages/services/src/file/workspaceFileMentionFilter.ts`

导出 5 项（运行时 1 / 纯类型 4），分类 `upstream-modified`。签名逐字取自源码。

```ts
export interface WorkspaceFileSearchEntry {
  name: string;
  path: string;
  relativePath: string;
  type: "file" | "directory";
}
export interface WorkspaceFileSearchDecision {
  include: boolean;
  traverse: boolean;
}
export interface WorkspaceFileSearchFilterContext {
  /** Loaded ignore rules replace the built-in directory exclusions. */
  ignoreRulesActive: boolean;
}
export interface WorkspaceFileSearchFilter {
  evaluate(
    entry: WorkspaceFileSearchEntry,
    context?: WorkspaceFileSearchFilterContext,
  ): WorkspaceFileSearchDecision;
}
export const defaultWorkspaceFileSearchFilter: WorkspaceFileSearchFilter = …
```

### `packages/services/src/file/workspaceFileSearch.ts`

导出 2 项（运行时 2 / 纯类型 0），分类 `upstream-modified`。签名逐字取自源码。

```ts
export async function buildHostFileSearchCandidates(packed: string, rootPath: string);
export async function searchHostFileCandidates(
  candidates: WorkspaceFileSearchCandidate[],
  query: string,
  limit: number,
): Promise<WorkspaceFileEntry[]>;
```
