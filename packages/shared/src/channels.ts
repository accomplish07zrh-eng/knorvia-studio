/* eslint-disable max-lines -- 通信频道和请求响应映射必须集中定义，避免跨进程 channel 字符串散落。 */
import type {
  ResourceUsageSnapshot,
  LoadCliMcpFromUserDirectoryRequest,
  LoadCliMcpFromUserDirectoryResult,
  MigrateLegacyCommonMcpRequest,
  MigrateLegacyCommonMcpResult,
  SaveCliMcpToUserDirectoryRequest,
} from "./index.js";
import type { AppSettings, Locale } from "./protocol.js";
import type { StorageCleanRequest, StorageCleanResult, StorageUsageSnapshot } from "./storage.js";
import type {
  ArmsCustomEventPayload,
  ConfigureFinalArmsCustomEventE2ERequest,
  FinalArmsCustomEventE2EEntry,
  RendererTelemetryEventPayload,
  TelemetryRendererContext,
} from "./telemetry.js";
import type {
  RendererActionTraceBatchV1,
  RendererActionTraceConfigV1,
} from "./rendererActionTrace.js";
import type { RendererHeapSample } from "./validation.js";
import type {
  CancelPendingRemoteConnectionRequest,
  BindRemoteWorkspaceSessionContextRequest,
  BrowserViewScreenshotSurfacePreparePayload,
  BrowserViewScreenshotSurfaceReadyPayload,
  BrowserViewScreenshotSurfaceReleasePayload,
  BrowserViewCloseTabNotification,
  BrowserViewCloseTabRequest,
  BrowserViewResidencyReportPayload,
  BrowserViewResidencyTransitionPayload,
  BrowserViewRestoredTabShell,
  BrowserViewRestoreTabsRequest,
  BrowserViewViewportChangedPayload,
  ConnectRemoteRequest,
  DesktopCommandId,
  DesktopTitleBarTheme,
  DockerContainerInfo,
  EmbeddedBrowserOpenUrlRequest,
  EditorInfo,
  CreateTempTextAttachmentRequest,
  CreateTempTextAttachmentResult,
  SaveFileRequest,
  SaveFileResult,
  PrintPageToPdfResult,
  OpenInEditorOptions,
  PostUpdateReleaseNotesPayload,
  RemoteSessionClosedEvent,
  SSHConfigAliasOption,
  TaskNotificationPayload,
  WSLDistro,
  UpdateCheckResultPayload,
  UpdateStatePayload,
  DesktopZoomState,
  DesktopWindowChromeState,
  WindowControlsOverlayMetrics,
  WindowControlsOverlayReadyPayload,
} from "./platform.js";
import type { BrowserViewportSize } from "./browser-use/command-metadata.js";
import type {
  CuaAccessibilitySettingsResult,
  OpenCuaPermissionOnboardingOptions,
  PrepareCuaHelperPermissionDragResult,
} from "./cuaAccessibilitySettings.js";

// ─────────────────────────────────────────────。
// RPC 服务频道 ： 通过 ChannelServer/ChannelClient 传输
// ─────────────────────────────────────────────。

// RPC 服务频道名。与 ServiceDescriptor.channelName 对应。。
const channelValueTable1 = {
  file: /* 频道名逐字冻结 */ "file",
  mediaPreview: /* 频道名逐字冻结 */ "media-preview",
  system: /* 频道名逐字冻结 */ "system",
  terminal: /* 频道名逐字冻结 */ "terminal",
  git: /* 频道名逐字冻结 */ "git",
  gitCheckpoint: /* 频道名逐字冻结 */ "git-checkpoint",
  setting: /* 频道名逐字冻结 */ "setting",
  credential: /* 频道名逐字冻结 */ "credential",
  cuaPermission: /* 频道名逐字冻结 */ "cua-permission",
  cuaPipSession: /* 频道名逐字冻结 */ "cua-pip-session",
  broadcast: /* 频道名逐字冻结 */ "broadcast",
  knorviaTask: /* 频道名逐字冻结 */ "knorvia-task",
  windowController: /* 频道名逐字冻结 */ "window-controller",
  knorviaAgent: /* 频道名逐字冻结 */ "agent",
  knorviaSession: /* 频道名逐字冻结 */ "agent-session",
  fileWatcher: /* 频道名逐字冻结 */ "file-watcher",
  providerSettings: /* 频道名逐字冻结 */ "provider-settings",
  modelSelection: /* 频道名逐字冻结 */ "model-selection",
  usageStats: /* 频道名逐字冻结 */ "usage-stats",
  skills: /* 频道名逐字冻结 */ "skills",
  skillSync: /* 频道名逐字冻结 */ "skill-sync",
  mcpSync: /* 频道名逐字冻结 */ "mcp-sync",
  pluginSync: /* 频道名逐字冻结 */ "plugin-sync",
  plugins: /* 频道名逐字冻结 */ "plugins",
  subagents: /* 频道名逐字冻结 */ "subagents",
  commands: /* 频道名逐字冻结 */ "commands",
  hooks: /* 频道名逐字冻结 */ "hooks",
  memory: /* 频道名逐字冻结 */ "memory",
  settingsSync: /* 频道名逐字冻结 */ "settings-sync",
  onboardingRecord: /* 频道名逐字冻结 */ "onboarding-record",
} as const; // 频道字面值表
export const ServiceChannels = {
  // 常量面
  File: /* 派生自值表 */ channelValueTable1.file,
  MediaPreview: /* 派生自值表 */ channelValueTable1.mediaPreview,
  System: /* 派生自值表 */ channelValueTable1.system,
  Terminal: /* 派生自值表 */ channelValueTable1.terminal,
  Git: /* 派生自值表 */ channelValueTable1.git,
  GitCheckpoint: /* 派生自值表 */ channelValueTable1.gitCheckpoint,
  Setting: /* 派生自值表 */ channelValueTable1.setting,
  Credential: /* 派生自值表 */ channelValueTable1.credential,
  CuaPermission: /* 派生自值表 */ channelValueTable1.cuaPermission,
  CuaPipSession: /* 派生自值表 */ channelValueTable1.cuaPipSession,
  Broadcast: /* 派生自值表 */ channelValueTable1.broadcast,
  KnorviaTask: /* 派生自值表 */ channelValueTable1.knorviaTask,
  WindowController: /* 派生自值表 */ channelValueTable1.windowController,
  KnorviaAgent: /* 派生自值表 */ channelValueTable1.knorviaAgent,
  KnorviaSession: /* 派生自值表 */ channelValueTable1.knorviaSession,
  FileWatcher: /* 派生自值表 */ channelValueTable1.fileWatcher,
  ProviderSettings: /* 派生自值表 */ channelValueTable1.providerSettings,
  ModelSelection: /* 派生自值表 */ channelValueTable1.modelSelection,
  UsageStats: /* 派生自值表 */ channelValueTable1.usageStats,
  Skills: /* 派生自值表 */ channelValueTable1.skills,
  SkillSync: /* 派生自值表 */ channelValueTable1.skillSync,
  McpSync: /* 派生自值表 */ channelValueTable1.mcpSync,
  PluginSync: /* 派生自值表 */ channelValueTable1.pluginSync,
  Plugins: /* 派生自值表 */ channelValueTable1.plugins,
  PluginManagement:
    /* 设置页插件管理服务（UI 平台能力面收敛，不再直触 agentService） */ "plugin-management",
  Subagents: /* 派生自值表 */ channelValueTable1.subagents,
  Commands: /* 派生自值表 */ channelValueTable1.commands,
  Hooks: /* 派生自值表 */ channelValueTable1.hooks,
  Memory: /* 派生自值表 */ channelValueTable1.memory,
  SettingsSync: /* 派生自值表 */ channelValueTable1.settingsSync,
  CliProviderSwitch:
    /* Claude Code / Codex / Grok Build 全局模型配置切换（仅本机 Host） */ "cli-provider-switch",
  PromptAttachmentTransfer:
    /* Composer 附件在 host-local 与 remote runtime 之间的预传服务 */ "prompt-attachment-transfer",
  OnboardingRecord: /* 派生自值表 */ channelValueTable1.onboardingRecord,
} as const; // 频道表冻结

export type ServiceChannelName = (typeof ServiceChannels)[keyof typeof ServiceChannels]; // 派生键联合 // 类型面

// ─────────────────────────────────────────────。
// 平台频道 ： 仅 Desktop main 进程能处理的操作（Electron IPC）
// ─────────────────────────────────────────────。

