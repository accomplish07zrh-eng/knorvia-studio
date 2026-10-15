// SPDX-License-Identifier: Apache-2.0
// 跨端平台操作接口：替代直接访问 window.knorvia（B39 域件）。
// 只放「必须穿越进程边界且不适合做成 RPC service」的操作（native dialog、窗口生命周期等）；
// 业务服务（文件、终端、凭据等）走 IServiceAccessor 的 RPC 通道。
import type {
  LoadCliMcpFromUserDirectoryRequest,
  LoadCliMcpFromUserDirectoryResult,
  MigrateLegacyCommonMcpRequest,
  MigrateLegacyCommonMcpResult,
  SaveCliMcpToUserDirectoryRequest,
} from "../mcp.js";
import type { AppSettings, Locale } from "../protocol.js";
import type { ArmsCustomEventPayload, RendererTelemetryEventPayload } from "../telemetry.js";
import type {
  RendererActionTraceBatchV1,
  RendererActionTraceConfigV1,
} from "../rendererActionTrace.js";
import type { RendererHeapSample } from "../validation.js";
import type {
  CuaAccessibilitySettingsResult,
  OpenCuaPermissionOnboardingOptions,
  PrepareCuaHelperPermissionDragResult,
} from "../cuaAccessibilitySettings.js";
import type { BrowserViewportSize } from "../browser-use/command-metadata.js";
import type {
  PostUpdateReleaseNotesPayload,
  UpdateCheckResultPayload,
  UpdateStatePayload,
} from "../update.js";
import type { RemoteTarget } from "../remoteTarget.js";
import type {
  ApplicationIconInfo,
  ApplicationIconRequest,
  CreateTempTextAttachmentRequest,
  CreateTempTextAttachmentResult,
  EditorInfo,
  OpenInEditorOptions,
  PrintPageToPdfResult,
  SaveFileRequest,
  SaveFileResult,
} from "./platform-editor.js";
import type {
  BrowserGuestAttachResult,
  BrowserViewCloseTabNotification,
  BrowserViewCloseTabRequest,
  BrowserViewOperationPayload,
  BrowserViewResidencyReportPayload,
  BrowserViewResidencyTransitionPayload,
  BrowserViewRestoreTabsRequest,
  BrowserViewRestoredTabShell,
  BrowserViewScreenshotSurfacePreparePayload,
  BrowserViewScreenshotSurfaceReadyPayload,
  BrowserViewScreenshotSurfaceReleasePayload,
  BrowserViewViewportChangedPayload,
  EmbeddedBrowserOpenUrlRequest,
  TaskNotificationPayload,
} from "./platform-browser-view.js";
import type {
  BindRemoteWorkspaceSessionContextRequest,
  ChromeBrowserDataImportOptions,
  ChromeBrowserDataImportResult,
  DesktopCommandId,
  DesktopTitleBarTheme,
  DesktopWindowChromeState,
  DesktopZoomState,
  DockerContainerInfo,
  EmbeddedBrowserDataClearResult,
  KnorviaStdioTapDevState,
  RemoteConnectionRuntimeLog,
  RemoteSessionClosedEvent,
  SSHConfigAliasOption,
  WindowControlsOverlayMetrics,
  WindowScreenshotResult,
  WSLDistro,
} from "./platform-desktop.js";

// onBrowserViewReady 的载荷：受控 view 建好时的定位信息。
type BrowserViewReadyEvent = {
  workspaceKey: /* 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  sessionId: /* 所属会话 */ string;
  tabId: /* 新建 tab */ string;
  browserId: /* browser 实例 */ string;
  browserGeneration: /* browser 代数 */ number;
};

// onBrowserViewVisibility 的载荷：显示/隐藏 IAB pane 的定位信息。
type BrowserViewVisibilityEvent = {
  visible: /* 目标可见态 */ boolean;
  workspaceKey: /* 路由键 */ string;
  remoteSessionId: /* 远程会话标识 */ string | undefined;
  sessionId: /* 所属会话 */ string;
  tabId?: /* 目标 tab；缺省整 pane */ string;
  browserId: /* browser 实例 */ string;
  browserGeneration: /* browser 代数 */ number;
};