// Electron IPC 频道名。仅在 preload ↔ main 之间使用。。
const channelValueTable2 = {
  selectDirectory: /* 频道名逐字冻结 */ "knorvia:select-directory",
  selectFile: /* 频道名逐字冻结 */ "knorvia:select-file",
  selectFiles: /* 频道名逐字冻结 */ "knorvia:select-files",
  saveFile: /* 频道名逐字冻结 */ "knorvia:save-file",
  remoteConnectionLog: /* 频道名逐字冻结 */ "knorvia:remote-connection-log",
  connectRemote: /* 频道名逐字冻结 */ "knorvia:connect-remote",
  disposeRemoteSession: /* 频道名逐字冻结 */ "knorvia:dispose-remote-session",
  listWSLDistros: /* 频道名逐字冻结 */ "knorvia:list-wsl-distros",
  log: /* 频道名逐字冻结 */ "knorvia:log",
  focusTab: /* 频道名逐字冻结 */ "knorvia:focus-tab",
  newTab: /* 频道名逐字冻结 */ "knorvia:new-tab",
  newTask: /* 频道名逐字冻结 */ "knorvia:new-task",
  openWorkspace: /* 频道名逐字冻结 */ "knorvia:open-workspace",
  openFeedbackDialog: /* 频道名逐字冻结 */ "knorvia:open-feedback-dialog",
  openTicketsPanel: /* 频道名逐字冻结 */ "knorvia:open-tickets-panel",
  setResourceUsageSamplingActive: /* 频道名逐字冻结 */ "knorvia:set-resource-usage-sampling-active",
  openResourceManager: /* 频道名逐字冻结 */ "knorvia:open-resource-manager",
  storageCancelScan: /* 频道名逐字冻结 */ "knorvia:storage-cancel-scan",
  storageGetSnapshot: /* 频道名逐字冻结 */ "knorvia:storage-get-snapshot",
  storageClean: /* 频道名逐字冻结 */ "knorvia:storage-clean",
  prepareCuaHelperPermissionDrag: /* 频道名逐字冻结 */ "knorvia:prepare-cua-helper-permission-drag",
  reportLocalTtftBatch: /* 频道名逐字冻结 */ "knorvia:report-local-ttft-batch",
  previewLocalDiagnostics: /* 频道名逐字冻结 */ "knorvia:preview-local-diagnostics",
  exportLocalDiagnostics: /* 频道名逐字冻结 */ "knorvia:export-local-diagnostics",
  checkReleaseUpdate: /* 频道名逐字冻结 */ "knorvia:check-release-update",
  installReleaseUpdate: /* 频道名逐字冻结 */ "knorvia:install-release-update",
  browserViewAttachGuest: /* 频道名逐字冻结 */ "knorvia:browser-view-attach-guest",
  updateReady: /* 频道名逐字冻结 */ "knorvia:update-ready",
  downloadUpdate: /* 频道名逐字冻结 */ "knorvia:download-update",
  getSystemLocale: /* 频道名逐字冻结 */ "knorvia:get-system-locale",
  openInEditor: /* 频道名逐字冻结 */ "knorvia:open-in-editor",
  setWindowGlass: /* 频道名逐字冻结 */ "knorvia:set-window-glass",
  getDeviceId: /* 频道名逐字冻结 */ "knorvia:get-device-id",
} as const; // 频道字面值表
export const PlatformChannels = {
  // 常量面
  SelectDirectory: /* 派生自值表 */ channelValueTable2.selectDirectory,
  SelectFile: /* 派生自值表 */ channelValueTable2.selectFile,
  SelectFiles: /* 派生自值表 */ channelValueTable2.selectFiles,
  CreateTempTextAttachment:
    /* Renderer → Main：写入宿主 ~/.knorvia-studio 临时文本附件 */ "knorvia:create-temp-text-attachment",
  SaveFile: /* 派生自值表 */ channelValueTable2.saveFile,
  PrintToPdf:
    /* Renderer → Main：用 Chromium 打印引擎把当前页面 print 媒体版面导出为 PDF */ "knorvia:print-to-pdf",
  RemoteConnectionLog: /* 派生自值表 */ channelValueTable2.remoteConnectionLog,
  RemoteSessionClosed:
    /* Main → Renderer：远程 workspace session 已关闭 */ "knorvia:remote-session-closed",
  ActivateOrSetWorkspace:
    /* 检查目录是否已在其他窗口打开，如果是则激活该窗口 */ "knorvia:activate-or-set-workspace",
  ConnectRemote: /* 派生自值表 */ channelValueTable2.connectRemote,
  CancelPendingRemoteConnection:
    /* 取消当前窗口正在进行中的远程连接 */ "knorvia:cancel-pending-remote-connection",
  BindRemoteWorkspaceSessionContext:
    /* Renderer → Main：绑定远程 logical session 的 canonical workspace context */ "knorvia:bind-remote-workspace-session-context",
  DisposeRemoteSession: /* 派生自值表 */ channelValueTable2.disposeRemoteSession,
  IsDockerAvailable:
    /* Renderer → Main：检查本机 Docker daemon 是否可用 */ "knorvia:is-docker-available",
  ListWSLDistros: /* 派生自值表 */ channelValueTable2.listWSLDistros,
  ListDockerContainers:
    /* Renderer → Main：列出当前可连接的 Docker 容器 */ "knorvia:list-docker-containers",
  ListSSHConfigAliases:
    /* Renderer → Main：列出 SSH config 里可用于快速填表的 alias */ "knorvia:list-ssh-config-aliases",
  LoadMcpFromUserDirectory:
    /* Renderer → Main：从用户目录加载 CLI MCP 配置 */ "knorvia:load-mcp-from-user-directory",
  SaveMcpToUserDirectory:
    /* Renderer → Main：保存 CLI MCP 配置到用户目录 */ "knorvia:save-mcp-to-user-directory",
  Log: /* 派生自值表 */ channelValueTable2.log,
  SyncWindowTabs:
    /* Renderer → Main：同步当前窗口所有 tab 的 workspace 路径 */ "knorvia:sync-window-tabs",
  SyncWindowUnreadCount:
    /* Renderer → Main：同步当前窗口的未读 task 数 */ "knorvia:sync-window-unread-count",
  SyncActiveTaskSession:
    /* Renderer → Main：当前窗口 active task，只更新 Main 的临时焦点映射。 */ "knorvia:sync-active-task-session",
  SyncAppSettings:
    /* Renderer → Main：同步 main 进程需即时感知的应用设置 */ "knorvia:sync-app-settings",
  SetShortcutRecordingActive:
    /* Renderer → Main：快捷键设置页录制态开关；true = main 暂时摘除可配置菜单 accelerator */ "knorvia:set-shortcut-recording-active",
  FocusTab: /* 派生自值表 */ channelValueTable2.focusTab,
  NewTab: /* 派生自值表 */ channelValueTable2.newTab,
  CloseActiveContextRequest:
    /* Main → Renderer：菜单或快捷键请求关闭当前上下文 */ "knorvia:close-active-context-request",
  OpenBrowserUrl:
    /* Main → Renderer：内置 webview 请求打开新的浏览器 tab */ "knorvia:open-browser-url",
  BrowserViewReady:
    /* Main → Renderer：agent 首次 browser 命令建好受控 view，通知 renderer 自动开 browser-use tab */ "knorvia:browser-view-ready",
  BrowserViewOperation:
    /* Main → Renderer：agent 正在操作某个 browser-use tab，renderer 临时显示状态图标 */ "knorvia:browser-view-operation",
  BrowserViewVisibility:
    /* Main → Renderer：browser visibility capability 显示/隐藏 IAB 右侧面板 */ "knorvia:browser-view-visibility",
  BrowserViewViewportChanged:
    /* Main → Renderer：Agent 设置/重置目标 tab viewport */ "knorvia:browser-view-viewport-changed",
  BrowserViewScreenshotSurfacePrepare:
    /* Main → Renderer：截图前请求 owner renderer 准备后台 guest 合成表面。 */ "knorvia:browser-view-screenshot-surface-prepare",
  BrowserViewScreenshotSurfaceReady:
    /* Renderer → Main：目标 guest 连续两个 animation frame 的 viewport 已稳定。 */ "knorvia:browser-view-screenshot-surface-ready",
  BrowserViewScreenshotSurfaceRelease:
    /* Main → Renderer：截图结束或准备失败，释放临时后台合成层。 */ "knorvia:browser-view-screenshot-surface-release",
  BrowserViewCloseTab:
    /* Main → Renderer：agent close 命令 detach 受控 guest 后，通知 renderer 卸载对应 tab */ "knorvia:browser-view-close-tab",
  BrowserViewSuspend:
    /* Main → Renderer：预算淘汰时卸载 guest，但保留 logical tab shell。 */ "knorvia:browser-view-suspend",
  BrowserViewRestore:
    /* Main → Renderer：为 suspended shell 重新挂载 guest。 */ "knorvia:browser-view-restore",
  NewTask: /* 派生自值表 */ channelValueTable2.newTask,
  OpenWorkspace: /* 派生自值表 */ channelValueTable2.openWorkspace,
  OpenWorkspacePath:
    /* Main → Renderer：deep link 直接打开指定本地工作区目录 */ "knorvia:open-workspace-path",
  OpenFeedbackDialog: /* 派生自值表 */ channelValueTable2.openFeedbackDialog,
  OpenTicketsPanel: /* 派生自值表 */ channelValueTable2.openTicketsPanel,
  WindowFullscreenChanged:
    /* Main → Renderer：窗口全屏状态变化 */ "knorvia:window-fullscreen-changed",
  GetDesktopWindowChromeState:
    /* Renderer → Main：读取窗口最大化状态与系统原生圆角能力 */ "knorvia:get-desktop-window-chrome-state",
  DesktopWindowChromeStateChanged:
    /* Main → Renderer：窗口最大化状态与系统原生圆角能力变化 */ "knorvia:desktop-window-chrome-state-changed",
  WindowControlsOverlayChanged:
    /* Main → Renderer：原生窗口控制区安全边距变化 */ "knorvia:window-controls-overlay-changed",
  WindowControlsOverlayReady:
    /* Preload → Main：preload 已同步读到当前窗口控制区安全边距 */ "knorvia:window-controls-overlay-ready",
  GetResourceUsageSnapshot:
    /* 获取资源管理器快照（CPU / 内存，按基础服务、内置插件、社区插件归类） */ "knorvia:get-resource-usage-snapshot",
  SetResourceUsageSamplingActive:
    /* 派生自值表 */ channelValueTable2.setResourceUsageSamplingActive,
  OpenResourceManager: /* 派生自值表 */ channelValueTable2.openResourceManager,
  StorageStartScan:
    /* 资源管理器「存储」tab：开始扫描本机 .knorvia-studio 占用（main 持有 StorageService，Worker 线程遍历） */ "knorvia:storage-start-scan",
  StorageCancelScan: /* 派生自值表 */ channelValueTable2.storageCancelScan,
  StorageGetSnapshot: /* 派生自值表 */ channelValueTable2.storageGetSnapshot,
  StorageClean: /* 派生自值表 */ channelValueTable2.storageClean,
  StorageRevealPath:
    /* 资源管理器「存储」tab：在系统文件管理器中定位数据根内的路径 */ "knorvia:storage-reveal-path",
  StorageScanProgress:
    /* Main → 资源管理器 renderer：扫描进度快照推送 */ "knorvia:storage-scan-progress",
  OpenExternal:
    /* Renderer → Main：打开外部 URL（用于 OAuth 跳转浏览器） */ "knorvia:open-external",
  CanOpenCommunity:
    /* Renderer → Main：查询当前语言下是否存在可用的用户社群入口 */ "knorvia:can-open-community",
  OpenInFileManager:
    /* Renderer → Main：在系统文件管理器中打开路径 */ "knorvia:open-in-file-manager",
  OpenExternalFile:
    /* Renderer → Main：使用系统默认应用打开本地文件 */ "knorvia:open-external-file",
  OpenCuaPermissionOnboarding:
    /* Renderer → Main：打开 Knorvia Computer Use 权限引导 */ "knorvia:open-cua-permission-onboarding",
  CancelCuaPermissionOnboarding:
    /* Renderer → Main：取消当前 renderer 发起的一次权限引导 participant */ "knorvia:cancel-cua-permission-onboarding",
  // Renderer → Main：预热并缓存已验证的 Helper 路径 + bundle 指纹。 必须在拖拽浮窗挂载时调用 ： dragstart 链路里不允许任何异步 I/O。
  PrepareCuaHelperPermissionDrag:
    /* 派生自值表 */ channelValueTable2.prepareCuaHelperPermissionDrag,
  StartCuaHelperPermissionDrag:
    /* Renderer → Main：把已验证的 Helper.app 同步拖出到 macOS 权限列表 */ "knorvia:start-cua-helper-permission-drag",
  // Renderer → Main：拖拽手势结束。 拖完授权即完成，浮窗该让位（用户此时要看设置页和系统的重启提示）。必须等 dragend 而不是 在 dragstart 里就收窗：startDrag 只是把 drag session 交给 OS，非阻塞，drag source 立刻消失可能打断正在进行的拖拽。。
  NotifyCuaHelperPermissionDragEnded:
    /* 频道名逐字冻结 */ "knorvia:notify-cua-helper-permission-drag-ended",
  RendererReady:
    /* Renderer → Main：renderer 已就绪，可接收缓存的 deep link */ "knorvia:renderer-ready",
  SyncTelemetryContext:
    /* Renderer → Main：同步当前 renderer 的 telemetry 上下文 */ "knorvia:sync-telemetry-context",
  ReportTelemetryEvent:
    /* Renderer → Main：通过统一 telemetry 层上报业务事件 */ "knorvia:report-telemetry-event",
  ReportArmsCustomEvent:
    /* Renderer → Main：上报 ARMS 自定义事件 */ "knorvia:report-arms-custom-event",
  GetRendererActionTraceConfig:
    /* Renderer → Main：读取 Renderer 用户操作 Trace 灰度配置。 */ "knorvia:get-renderer-action-trace-config",
  RendererActionTraceConfigChanged:
    /* Main → Renderer：Renderer 用户操作 Trace 灰度配置变化。 */ "knorvia:renderer-action-trace-config-changed",
  ReportRendererActionTraceBatch:
    /* Renderer → Main：发送已结束的 ui_action batch。 */ "knorvia:report-renderer-action-trace-batch",
  ReportRendererHeapSample:
    /* Renderer → Main：主窗口 renderer 每 60 秒的 heap 读数，单向 send，不需要回执。 */ "knorvia:report-renderer-heap-sample",
  ReportLocalTtftBatch: /* 派生自值表 */ channelValueTable2.reportLocalTtftBatch,
  ReadFinalArmsCustomEventsE2E:
    /* E2E preload → Main：读取 sendCustom 最终参数的内存 ring。 */ "knorvia:e2e:read-final-arms-custom-events",
  ClearFinalArmsCustomEventsE2E:
    /* E2E preload → Main：清空 sendCustom 最终参数的内存 ring。 */ "knorvia:e2e:clear-final-arms-custom-events",
  ConfigureFinalArmsCustomEventsE2E:
    /* E2E preload → Main：配置只针对目标 event name 的真实网络抑制。 */ "knorvia:e2e:configure-final-arms-custom-events",
  ShowTaskNotification:
    /* Renderer → Main：触发任务完成/失败的系统通知 */ "knorvia:show-task-notification",
  TaskNotificationSound:
    /* Main → Preload：通知 renderer 播放任务通知提示音 */ "knorvia:task-notification-sound",
  TaskNotificationClick:
    /* Main → Preload：用户点击了系统通知，携带 taskId 让 renderer 跳转到对应任务 */ "knorvia:task-notification-click",
  ExportLogs:
    /* Renderer → Main：导出日志（打包 ~/.knorvia-studio/v2 及外部 agent 日志为 zip 并在 Finder 中显示） */ "knorvia:export-logs",
  PreviewLocalDiagnostics: /* 派生自值表 */ channelValueTable2.previewLocalDiagnostics,
  ExportLocalDiagnostics: /* 派生自值表 */ channelValueTable2.exportLocalDiagnostics,
  CheckReleaseUpdate: /* 派生自值表 */ channelValueTable2.checkReleaseUpdate,
  InstallReleaseUpdate: /* 派生自值表 */ channelValueTable2.installReleaseUpdate,
  CaptureWindowScreenshot:
    /* Renderer → Main：截取当前窗口作为反馈附件 */ "knorvia:capture-window-screenshot",
  // Renderer → Main：`<webview>` guest dom-ready 后上报 webContentsId， main 用 BrowserGuestManager attach 该 guest（fire-and-forget）。CDP-on-guest pivot。。
  BrowserViewAttachGuest: /* 派生自值表 */ channelValueTable2.browserViewAttachGuest,
  BrowserViewDetachGuest:
    /* Renderer → Main：重建 `<webview>` 前主动断开旧 guest 的 CDP。 */ "knorvia:browser-view-detach-guest",
  BrowserViewCloseTabFromRenderer:
    /* Renderer → Main：用户显式关闭 Browser tab。 */ "knorvia:browser-view-close-tab-from-renderer",
  BrowserViewReportResidency:
    /* Renderer → Main：上报 Browser tab residency/display facts。 */ "knorvia:browser-view-report-residency",
  BrowserViewSuspendReady:
    /* Renderer → Main：指定 generation 的 guest 已卸载。 */ "knorvia:browser-view-suspend-ready",
  BrowserViewEnsureResident:
    /* Renderer → Main：用户访问 suspended tab，请求恢复。 */ "knorvia:browser-view-ensure-resident",
  BrowserViewRestoreTabs:
    /* Renderer → Main：读取 workspace/task 的持久化 logical shells。 */ "knorvia:browser-view-restore-tabs",
  BrowserViewUpdateViewport:
    /* Renderer → Main：自由尺寸拖拽/开关回写目标 guest viewport */ "knorvia:browser-view-update-viewport",
  EmbeddedBrowserJavaScriptDialog:
    /* Embedded Browser preload → Main：在网页原生 Dialog 创建前同步请求可信系统框。 */ "knorvia:embedded-browser-javascript-dialog",
  ImportChromeBrowserData:
    /* Renderer → Main：把自动发现的本机 Chrome Profile 数据一次性导入内置浏览器分区。 */ "knorvia:import-chrome-browser-data",
  ClearEmbeddedBrowserData:
    /* Renderer → Main：清理内置浏览器缓存或全部站点数据。 */ "knorvia:clear-embedded-browser-data",
  UpdateReady: /* 派生自值表 */ channelValueTable2.updateReady,
  UpdateCheckResult:
    /* Main → Renderer：用户手动点击"检查更新"后的结果反馈（toast 用） */ "knorvia:update-check-result",
  UpdateStateChanged:
    /* Main → Renderer：自动更新持续状态变化（菜单 UI 用） */ "knorvia:update-state-changed",
  GetUpdateState:
    /* Renderer → Main：主动获取当前自动更新状态（菜单打开时补偿事件丢失） */ "knorvia:get-update-state",
  DownloadUpdate: /* 派生自值表 */ channelValueTable2.downloadUpdate,
  CancelUpdateDownload:
    /* Renderer → Main：取消当前正在下载的自动更新 */ "knorvia:cancel-update-download",
  OpenUpdateStatusWindow:
    /* Renderer → Main：打开独立自动更新窗口 */ "knorvia:open-update-status-window",
  GetAutoUpdatePreferences:
    /* Renderer → Main：读取自动更新偏好 */ "knorvia:get-auto-update-preferences",
  SetAutoDownloadAndInstallUpdates:
    /* Renderer → Main：写入“自动下载并安装更新”偏好 */ "knorvia:set-auto-download-and-install-updates",
  GetDesktopSessionActivity:
    /* Renderer → Main：查询桌面端正在运行的会话数量 */ "knorvia:get-desktop-session-activity",
  GetDesktopZoomLevel:
    /* Renderer → Main：读取当前窗口页面缩放档位 */ "knorvia:get-desktop-zoom-level",
  DesktopZoomLevelChanged:
    /* Main → Renderer：当前窗口页面缩放档位变化 */ "knorvia:desktop-zoom-level-changed",
  GetKnorviaStdioTapDevState:
    /* Renderer → Main：读取开发态 stdio tap proxy 开关状态 */ "knorvia:get-stdio-tap-dev-state",
  SettingsChanged:
    /* Main → Renderer：本地 setting.json 已由 main 进程更新 */ "knorvia:settings-changed",
  ApplicationLocaleChanged:
    /* Main → Renderer：应用语言已切换 */ "knorvia:application-locale-changed",
  GetSystemLocale: /* 派生自值表 */ channelValueTable2.getSystemLocale,
  PostUpdateReleaseNotes:
    /* Main → Renderer：更新安装后的版本说明 */ "knorvia:post-update-release-notes",
  AcknowledgePostUpdateReleaseNotes:
    /* Renderer → Main：确认版本说明已读 */ "knorvia:ack-post-update-release-notes",
  SkipUpdateVersion:
    /* Renderer → Main：跳过当前已发现的自动更新版本 */ "knorvia:skip-update-version",
  QuitAndInstallUpdate:
    /* Renderer → Main：用户确认重启安装更新 */ "knorvia:quit-and-install-update",
  GetInstalledEditors:
    /* Renderer → Main：获取系统中已安装的编辑器/终端列表（含图标） */ "knorvia:get-installed-editors",
  GetApplicationIcon:
    /* Renderer → Main：按 bundle id 获取系统应用图标 */ "knorvia:get-application-icon",
  OpenInEditor: /* 派生自值表 */ channelValueTable2.openInEditor,
  ExecuteDesktopCommand:
    /* Renderer → Main：执行桌面窗口级命令 */ "knorvia:execute-desktop-command",
  SetApplicationLocale:
    /* Renderer → Main：同步应用菜单语言，用于重建原生菜单 */ "knorvia:set-application-locale",
  SetTitleBarTheme:
    /* Renderer → Main：同步标题栏亮暗色，用于原生窗口控制按钮配色 */ "knorvia:set-title-bar-theme",
  SetWindowGlass: /* 派生自值表 */ channelValueTable2.setWindowGlass,
  MigrateLegacyCommonMcp:
    /* Renderer → Main：迁移旧版 Common MCP 配置 */ "knorvia:migrate-legacy-common-mcp",
  GetDeviceId: /* 派生自值表 */ channelValueTable2.getDeviceId,
} as const; // 频道表冻结

export type PlatformChannelName = (typeof PlatformChannels)[keyof typeof PlatformChannels]; // 派生键联合 // 类型面

// ─────────────────────────────────────────────。
// 内置 WebView 频道 ： 固定 guest preload ↔ embedder renderer
// ─────────────────────────────────────────────。

// Electron `<webview>` 的 `sendToHost` / `ipc-message` 频道，不经过 main process。。
const channelValueTable3 = {} as const; // 频道字面值表
export const EmbeddedBrowserWebviewChannels = {
  // 常量面
  WheelBoundary:
    /* Guest 无法继续消费某方向的滚动时，把二维 delta 转交自由尺寸画布。 */ "knorvia:embedded-browser-wheel-boundary",
} as const; // 频道表冻结

type channelPayload1 = {
  // 请求/响应映射
  request: /* 布尔 */ boolean;
  response: /* 布尔 */ boolean;
};
type channelPayload6 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 文本 */ string | null;
};
type channelPayload11 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 文本 */ string | null;
};
type channelPayload16 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 文本 */ string[];
};
type channelPayload21 = {
  // 请求/响应映射
  request: /* 字段值 */ CreateTempTextAttachmentRequest;
  response: /* 字段值 */ CreateTempTextAttachmentResult;
};
type channelPayload26 = {
  // 请求/响应映射
  request: /* 字段值 */ SaveFileRequest;
  response: /* 字段值 */ SaveFileResult;
};
type channelPayload31 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ PrintPageToPdfResult;
};
type channelPayload36 = {
  // 请求/响应映射
  request: {
    label: /* 文本 */ string;
    requestId?: /* 文本 */ string;
    sessionId?: /* 文本 */ string;
    level: /* 联合 */ "info" | "warn" | "error";
    source: /* 文本 */ string;
    message: /* 文本 */ string;
    timestamp: /* 文本 */ string;
  };
  response: /* 字段值 */ void;
};
type channelPayload49 = {
  // 请求/响应映射
  request: /* 字段值 */ RemoteSessionClosedEvent;
  response: /* 字段值 */ void;
};
type channelPayload54 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 布尔 */ { activated: boolean };
};
type channelPayload59 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload64 = {
  // 请求/响应映射
  request: /* 字段值 */ ConnectRemoteRequest;
  response: /* 布尔 */ { success: boolean; error?: string; sessionId?: string };
};
type channelPayload69 = {
  // 请求/响应映射
  request: /* 字段值 */ CancelPendingRemoteConnectionRequest;
  response: /* 字段值 */ void;
};
type channelPayload74 = {
  // 请求/响应映射
  request: /* 字段值 */ BindRemoteWorkspaceSessionContextRequest;
  response: /* 字段值 */ void;
};
type channelPayload79 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload84 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 布尔 */ boolean;
};
type channelPayload89 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 数组 */ WSLDistro[];
};
type channelPayload94 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 数组 */ DockerContainerInfo[];
};
type channelPayload99 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 数组 */ SSHConfigAliasOption[];
};
type channelPayload104 = {
  // 请求/响应映射
  request: /* 字段值 */ LoadCliMcpFromUserDirectoryRequest;
  response: /* 字段值 */ LoadCliMcpFromUserDirectoryResult;
};
type channelPayload109 = {
  // 请求/响应映射
  request: /* 字段值 */ SaveCliMcpToUserDirectoryRequest;
  response: /* 布尔 */ { success: boolean; error?: string };
};
type channelPayload114 = {
  // 请求/响应映射
  request: /* 字段值 */ MigrateLegacyCommonMcpRequest;
  response: /* 字段值 */ MigrateLegacyCommonMcpResult;
};
type channelPayload119 = {
  // 请求/响应映射
  request: /* 联合 */ { level: "info" | "warn" | "error"; args: unknown[] };
  response: /* 字段值 */ void;
};
type channelPayload124 = {
  // 请求/响应映射
  request: /* 数值 */ number;
  response: /* 字段值 */ void;
};
type channelPayload129 = {
  // 请求/响应映射
  request: /* 字段值 */ Partial<AppSettings>;
  response: /* 字段值 */ void;
};
type channelPayload134 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ ResourceUsageSnapshot;
};
type channelPayload139 = {
  // 请求/响应映射
  request: /* 布尔 */ boolean;
  response: /* 字段值 */ void;
};
type channelPayload144 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 文本 */ { jobId: string };
};
type channelPayload149 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload154 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 联合 */ StorageUsageSnapshot | null;
};
type channelPayload159 = {
  // 请求/响应映射
  request: /* 字段值 */ StorageCleanRequest;
  response: /* 字段值 */ StorageCleanResult;
};
type channelPayload164 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload169 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload174 = {
  // 请求/响应映射
  request: /* 字段值 */ EmbeddedBrowserOpenUrlRequest;
  response: /* 字段值 */ void;
};
type channelPayload179 = {
  // 请求/响应映射
  request: {
    workspaceKey: /* 文本 */ string;
    remoteSessionId?: /* 文本 */ string;
    sessionId: /* 文本 */ string;
    tabId: /* 文本 */ string;
    browserId: /* 文本 */ string;
    browserGeneration: /* 数值 */ number;
  };
  response: /* 字段值 */ void;
};
type channelPayload191 = {
  // 请求/响应映射
  request: {
    visible: /* 布尔 */ boolean;
    workspaceKey: /* 文本 */ string;
    remoteSessionId: /* 文本 */ string | undefined;
    sessionId: /* 文本 */ string;
    tabId?: /* 文本 */ string;
    browserId: /* 文本 */ string;
    browserGeneration: /* 数值 */ number;
  };
  response: /* 字段值 */ void;
};
type channelPayload204 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewViewportChangedPayload;
  response: /* 字段值 */ void;
};
type channelPayload209 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewScreenshotSurfacePreparePayload;
  response: /* 字段值 */ void;
};
type channelPayload214 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewScreenshotSurfaceReadyPayload;
  response: /* 字段值 */ void;
};
type channelPayload219 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewScreenshotSurfaceReleasePayload;
  response: /* 字段值 */ void;
};
type channelPayload224 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewCloseTabNotification;
  response: /* 字段值 */ void;
};
type channelPayload229 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewResidencyTransitionPayload;
  response: /* 字段值 */ void;
};
type channelPayload234 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewResidencyTransitionPayload;
  response: /* 字段值 */ void;
};
type channelPayload239 = {
  // 请求/响应映射
  request: /* 字段值 */ Locale;
  response: /* 布尔 */ boolean;
};
type channelPayload244 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 布尔 */ { success: boolean; error?: string };
};
type channelPayload249 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 布尔 */ { success: boolean; error?: string };
};
type channelPayload254 = {
  // 请求/响应映射
  request: /* 联合 */ OpenCuaPermissionOnboardingOptions | undefined;
  response: /* 字段值 */ CuaAccessibilitySettingsResult;
};
type channelPayload259 = {
  // 请求/响应映射
  request: /* 字段值 */ undefined;
  response: /* 字段值 */ PrepareCuaHelperPermissionDragResult;
};
type channelPayload264 = {
  // 请求/响应映射
  request: /* 字段值 */ undefined;
  response: /* 字段值 */ void;
};
type channelPayload269 = {
  // 请求/响应映射
  request: /* 字段值 */ undefined;
  response: /* 字段值 */ void;
};
type channelPayload274 = {
  // 请求/响应映射
  request: /* 文本 */ { operationId: string };
  response: /* 字段值 */ void;
};
type channelPayload279 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload284 = {
  // 请求/响应映射
  request: /* 字段值 */ TelemetryRendererContext;
  response: /* 字段值 */ void;
};
type channelPayload289 = {
  // 请求/响应映射
  request: /* 字段值 */ RendererTelemetryEventPayload;
  response: /* 字段值 */ void;
};
type channelPayload294 = {
  // 请求/响应映射
  request: /* 字段值 */ ArmsCustomEventPayload;
  response: /* 字段值 */ void;
};
type channelPayload299 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ RendererActionTraceConfigV1;
};
type channelPayload304 = {
  // 请求/响应映射
  request: /* 字段值 */ RendererActionTraceConfigV1;
  response: /* 字段值 */ void;
};
type channelPayload309 = {
  // 请求/响应映射
  request: /* 字段值 */ RendererActionTraceBatchV1;
  response: /* 字段值 */ void;
};
type channelPayload314 = {
  // 请求/响应映射
  request: /* 字段值 */ RendererHeapSample;
  response: /* 字段值 */ void;
};
type channelPayload319 = {
  request: /* 字段值 */ void;
  response: /* 数组 */ FinalArmsCustomEventE2EEntry[];
};
type channelPayload323 = {
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload327 = {
  request: /* 字段值 */ ConfigureFinalArmsCustomEventE2ERequest;
  response: /* 字段值 */ void;
};
type channelPayload331 = {
  // 请求/响应映射
  request: /* 字段值 */ TaskNotificationPayload;
  response: /* 字段值 */ void;
};
type channelPayload336 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload341 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload346 = {
  // 请求/响应映射
  request: /* 布尔 */ boolean;
  response: /* 字段值 */ void;
};
type channelPayload351 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ DesktopWindowChromeState;
};
type channelPayload356 = {
  // 请求/响应映射
  request: /* 字段值 */ DesktopWindowChromeState;
  response: /* 字段值 */ void;
};
type channelPayload361 = {
  // 请求/响应映射
  request: /* 字段值 */ WindowControlsOverlayMetrics;
  response: /* 字段值 */ void;
};
type channelPayload366 = {
  // 请求/响应映射
  request: /* 字段值 */ WindowControlsOverlayReadyPayload;
  response: /* 字段值 */ void;
};
type channelPayload371 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 布尔 */ { success: boolean; path?: string; error?: string };
};
type channelPayload376 = {
  // 请求/响应映射
  request: /* 字段值 */ import("./localDiagnostics.js").LocalDiagnosticRequest;
  response: /* 字段值 */ import("./localDiagnostics.js").LocalDiagnosticPreview;
};
type channelPayload381 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ import("./localDiagnostics.js").LocalDiagnosticExportResult;
};
type channelPayload386 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ import("./releaseUpdate.js").ReleaseUpdateCheckResult;
};
type channelPayload391 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ import("./releaseUpdate.js").ReleaseUpdateInstallResult;
};
type channelPayload396 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: {
    dataBase64: /* 文本 */ string;
    filename: /* 文本 */ string;
    contentType: /* 文本 */ string;
    size: /* 数值 */ number;
  } | null;
};
type channelPayload406 = {
  // 请求/响应映射
  request: {
    key: /* 文本 */ string;
    webContentsId: /* 数值 */ number;
    active?: /* 布尔 */ boolean;
    workspaceKey?: /* 文本 */ string;
    remoteSessionId?: /* 文本 */ string;
    sessionId?: /* 文本 */ string;
    residencyGeneration?: /* 数值 */ number;
  };
  response: /* 字段值 */ void;
};
type channelPayload419 = {
  // 请求/响应映射
  request: /* 数值 */ { key: string; webContentsId: number };
  response: /* 布尔 */ boolean;
};
type channelPayload424 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewCloseTabRequest;
  response: /* 字段值 */ void;
};
type channelPayload429 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewResidencyReportPayload;
  response: /* 字段值 */ void;
};
type channelPayload434 = {
  // 请求/响应映射
  request: /* 数值 */ { tabId: string; generation: number };
  response: /* 字段值 */ void;
};
type channelPayload439 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewCloseTabRequest;
  response: /* 字段值 */ void;
};
type channelPayload444 = {
  // 请求/响应映射
  request: /* 字段值 */ BrowserViewRestoreTabsRequest;
  response: /* 数组 */ BrowserViewRestoredTabShell[];
};
type channelPayload449 = {
  // 请求/响应映射
  request: /* 文本 */ { tabId: string; viewport: BrowserViewportSize | null };
  response: /* 字段值 */ void;
};
type channelPayload454 = {
  // 请求/响应映射
  request: {
    type: /* 联合 */ "alert" | "confirm";
    message: /* 文本 */ string;
  };
  response: {
    handled: /* 布尔 */ boolean;
    value?: /* 布尔 */ boolean;
  };
};
type channelPayload465 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload470 = {
  // 请求/响应映射
  request: /* 字段值 */ UpdateCheckResultPayload;
  response: /* 字段值 */ void;
};
type channelPayload475 = {
  // 请求/响应映射
  request: /* 字段值 */ UpdateStatePayload;
  response: /* 字段值 */ void;
};
type channelPayload480 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ UpdateStatePayload;
};
type channelPayload485 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload490 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload495 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload500 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: {
    autoDownloadAndInstallUpdates: /* 布尔 */ boolean;
  };
};
type channelPayload507 = {
  // 请求/响应映射
  request: /* 布尔 */ boolean;
  response: /* 字段值 */ void;
};
type channelPayload512 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload517 = {
  // 请求/响应映射
  request: /* 字段值 */ Locale;
  response: /* 字段值 */ void;
};
type channelPayload522 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ Locale;
};
type channelPayload527 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: {
    runningAgentSessionCount: /* 数值 */ number;
  };
};
type channelPayload534 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ DesktopZoomState;
};
type channelPayload539 = {
  // 请求/响应映射
  request: /* 字段值 */ DesktopZoomState;
  response: /* 字段值 */ void;
};
type channelPayload544 = {
  // 请求/响应映射
  request: /* 字段值 */ PostUpdateReleaseNotesPayload;
  response: /* 字段值 */ void;
};
type channelPayload549 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload554 = {
  // 请求/响应映射
  request: /* 文本 */ string;
  response: /* 字段值 */ void;
};
type channelPayload559 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload564 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 数组 */ EditorInfo[];
};
type channelPayload569 = {
  // 请求/响应映射
  request: /* 文本 */ string | import("./platform.js").ApplicationIconRequest;
  response: /* 联合 */ import("./platform.js").ApplicationIconInfo | null;
};
type channelPayload574 = {
  // 请求/响应映射
  request: /* 文本 */ { editorId: string; path: string; options?: OpenInEditorOptions };
  response: /* 布尔 */ { success: boolean; error?: string };
};
type channelPayload579 = {
  // 请求/响应映射
  request: /* 字段值 */ void;
  response: /* 字段值 */ void;
};
type channelPayload584 = {
  // 请求/响应映射
  request: /* 字段值 */ DesktopCommandId;
  // 返回值直通 main 进程 handler 的 return（GetCuaOsSupport 返回 CuaOsSupport），。
  // 与 renderer 侧 IPlatformService.executeDesktopCommand 的 Promise<unknown> 对齐。。
  response: /* 字段值 */ unknown;
};
type channelPayload591 = {
  // 请求/响应映射
  request: /* 字段值 */ Locale;
  response: /* 字段值 */ void;
};
type channelPayload596 = {
  // 请求/响应映射
  request: /* 字段值 */ DesktopTitleBarTheme;
  response: /* 字段值 */ void;
};