// guest 上报载荷：active=true 表示 agent 无 tabId 命令优先读当前可见页。
type GuestAttachEvent = {
  key: /* guest 标识 */ string;
  webContentsId: /* webContents id */ number;
  active?: /* 是否活跃可见页 */ boolean;
  workspaceKey?: /* 路由键 */ string;
  remoteSessionId?: /* 远程会话标识 */ string;
  // human browser tab 的对话归属；缺失时 main 必须保持不可认领，避免跨对话泄漏。
  sessionId?: /* 归属会话 */ string;
  residencyGeneration?: /* residency 代数 */ number;
};

// 断开旧 guest 的定位载荷。
type GuestDetachEvent = {
  key: /* guest 标识 */ string;
  webContentsId: /* webContents id */ number;
};

// renderer 确认已按指定代数卸载 guest。
type SuspendReadyEvent = {
  tabId: /* 目标 tab */ string;
  generation: /* 已卸载的 residency 代数 */ number;
};

// 自由尺寸回写载荷。
type ViewportUpdateEvent = {
  tabId: /* 目标 tab */ string;
  viewport: /* 新尺寸；null 恢复自然 viewport */ BrowserViewportSize | null;
};

// 常用回调形态别名：把折行签名压回单行。
type VoidHandler = () => void;
type PathHandler = (path: string) => void;
type ReadyViewHandler = (payload: BrowserViewReadyEvent) => void;
type VisibilityHandler = (payload: BrowserViewVisibilityEvent) => void;
type ViewportChangedHandler = (payload: BrowserViewViewportChangedPayload) => void;
type SurfacePrepareHandler = (payload: BrowserViewScreenshotSurfacePreparePayload) => void;
type SurfaceReleaseHandler = (payload: BrowserViewScreenshotSurfaceReleasePayload) => void;
type ResidencyTransitionHandler = (payload: BrowserViewResidencyTransitionPayload) => void;
type RestoreTabsHandler = (payload: BrowserViewRestoreTabsRequest) => void;
type RemoteLogHandler = (entry: RemoteConnectionRuntimeLog) => void;
type SessionClosedHandler = (event: RemoteSessionClosedEvent) => void;
type TraceConfigHandler = (config: RendererActionTraceConfigV1) => void;
type ReleaseNotesHandler = (payload: PostUpdateReleaseNotesPayload) => void;
type UpdateCheckHandler = (payload: UpdateCheckResultPayload) => void;
type UpdateStateHandler = (payload: UpdateStatePayload) => void;
type LocaleHandler = (locale: Locale) => void;
type WindowChromeHandler = (state: DesktopWindowChromeState) => void;
type OverlayMetricsHandler = (metrics: WindowControlsOverlayMetrics) => void;
type ZoomStateHandler = (state: DesktopZoomState) => void;
type OpenUrlHandler = (request: EmbeddedBrowserOpenUrlRequest) => void;

// connectRemote 的可选上下文。
type ConnectRemoteContext = {
  workspacePath: /* 工作区路径 */ string;
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  connectTrigger?: import("../remoteUsageTelemetry.js").RemoteWorkspaceConnectTrigger;
};

// 自动更新偏好。
type AutoUpdatePreferences = {
  autoDownloadAndInstallUpdates: /* 是否自动下载并安装 */ boolean;
};

// 运行中会话计数。
type SessionActivity = {
  runningAgentSessionCount: /* 运行中 agent 会话数 */ number;
};

export interface IPlatformService {
  // 平台操作接口面（实现分属 Desktop/Web，UI 层统一消费）。
  // 每个成员行尾注释即语义说明；分组顺序是实现分组，不影响契约。
  // ── 窗口/tab 生命周期与通知 ──────────────────────────────────────
  notifyRendererReady(): void; // renderer 就绪，触发缓存 deep link 转发
  showTaskNotification(payload: TaskNotificationPayload): void; // 任务状态系统通知
  onFocusTab(handler: (path: string) => void): () => void; // main 请求聚焦 tab
  onNewTab(handler: () => void): () => void; // main 触发新建 tab
  onCloseActiveContextRequest?(handler: () => void): () => void; // main 请求关闭当前上下文
  onNewTask(handler: () => void): () => void; // main 触发新建任务
  onOpenWorkspace(handler: () => void): () => void; // main 触发打开工作区
  onOpenWorkspacePath?(handler: (path: string) => void): () => void; // deep link 打开本地目录
  onWindowFullscreenChanged(handler: (isFullscreen: boolean) => void): () => void; // 全屏态变化
  onTaskNotificationClick(handler: (taskId: string) => void): () => void; // 点通知跳任务
  activateOrSetWorkspace(path: string): Promise<{ activated: boolean }>; // 目录已在别窗则激活
  syncWindowTabs(paths: string[]): void; // 同步窗口 tab 路径（跨窗去重）
  syncWindowUnreadCount(count: number): void; // 同步未读数（Dock/任务栏徽标）
  syncActiveTaskSession(sessionId: string | null): void; // active task 变化（PiP focus）