export interface EmbeddedBrowserWheelBoundaryPayload {
  deltaY: /* 数值 */ number;
  // 字段面
  deltaX: /* 数值 */ number;
}

// ─────────────────────────────────────────────。
// Coding Plan WebView 频道 ： 官网页 preload ↔ App renderer
// ─────────────────────────────────────────────。

// Electron `<webview>`（partition=persist:knorvia-coding-plan）的 `sendToHost` / `ipc-message` 频道。 官网页通过 preload 注入的 window.knorviaBridge 调用，不经过 main process。。
export const CodingPlanWebviewChannels = {
  // 常量面
  PurchaseComplete:
    /* 官网页购买成功后通知 App 刷新 entitlements 并关闭 webview。 */ "knorvia:coding-plan-purchase-complete",
} as const; // 频道表冻结

// 购买完成回传 payload。provider 与官网 CodingPlanProvider / auth-ready 事件 detail.provider 同构。。
export interface CodingPlanPurchaseCompletePayload {
  timestamp: /* 数值 */ number;
  // 字段面
  provider: /* 联合 */ "zai" | "bigmodel";
  // 客户端时间戳，用于 App 侧去重/日志，不参与判等。。
}

// 官网页 window.__knorviaLang__ 的取值，与 App IntlProvider 的 Locale 一致。 App locale 变化时通过 executeJavaScript 重写此变量并派发 lang-change 事件。。
export type CodingPlanWebviewLocale = "zh-CN" | "en-US"; // 类型面

// 官网页 lang-change 事件 detail。App 用 executeJavaScript 在 main world 派发 `knorvia-coding-plan-lang-change` CustomEvent，website 侧（knorviaBridge.onLangChange 或 直接 window.addEventListener）订阅后切换 copy。。
export interface CodingPlanWebviewLangChangeDetail {
  locale: /* 字段值 */ CodingPlanWebviewLocale;
  // 字段面
}

// ─────────────────────────────────────────────。
// 内部传输频道 ： 框架级别的通信
// ─────────────────────────────────────────────。
// 内部传输频道。用于 MessagePort 转发等框架级通信。。
const channelValueTable5 = {
  databaseStartupState: /* 频道名逐字冻结 */ "knorvia:database-startup-state",
  databaseStartupControl: /* 频道名逐字冻结 */ "knorvia:database-startup-control",
} as const; // 频道字面值表
export const InternalChannels = {
  // 常量面
  DatabaseStartupState: /* 派生自值表 */ channelValueTable5.databaseStartupState,
  DatabaseStartupControl: /* 派生自值表 */ channelValueTable5.databaseStartupControl,
  ServicePort:
    /* main → renderer 转发 MessagePort（通过 webContents.postMessage） */ "knorvia:service-port",
  ScopedServicePort:
    /* main → renderer 转发窗口 Host 的 scoped MessagePort */ "knorvia:scoped-service-port",
  ScopedServicePortReady:
    /* renderer → main：scoped MessagePort 已注册，可安全切换 attachment */ "knorvia:scoped-service-port-ready",
  TaskNotificationSound:
    /* preload → renderer：主进程已确认系统通知展示，renderer 可播放提示音 */ "knorvia:task-notification-sound",
} as const; // 频道表冻结