  // ── browser-use 视图 ────────────────────────────────────────────
  onOpenBrowserUrl?(handler: OpenUrlHandler): () => void; // webview 请求开新页
  onBrowserViewReady?(handler: ReadyViewHandler): () => void; // agent 首次建好受控 view（自动开 tab）
  onBrowserViewOperation?(handler: (payload: BrowserViewOperationPayload) => void): () => void; // 命中真实 tab 刷新操作态
  onBrowserViewVisibility?(handler: VisibilityHandler): () => void; // 显式显示/隐藏 IAB pane
  onBrowserViewViewportChanged?(handler: ViewportChangedHandler): () => void; // 单 tab viewport 同步
  onBrowserViewScreenshotSurfacePrepare?(handler: SurfacePrepareHandler): () => void; // 截图前准备合成表面
  onBrowserViewScreenshotSurfaceRelease?(handler: SurfaceReleaseHandler): () => void; // 截图后释放合成表面
  browserViewScreenshotSurfaceReady?(payload: BrowserViewScreenshotSurfaceReadyPayload): void; // 合成表面已稳定
  onBrowserViewCloseTab?(handler: (payload: BrowserViewCloseTabNotification) => void): () => void; // tab 关闭通知
  onBrowserViewSuspend?(handler: ResidencyTransitionHandler): () => void; // 卸载 guest 保留 shell
  onBrowserViewRestore?(handler: ResidencyTransitionHandler): () => void; // suspended shell 重挂 guest
  browserViewAttachGuest?(payload: GuestAttachEvent): Promise<BrowserGuestAttachResult>; // guest 上报绑定结果
  browserViewDetachGuest?(payload: GuestDetachEvent): Promise<boolean>; // 重建前精确断开旧 CDP
  browserViewCloseTab?(payload: BrowserViewCloseTabRequest): Promise<void>; // 用户显式关 tab
  browserViewReportResidency?(payload: BrowserViewResidencyReportPayload): Promise<void>; // 上报展示事实
  browserViewSuspendReady?(payload: SuspendReadyEvent): Promise<void>; // 已按 generation 卸载
  browserViewEnsureResident?(payload: BrowserViewCloseTabRequest): Promise<void>; // 请求 single-flight 恢复
  browserViewRestoreTabs?(payload: RestoreTabsHandler): Promise<BrowserViewRestoredTabShell[]>; // 读持久化 logical shells
  browserViewUpdateViewport?(payload: ViewportUpdateEvent): Promise<void>; // 自由尺寸回写（null=自然尺寸）

  // ── 远程连接 ────────────────────────────────────────────────────
  onRemoteConnectionLog(handler: RemoteLogHandler): () => void; // 连接过程日志
  onRemoteSessionClosed(handler: SessionClosedHandler): () => void; // 远程会话关闭
  connectRemote(
    options: RemoteTarget,
    requestId?: string,
    context?: ConnectRemoteContext,
  ): Promise<{ success: boolean; error?: string; sessionId?: string }>; // 建立远程连接
  cancelPendingRemoteConnection?(requestId?: string): Promise<void>; // 取消未完成连接
  bindRemoteWorkspaceSessionContext?(
    context: BindRemoteWorkspaceSessionContextRequest,
  ): Promise<void>; // 身份绑定到远程 logical session
  disposeRemoteSession(sessionId: string): Promise<void>; // 释放远程 session
  isDockerAvailable(): Promise<boolean>; // Docker daemon 可用性
  listWSLDistros(): Promise<WSLDistro[]>; // WSL 发行版列表
  listDockerContainers(): Promise<DockerContainerInfo[]>; // 可连容器列表
  listSSHConfigAliases(): Promise<SSHConfigAliasOption[]>; // ssh config alias 列表