// @deprecated `/ws` 已忽略该头；保留常量仅供旧客户端兼容。。
export const KNORVIA_RPC_CLIENT_MODE_HEADER = /* 频道名逐字冻结 */ "x-knorvia-rpc-client-mode";
// desktop 先经受保护 HTTP endpoint 申请，再在 `/ws/host` 握手时一次性消费。。
export const KNORVIA_RPC_HOST_CAPABILITY_HEADER =
  /* 频道名逐字冻结 */ "x-knorvia-rpc-host-capability";

// ─────────────────────────────────────────────。
// 进程间消息类型 ： main ↔ host process 之间的 postMessage
// ─────────────────────────────────────────────。

// main → host process 的初始化消息类型。
const channelValueTable6 = {
  databaseStartupControl: /* 频道名逐字冻结 */ "database-startup-control",
  initLocal: /* 频道名逐字冻结 */ "init-local",
  dispose: /* 频道名逐字冻结 */ "dispose",
  broadcast: /* 频道名逐字冻结 */ "broadcast",
  broadcastClaimResult: /* 频道名逐字冻结 */ "broadcast-claim-result",
  taskRunLeaseResult: /* 频道名逐字冻结 */ "task-run-lease-result",
  feedbackLogArchiveResult: /* 频道名逐字冻结 */ "feedback-log-archive-result",
  resourceUsageSnapshotCancel: /* 频道名逐字冻结 */ "resource-usage-snapshot-cancel",
} as const; // 频道字面值表
export const HostMessageTypes = {
  // 常量面
  DatabaseStartupControl: /* 派生自值表 */ channelValueTable6.databaseStartupControl,
  InitLocal: /* 派生自值表 */ channelValueTable6.initLocal,
  ConnectRemoteWorkspace:
    /* main → window Host：在当前窗口建立一个远程 logical session */ "connect-remote-workspace",
  CancelRemoteWorkspaceConnect:
    /* main → window Host：取消尚未完成的远程连接 */ "cancel-remote-workspace-connect",
  BindRemoteWorkspaceContext:
    /* main → window Host：为 logical session 绑定 canonical workspace 身份 */ "bind-remote-workspace-context",
  DisposeRemoteWorkspaceSession:
    /* main → window Host：释放一个远程 logical session */ "dispose-remote-workspace-session",
  AttachServicePort:
    /* main → host：复用现有服务，对新的 RPC MessagePort 暴露服务 */ "attach-service-port",
  DetachServicePort:
    /* main → host：精确释放一个 RPC MessagePort attachment */ "detach-service-port",
  Dispose: /* 派生自值表 */ channelValueTable6.dispose,
  Broadcast: /* 派生自值表 */ channelValueTable6.broadcast,
  BroadcastClaimResult: /* 派生自值表 */ channelValueTable6.broadcastClaimResult,
  TaskRealtimeDeliver:
    /* main → host：task realtime invalidation delivery */ "task-realtime-deliver",
  TaskRunLeaseResult: /* 派生自值表 */ channelValueTable6.taskRunLeaseResult,
  TaskOwnerCommandDeliver:
    /* main → host：deliver owner-only task command */ "task-owner-command-deliver",
  TaskOwnerCommandResult:
    /* main → host：deliver owner command result to requester */ "task-owner-command-result",
  SessionMessageDeliver:
    /* main → host：把 session message 投递到该 host 管理的目标 session */ "session-message-deliver",
  SessionMessageDeliveryResult:
    /* main → host：把 session message 投递结果回写到源 session */ "session-message-delivery-result",
  FeedbackLogArchiveResult: /* 派生自值表 */ channelValueTable6.feedbackLogArchiveResult,
  CronRun:
    /* main → host：定时任务到点派发；会话内 cron 复用 targetTaskId，历史未绑定任务才建 session */ "cron-run",
  OffPeakRun:
    /* main → host：闲时任务派发；首跑 createTask 新建 session，续跑带 conversationId/sessionId resume */ "off-peak-run",
  BrowserExecuteResult:
    /* main → host：browser-use 命令执行结果（CDP 执行完回传，按 requestId 关联） */ "browser-execute-result",
  LocalMediaPreviewPathAuthorizeResult:
    /* main → host：本地视频 canonical path 授权结果 */ "local-media-preview-path-authorize-result",
  CuaPipFocusChanged:
    /* Main → Host：全局前台 Knorvia 窗口派生的 producer focus fact。 */ "cua-pip-focus-changed",
  ResourceUsageSnapshotRequest:
    /* main → host：资源管理器请求 Host 采样其后代进程（Agent / MCP / 终端）的 CPU 与内存 */ "resource-usage-snapshot-request",
  ResourceUsageSnapshotCancel: /* 派生自值表 */ channelValueTable6.resourceUsageSnapshotCancel,
} as const; // 频道表冻结

// host process → main process 的反馈消息类型。
const channelValueTable7 = {
  databaseStartupState: /* 频道名逐字冻结 */ "database-startup-state",
  log: /* 频道名逐字冻结 */ "log",
  agentProcessSpawned: /* 频道名逐字冻结 */ "agent-process-spawned",
  agentProcessReady: /* 频道名逐字冻结 */ "agent-process-ready",
  agentProcessExited: /* 频道名逐字冻结 */ "agent-process-exited",
  agentProcessError: /* 频道名逐字冻结 */ "agent-process-error",
  agentProcessException: /* 频道名逐字冻结 */ "agent-process-exception",
  agentResourceSample: /* 频道名逐字冻结 */ "agent-resource-sample",
  mcpTelemetry: /* 频道名逐字冻结 */ "mcp-telemetry",
  mcpResourceSamples: /* 频道名逐字冻结 */ "mcp-resource-samples",
  toolExecResource: /* 频道名逐字冻结 */ "tool-exec-resource",
  broadcast: /* 频道名逐字冻结 */ "broadcast",
  broadcastClaimRequest: /* 频道名逐字冻结 */ "broadcast-claim-request",
  taskRealtimePublish: /* 频道名逐字冻结 */ "task-realtime-publish",
  taskStreamOpPublish: /* 频道名逐字冻结 */ "task-stream-op-publish",
  taskRunLeaseAcquire: /* 频道名逐字冻结 */ "task-run-lease-acquire",
  taskRunLeaseRelease: /* 频道名逐字冻结 */ "task-run-lease-release",
} as const; // 频道字面值表
export const HostResponseTypes = {
  // 常量面
  DatabaseStartupState: /* 派生自值表 */ channelValueTable7.databaseStartupState,
  RemoteWorkspaceConnectionLog:
    /* window Host → main：按 requestId 上报远程连接过程日志 */ "remote-workspace-connection-log",
  RemoteWorkspaceConnected:
    /* window Host → main：远程 logical session 已建立 */ "remote-workspace-connected",
  RemoteWorkspaceConnectFailed:
    /* window Host → main：远程 logical session 建立失败 */ "remote-workspace-connect-failed",
  RemoteWorkspaceClosed:
    /* window Host → main：已连接的远程 logical session 关闭 */ "remote-workspace-closed",
  Log: /* 派生自值表 */ channelValueTable7.log,
  AgentProcessSpawned: /* 派生自值表 */ channelValueTable7.agentProcessSpawned,
  AgentProcessReady: /* 派生自值表 */ channelValueTable7.agentProcessReady,
  AgentProcessExited: /* 派生自值表 */ channelValueTable7.agentProcessExited,
  AgentProcessError: /* 派生自值表 */ channelValueTable7.agentProcessError,
  AgentProcessException: /* 派生自值表 */ channelValueTable7.agentProcessException,
  AgentResourceSample: /* 派生自值表 */ channelValueTable7.agentResourceSample,
  HostResourceSample:
    /* host → main：Host 进程自身每 60 秒自采的 CPU / RSS / heap（资源遥测 host 角色的 heap 来源） */ "host-resource-sample",
  McpTelemetry: /* 派生自值表 */ channelValueTable7.mcpTelemetry,
  McpResourceSamples: /* 派生自值表 */ channelValueTable7.mcpResourceSamples,
  ToolExecResource: /* 派生自值表 */ channelValueTable7.toolExecResource,
  SessionCreateTelemetry:
    /* 自动化 Host 首次输入 accepted 后报告新建 Session。 */ "session-create-telemetry",
  ResourceUsageSnapshotResult:
    /* host → main：资源管理器采样结果（按 requestId 关联） */ "resource-usage-snapshot-result",
  AgentRunningTaskCountChanged:
    /* host 内当前正在执行 prompt 的 agent session 数量变化 */ "agent-running-task-count-changed",
  WorkspaceRunningTaskCountChanged:
    /* host 内指定 workspace 当前仍未 terminal 的 task 数量变化 */ "workspace-running-task-count-changed",
  CuaOperationState:
    /* host → main：Windows desktop-local CUA turn 的操作提示状态 */ "cua-operation-state",
  RemoteWorkspaceAcquired:
    /* host → main：workspace generation 已可安全 attach */ "remote-workspace-acquired",
  Broadcast: /* 派生自值表 */ channelValueTable7.broadcast,
  BroadcastClaimRequest: /* 派生自值表 */ channelValueTable7.broadcastClaimRequest,
  BroadcastClaimCommit:
    /* host → main：把临时 claim reservation 提交为永久 claim */ "broadcast-claim-commit",
  BroadcastClaimRelease:
    /* host → main：按 token 释放尚未提交的 claim reservation */ "broadcast-claim-release",
  TaskRealtimePublish: /* 派生自值表 */ channelValueTable7.taskRealtimePublish,
  TaskStreamOpPublish: /* 派生自值表 */ channelValueTable7.taskStreamOpPublish,
  TaskRunLeaseAcquire: /* 派生自值表 */ channelValueTable7.taskRunLeaseAcquire,
  TaskRunLeaseRelease: /* 派生自值表 */ channelValueTable7.taskRunLeaseRelease,
  TaskOwnerCommandRequest:
    /* host → main：observer 请求 owner 执行 task command */ "task-owner-command-request",
  TaskOwnerCommandResult:
    /* host → main：owner 返回 task command result */ "task-owner-command-result",
  SessionMessageSendRequested:
    /* host → main：Agent 请求向另一个 session 发送消息 */ "session-message-send-requested",
  SessionRouteAnnounce:
    /* host → main：声明一个 Knorvia Agent session 当前归属该 host */ "session-route-announce",
  SessionMessageDeliverResult:
    /* host → main：目标 host 完成本地 session message 投递 */ "session-message-deliver-result",
  FeedbackLogArchiveRequest:
    /* host → main：请求 main 复用导出日志逻辑创建反馈日志归档 */ "feedback-log-archive-request",
  CronRunResult:
    /* host → main：定时任务派发结果（成功回填 taskId/sessionId，失败带 transient/permanent） */ "cron-run-result",
  OffPeakRunResult:
    /* host → main：闲时任务派发结果（成功回填 conversationId/sessionId，失败带 transient/permanent） */ "off-peak-run-result",
  CronSchedulerWakeRequest:
    /* host → main：manual run 已落库，请立即唤醒 scheduler 认领派发 */ "cron-scheduler-wake-request",
  OffPeakSchedulerWakeRequest:
    /* host → main：闲时任务翻 schedulable，请立即唤醒 scheduler 认领派发（与 cron 消息独立） */ "off-peak-scheduler-wake-request",
  BrowserExecuteRequest:
    /* host → main：执行一条 browser-use 命令（main 用 WebContentsView+CDP 执行，按 requestId 关联） */ "browser-execute-request",
  LocalMediaPreviewPathAuthorizeRequest:
    /* host → main：请求授权 Agent 已精确校验的本地视频路径 */ "local-media-preview-path-authorize-request",
  NetworkTelemetryBatch:
    /* host → main：RPC 网络遥测批次（channel.command 成功率/耗时） */ "network-telemetry-batch",
} as const; // 频道表冻结

// ─────────────────────────────────────────────。
// 平台频道类型映射 ： request/response 类型安全
// ─────────────────────────────────────────────。