  // ── 更新 ────────────────────────────────────────────────────────
  onUpdateReady(callback: (version: string) => void): () => void; // 新版本已下载
  onUpdateCheckResult(callback: (payload: UpdateCheckResultPayload) => void): () => void; // 手动检查结果
  onUpdateStateChanged?(callback: (payload: UpdateStatePayload) => void): () => void; // 更新状态变化
  getUpdateState?(): Promise<UpdateStatePayload>; // 主动读更新状态
  downloadUpdate(): Promise<void>; // 确认下载已发现版本
  cancelUpdateDownload(): Promise<void>; // 取消下载
  openUpdateStatusWindow?(): Promise<void>; // 打开独立更新窗口
  getAutoUpdatePreferences?(): Promise<AutoUpdatePreferences>; // 读自动更新偏好
  setAutoDownloadAndInstallUpdates?(enabled: boolean): Promise<void>; // 写自动更新偏好
  skipUpdateVersion(version: string): Promise<void>; // 跳过已发现版本
  onPostUpdateReleaseNotes(callback: ReleaseNotesHandler): () => void; // 更新后版本说明
  acknowledgePostUpdateReleaseNotes(version: string): Promise<void>; // 标记版本说明已读
  quitAndInstallUpdate(): Promise<void>; // 重启安装更新
  checkReleaseUpdate?(): Promise<import("../releaseUpdate.js").ReleaseUpdateCheckResult>; // 只读发布元数据
  installReleaseUpdate?(): Promise<import("../releaseUpdate.js").ReleaseUpdateInstallResult>; // 下载校验后启动安装

  // ── 文件与对话框 ────────────────────────────────────────────────
  canSelectFilePath?: boolean; // 文件选择框能否返回本地绝对路径
  selectDirectory(): Promise<string | null>; // 系统目录选择框
  selectFile(): Promise<string | null>; // 系统文件选择框
  selectFiles?(): Promise<string[]>; // 多文件选择框
  saveFile?(payload: SaveFileRequest): Promise<SaveFileResult>; // 原生另存为
  printPageToPdf?(): Promise<PrintPageToPdfResult>; // print 媒体版面输出 PDF
  getPathForFile?(file: unknown): string | null; // File 对象解析宿主路径
  createLocalMediaPreviewUrl?(path: string): string; // 本地视频路径转宿主 URL
  createTempTextAttachment?(
    payload: CreateTempTextAttachmentRequest,
  ): Promise<CreateTempTextAttachmentResult>; // 临时文本附件落盘
  exportLogs(): Promise<{ success: boolean; path?: string; error?: string }>; // 打包导出日志
  previewLocalDiagnostics?(
    request: import("../localDiagnostics.js").LocalDiagnosticRequest,
  ): Promise<import("../localDiagnostics.js").LocalDiagnosticPreview>; // 本地诊断预览（冻结快照）
  exportLocalDiagnostics?(
    id: string,
  ): Promise<import("../localDiagnostics.js").LocalDiagnosticExportResult>; // 导出诊断 ZIP
  captureWindowScreenshot?(): Promise<WindowScreenshotResult | null>; // 截当前窗口
  openInFileManager(path: string): Promise<{ success: boolean; error?: string }>; // 文件管理器定位
  openExternalFile?(path: string): Promise<{ success: boolean; error?: string }>; // 默认应用打开
  openExternal(url: string): void; // 打开外部 URL

  // ── 编辑器与应用图标 ────────────────────────────────────────────
  getInstalledEditors(): Promise<EditorInfo[]>; // 已安装编辑器/终端
  openInEditor(
    editorId: string,
    path: string,
    options?: OpenInEditorOptions,
  ): Promise<{ success: boolean; error?: string }>; // 用指定编辑器打开路径
  getApplicationIcon?(
    request: string | ApplicationIconRequest,
  ): Promise<ApplicationIconInfo | null>; // 读真实 App 图标