// 平台频道的请求/响应类型映射。
export interface PlatformChannelMap {
  [PlatformChannels.SetWindowGlass]: channelPayload1; // 映射到命名载荷
  // 字段面
  [PlatformChannels.SelectDirectory]: channelPayload6; // 映射到命名载荷
  [PlatformChannels.SelectFile]: channelPayload11; // 映射到命名载荷
  [PlatformChannels.SelectFiles]: channelPayload16; // 映射到命名载荷
  [PlatformChannels.CreateTempTextAttachment]: channelPayload21; // 映射到命名载荷
  [PlatformChannels.SaveFile]: channelPayload26; // 映射到命名载荷
  [PlatformChannels.PrintToPdf]: channelPayload31; // 映射到命名载荷
  [PlatformChannels.RemoteConnectionLog]: channelPayload36; // 映射到命名载荷
  [PlatformChannels.RemoteSessionClosed]: channelPayload49; // 映射到命名载荷
  [PlatformChannels.ActivateOrSetWorkspace]: channelPayload54; // 映射到命名载荷
  [PlatformChannels.OpenWorkspacePath]: channelPayload59; // 映射到命名载荷
  [PlatformChannels.ConnectRemote]: channelPayload64; // 映射到命名载荷
  [PlatformChannels.CancelPendingRemoteConnection]: channelPayload69; // 映射到命名载荷
  [PlatformChannels.BindRemoteWorkspaceSessionContext]: channelPayload74; // 映射到命名载荷
  [PlatformChannels.DisposeRemoteSession]: channelPayload79; // 映射到命名载荷
  [PlatformChannels.IsDockerAvailable]: channelPayload84; // 映射到命名载荷
  [PlatformChannels.ListWSLDistros]: channelPayload89; // 映射到命名载荷
  [PlatformChannels.ListDockerContainers]: channelPayload94; // 映射到命名载荷
  [PlatformChannels.ListSSHConfigAliases]: channelPayload99; // 映射到命名载荷
  [PlatformChannels.LoadMcpFromUserDirectory]: channelPayload104; // 映射到命名载荷
  [PlatformChannels.SaveMcpToUserDirectory]: channelPayload109; // 映射到命名载荷
  [PlatformChannels.MigrateLegacyCommonMcp]: channelPayload114; // 映射到命名载荷
  [PlatformChannels.Log]: channelPayload119; // 映射到命名载荷
  [PlatformChannels.SyncWindowUnreadCount]: channelPayload124; // 映射到命名载荷
  [PlatformChannels.SyncAppSettings]: channelPayload129; // 映射到命名载荷
  [PlatformChannels.GetResourceUsageSnapshot]: channelPayload134; // 映射到命名载荷
  [PlatformChannels.SetResourceUsageSamplingActive]: channelPayload139; // 映射到命名载荷
  [PlatformChannels.StorageStartScan]: channelPayload144; // 映射到命名载荷
  [PlatformChannels.StorageCancelScan]: channelPayload149; // 映射到命名载荷
  [PlatformChannels.StorageGetSnapshot]: channelPayload154; // 映射到命名载荷
  [PlatformChannels.StorageClean]: channelPayload159; // 映射到命名载荷
  [PlatformChannels.StorageRevealPath]: channelPayload164; // 映射到命名载荷
  [PlatformChannels.OpenExternal]: channelPayload169; // 映射到命名载荷
  [PlatformChannels.OpenBrowserUrl]: channelPayload174; // 映射到命名载荷
  [PlatformChannels.BrowserViewReady]: channelPayload179; // 映射到命名载荷
  [PlatformChannels.BrowserViewVisibility]: channelPayload191; // 映射到命名载荷
  [PlatformChannels.BrowserViewViewportChanged]: channelPayload204; // 映射到命名载荷
  [PlatformChannels.BrowserViewScreenshotSurfacePrepare]: channelPayload209; // 映射到命名载荷
  [PlatformChannels.BrowserViewScreenshotSurfaceReady]: channelPayload214; // 映射到命名载荷
  [PlatformChannels.BrowserViewScreenshotSurfaceRelease]: channelPayload219; // 映射到命名载荷
  [PlatformChannels.BrowserViewCloseTab]: channelPayload224; // 映射到命名载荷
  [PlatformChannels.BrowserViewSuspend]: channelPayload229; // 映射到命名载荷
  [PlatformChannels.BrowserViewRestore]: channelPayload234; // 映射到命名载荷
  [PlatformChannels.CanOpenCommunity]: channelPayload239; // 映射到命名载荷
  [PlatformChannels.OpenInFileManager]: channelPayload244; // 映射到命名载荷
  [PlatformChannels.OpenExternalFile]: channelPayload249; // 映射到命名载荷
  [PlatformChannels.OpenCuaPermissionOnboarding]: channelPayload254; // 映射到命名载荷
  [PlatformChannels.PrepareCuaHelperPermissionDrag]: channelPayload259; // 映射到命名载荷
  // 单向 send（不是 invoke）：dragstart 必须同步发起，等不了 invoke 的往返。。
  [PlatformChannels.StartCuaHelperPermissionDrag]: channelPayload264; // 映射到命名载荷
  [PlatformChannels.NotifyCuaHelperPermissionDragEnded]: channelPayload269; // 映射到命名载荷
  [PlatformChannels.CancelCuaPermissionOnboarding]: channelPayload274; // 映射到命名载荷
  [PlatformChannels.RendererReady]: channelPayload279; // 映射到命名载荷
  [PlatformChannels.SyncTelemetryContext]: channelPayload284; // 映射到命名载荷
  [PlatformChannels.ReportTelemetryEvent]: channelPayload289; // 映射到命名载荷
  [PlatformChannels.ReportArmsCustomEvent]: channelPayload294; // 映射到命名载荷
  [PlatformChannels.GetRendererActionTraceConfig]: channelPayload299; // 映射到命名载荷
  [PlatformChannels.RendererActionTraceConfigChanged]: channelPayload304; // 映射到命名载荷
  [PlatformChannels.ReportRendererActionTraceBatch]: channelPayload309; // 映射到命名载荷
  // 单向 send（不是 invoke）：60 秒一条的旁路遥测样本，renderer 不等 main 回执。。
  [PlatformChannels.ReportRendererHeapSample]: channelPayload314; // 映射到命名载荷
  [PlatformChannels.ReadFinalArmsCustomEventsE2E]: channelPayload319; // 映射到命名载荷
  [PlatformChannels.ClearFinalArmsCustomEventsE2E]: channelPayload323; // 映射到命名载荷
  [PlatformChannels.ConfigureFinalArmsCustomEventsE2E]: channelPayload327; // 映射到命名载荷
  [PlatformChannels.ShowTaskNotification]: channelPayload331; // 映射到命名载荷
  [PlatformChannels.TaskNotificationSound]: channelPayload336; // 映射到命名载荷
  [PlatformChannels.TaskNotificationClick]: channelPayload341; // 映射到命名载荷
  [PlatformChannels.WindowFullscreenChanged]: channelPayload346; // 映射到命名载荷
  [PlatformChannels.GetDesktopWindowChromeState]: channelPayload351; // 映射到命名载荷
  [PlatformChannels.DesktopWindowChromeStateChanged]: channelPayload356; // 映射到命名载荷
  [PlatformChannels.WindowControlsOverlayChanged]: channelPayload361; // 映射到命名载荷
  [PlatformChannels.WindowControlsOverlayReady]: channelPayload366; // 映射到命名载荷
  [PlatformChannels.ExportLogs]: channelPayload371; // 映射到命名载荷
  [PlatformChannels.PreviewLocalDiagnostics]: channelPayload376; // 映射到命名载荷
  [PlatformChannels.ExportLocalDiagnostics]: channelPayload381; // 映射到命名载荷
  [PlatformChannels.CheckReleaseUpdate]: channelPayload386; // 映射到命名载荷
  [PlatformChannels.InstallReleaseUpdate]: channelPayload391; // 映射到命名载荷
  [PlatformChannels.CaptureWindowScreenshot]: channelPayload396; // 映射到命名载荷
  // CDP-on-guest pivot：renderer `<webview>` 上报 guest webContentsId → main attach。。
  [PlatformChannels.BrowserViewAttachGuest]: channelPayload406; // 映射到命名载荷
  [PlatformChannels.BrowserViewDetachGuest]: channelPayload419; // 映射到命名载荷
  [PlatformChannels.BrowserViewCloseTabFromRenderer]: channelPayload424; // 映射到命名载荷
  [PlatformChannels.BrowserViewReportResidency]: channelPayload429; // 映射到命名载荷
  [PlatformChannels.BrowserViewSuspendReady]: channelPayload434; // 映射到命名载荷
  [PlatformChannels.BrowserViewEnsureResident]: channelPayload439; // 映射到命名载荷
  [PlatformChannels.BrowserViewRestoreTabs]: channelPayload444; // 映射到命名载荷
  [PlatformChannels.BrowserViewUpdateViewport]: channelPayload449; // 映射到命名载荷
  [PlatformChannels.EmbeddedBrowserJavaScriptDialog]: channelPayload454; // 映射到命名载荷
  [PlatformChannels.UpdateReady]: channelPayload465; // 映射到命名载荷
  [PlatformChannels.UpdateCheckResult]: channelPayload470; // 映射到命名载荷
  [PlatformChannels.UpdateStateChanged]: channelPayload475; // 映射到命名载荷
  [PlatformChannels.GetUpdateState]: channelPayload480; // 映射到命名载荷
  [PlatformChannels.DownloadUpdate]: channelPayload485; // 映射到命名载荷
  [PlatformChannels.CancelUpdateDownload]: channelPayload490; // 映射到命名载荷
  [PlatformChannels.OpenUpdateStatusWindow]: channelPayload495; // 映射到命名载荷
  [PlatformChannels.GetAutoUpdatePreferences]: channelPayload500; // 映射到命名载荷
  [PlatformChannels.SetAutoDownloadAndInstallUpdates]: channelPayload507; // 映射到命名载荷
  [PlatformChannels.SettingsChanged]: channelPayload512; // 映射到命名载荷
  [PlatformChannels.ApplicationLocaleChanged]: channelPayload517; // 映射到命名载荷
  [PlatformChannels.GetSystemLocale]: channelPayload522; // 映射到命名载荷
  [PlatformChannels.GetDesktopSessionActivity]: channelPayload527; // 映射到命名载荷
  [PlatformChannels.GetDesktopZoomLevel]: channelPayload534; // 映射到命名载荷
  [PlatformChannels.DesktopZoomLevelChanged]: channelPayload539; // 映射到命名载荷
  [PlatformChannels.PostUpdateReleaseNotes]: channelPayload544; // 映射到命名载荷
  [PlatformChannels.AcknowledgePostUpdateReleaseNotes]: channelPayload549; // 映射到命名载荷
  [PlatformChannels.SkipUpdateVersion]: channelPayload554; // 映射到命名载荷
  [PlatformChannels.QuitAndInstallUpdate]: channelPayload559; // 映射到命名载荷
  [PlatformChannels.GetInstalledEditors]: channelPayload564; // 映射到命名载荷
  [PlatformChannels.GetApplicationIcon]: channelPayload569; // 映射到命名载荷
  [PlatformChannels.OpenInEditor]: channelPayload574; // 映射到命名载荷
  [PlatformChannels.CloseActiveContextRequest]: channelPayload579; // 映射到命名载荷
  [PlatformChannels.ExecuteDesktopCommand]: channelPayload584; // 映射到命名载荷
  [PlatformChannels.SetApplicationLocale]: channelPayload591; // 映射到命名载荷
  [PlatformChannels.SetTitleBarTheme]: channelPayload596; // 映射到命名载荷
}