  // ── 桌面窗口外观与命令 ──────────────────────────────────────────
  executeDesktopCommand(command: DesktopCommandId): Promise<unknown>; // 窗口级命令直通 main
  getDesktopWindowChromeState?(): Promise<DesktopWindowChromeState>; // 最大化态与原生圆角
  onDesktopWindowChromeStateChanged?(handler: WindowChromeHandler): () => void; // 窗口 chrome 状态变化
  getWindowControlsOverlayMetrics?(): WindowControlsOverlayMetrics | null; // 同步读安全边距
  onWindowControlsOverlayChanged?(handler: OverlayMetricsHandler): () => void; // 安全边距变化
  getDesktopZoomLevel?(): Promise<DesktopZoomState>; // 同步读缩放档位
  onDesktopZoomLevelChanged?(handler: (state: DesktopZoomState) => void): () => void; // 缩放档位变化
  setTitleBarTheme(theme: DesktopTitleBarTheme): Promise<void>; // 标题栏亮暗配色
  setWindowGlass?(enabled: boolean): Promise<boolean>; // 本窗口原生材质
  setApplicationLocale(locale: Locale): Promise<void>; // 同步应用菜单语言
  onApplicationLocaleChanged?(callback: (locale: Locale) => void): () => void; // 应用语言变化
  getSystemLocale?(): Promise<Locale>; // 宿主系统语言
  onSettingsChanged?(callback: () => void): () => void; // 设置文件被菜单命令更新
  syncAppSettings?(patch: Partial<AppSettings>): void; // 同步需 main 即时感知的设置
  setShortcutRecordingActive?(active: boolean): void; // 快捷键录制态开关
  getDesktopSessionActivity?(): Promise<SessionActivity>; // 运行中会话数
  getKnorviaStdioTapDevState?(): Promise<KnorviaStdioTapDevState>; // stdio tap 开发开关状态
  isLocalDevelopmentRuntime?: boolean; // 是否本地开发运行形态

  // ── CUA 权限 ────────────────────────────────────────────────────
  openCuaPermissionOnboarding?(
    options?: OpenCuaPermissionOnboardingOptions,
  ): Promise<CuaAccessibilitySettingsResult>; // 完整权限引导（Desktop only）
  cancelCuaPermissionOnboarding?(operationId: string): void; // 取消本 renderer 的 participant
  prepareCuaHelperPermissionDrag?(): Promise<PrepareCuaHelperPermissionDragResult>; // 预热 Helper 供同步拖拽
  startCuaHelperPermissionDrag?(): void; // 把 Helper.app 拖进权限列表

  // ── 遥测与 Trace ────────────────────────────────────────────────
  reportTelemetryEvent(payload: RendererTelemetryEventPayload): Promise<void>; // UI 侧 telemetry
  reportArmsCustomEvent(payload: ArmsCustomEventPayload): Promise<void>; // ARMS 自定义事件
  getRendererActionTraceConfig?(): Promise<RendererActionTraceConfigV1>; // Trace 灰度配置
  onRendererActionTraceConfigChanged?(callback: TraceConfigHandler): () => void; // Trace 配置推送
  reportRendererActionTraceBatch?(batch: RendererActionTraceBatchV1): void; // ui_action batch 旁路上报
  reportLocalTtftBatch?(batch: import("../localTtft.js").LocalTtftBatch): void; // 本地 TTFT 批量上报
  reportRendererHeapSample?(sample: RendererHeapSample): void; // renderer heap 读数

  // ── 反馈与社群 ──────────────────────────────────────────────────
  openFeedback(): Promise<void>; // 打开反馈入口
  onOpenFeedbackDialog?(handler: () => void): () => void; // main 打开反馈对话框
  onOpenTicketsPanel?(handler: () => void): () => void; // main 打开我的工单面板
  openCommunity(): Promise<void>; // 打开用户社群入口
  canOpenCommunity(locale: Locale): Promise<boolean>; // 当前语言有无社群入口

  // ── MCP 用户目录配置 ────────────────────────────────────────────
  loadMcpFromUserDirectory?(
    payload?: LoadCliMcpFromUserDirectoryRequest,
  ): Promise<LoadCliMcpFromUserDirectoryResult>; // 读宿主 MCP 用户目录配置
  saveMcpToUserDirectory?(
    payload: SaveCliMcpToUserDirectoryRequest,
  ): Promise<{ success: boolean; error?: string }>; // 写宿主 MCP 用户目录配置
  migrateLegacyCommonMcp?(
    payload?: MigrateLegacyCommonMcpRequest,
  ): Promise<MigrateLegacyCommonMcpResult>; // 迁移旧版 Common MCP

  // ── 设备标识 ────────────────────────────────────────────────────
  getDeviceId(): string; // 桌面 userData 路径 SHA-256；手机为物理属性指纹
}
