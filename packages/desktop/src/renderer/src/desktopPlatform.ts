import { recordArmsCustomEventForE2E } from "@knorvia/ui";
import { DesktopCommandIds, buildLocalMediaPreviewUrl, type IPlatformService } from "@knorvia/shared";

import { desktopBrowserPlatformBridge } from "./desktopBrowserPlatformBridge.js";

export function createDesktopPlatform(options: {
  isLocalDevelopmentRuntime: boolean;
}): IPlatformService {
  return {
    canSelectFilePath: true,
    createLocalMediaPreviewUrl: buildLocalMediaPreviewUrl,
    isLocalDevelopmentRuntime: options.isLocalDevelopmentRuntime,
    selectDirectory: () => window.knorvia.selectDirectory(),
    selectFile: () => window.knorvia.selectFile(),
    selectFiles: () => window.knorvia.selectFiles?.() ?? Promise.resolve([]),
    createTempTextAttachment: (payload) => window.knorvia.createTempTextAttachment(payload),
    onRemoteConnectionLog: (handler) => window.knorvia.onRemoteConnectionLog(handler),
    onRemoteSessionClosed: (handler) => window.knorvia.onRemoteSessionClosed(handler),
    activateOrSetWorkspace: (path) =>
      window.knorvia.activateOrSetWorkspace?.(path) ?? Promise.resolve({ activated: false }),
    connectRemote: (remoteOptions, requestId, context) =>
      window.knorvia.connectRemote(remoteOptions, requestId, context),
    cancelPendingRemoteConnection: (requestId) =>
      window.knorvia.cancelPendingRemoteConnection?.(requestId) ?? Promise.resolve(),
    bindRemoteWorkspaceSessionContext: (context) =>
      window.knorvia.bindRemoteWorkspaceSessionContext?.(context) ?? Promise.resolve(),
    disposeRemoteSession: (sessionId) => window.knorvia.disposeRemoteSession(sessionId),
    isDockerAvailable: () => window.knorvia.isDockerAvailable(),
    listWSLDistros: () => window.knorvia.listWSLDistros(),
    listDockerContainers: () => window.knorvia.listDockerContainers(),
    listSSHConfigAliases: () => window.knorvia.listSSHConfigAliases(),
    loadMcpFromUserDirectory: (payload) => window.knorvia.loadMcpFromUserDirectory(payload),
    saveMcpToUserDirectory: (payload) => window.knorvia.saveMcpToUserDirectory(payload),
    migrateLegacyCommonMcp: (payload) => window.knorvia.migrateLegacyCommonMcp(payload),
    openExternal: (url) => window.knorvia.openExternal(url),
    openFeedback: () => window.knorvia.executeDesktopCommand(DesktopCommandIds.OpenFeedback),
    openCommunity: () => window.knorvia.executeDesktopCommand(DesktopCommandIds.OpenCommunity),
    canOpenCommunity: (locale) => window.knorvia.canOpenCommunity(locale),
    openInFileManager: (path) => window.knorvia.openInFileManager(path),
    openExternalFile: (path) => window.knorvia.openExternalFile(path),
    openCuaPermissionOnboarding: window.knorvia.openCuaPermissionOnboarding
      ? (permissionOptions) =>
          window.knorvia.openCuaPermissionOnboarding?.(permissionOptions) ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    prepareCuaHelperPermissionDrag: window.knorvia.prepareCuaHelperPermissionDrag
      ? () =>
          window.knorvia.prepareCuaHelperPermissionDrag?.() ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    startCuaHelperPermissionDrag: window.knorvia.startCuaHelperPermissionDrag
      ? () => window.knorvia.startCuaHelperPermissionDrag?.()
      : undefined,
    notifyRendererReady: () => window.knorvia.notifyRendererReady(),
    reportTelemetryEvent: (payload) => window.knorvia.reportTelemetryEvent(payload),
    reportArmsCustomEvent: (payload) => {
      recordArmsCustomEventForE2E(payload);
      return window.knorvia.reportArmsCustomEvent(payload);
    },
    getRendererActionTraceConfig: window.knorvia.getRendererActionTraceConfig
      ? () => window.knorvia.getRendererActionTraceConfig!()
      : undefined,
    onRendererActionTraceConfigChanged: window.knorvia.onRendererActionTraceConfigChanged
      ? (callback) => window.knorvia.onRendererActionTraceConfigChanged!(callback)
      : undefined,
    reportLocalTtftBatch: (batch) => window.knorvia.reportLocalTtftBatch(batch),
    reportRendererActionTraceBatch: window.knorvia.reportRendererActionTraceBatch
      ? (batch) => window.knorvia.reportRendererActionTraceBatch!(batch)
      : undefined,
    reportRendererHeapSample: window.knorvia.reportRendererHeapSample
      ? (sample) => window.knorvia.reportRendererHeapSample!(sample)
      : undefined,
    showTaskNotification: (payload) => window.knorvia.showTaskNotification(payload),
    syncWindowTabs: (paths) => window.knorvia.syncWindowTabs(paths),
    syncWindowUnreadCount: (count) => window.knorvia.syncWindowUnreadCount(count),
    syncActiveTaskSession: (sessionId) => window.knorvia.syncActiveTaskSession(sessionId),
    syncAppSettings: (patch) => window.knorvia.syncAppSettings?.(patch),
    setShortcutRecordingActive: (active) => window.knorvia.setShortcutRecordingActive?.(active),
    onFocusTab: (handler) => window.knorvia.onFocusTab(handler),
    onNewTab: (handler) => window.knorvia.onNewTab(handler),
    onCloseActiveContextRequest: (handler) =>
      window.knorvia.onCloseActiveContextRequest?.(handler) ?? (() => {}),
    onOpenBrowserUrl: (handler) => window.knorvia.onOpenBrowserUrl?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfacePrepare: (handler) =>
      window.knorvia.onBrowserViewScreenshotSurfacePrepare?.(handler) ?? (() => {}),
    onBrowserViewScreenshotSurfaceRelease: (handler) =>
      window.knorvia.onBrowserViewScreenshotSurfaceRelease?.(handler) ?? (() => {}),
    browserViewScreenshotSurfaceReady: (payload) =>
      window.knorvia.browserViewScreenshotSurfaceReady?.(payload),
    ...desktopBrowserPlatformBridge,
    onNewTask: (handler) => window.knorvia.onNewTask(handler),
    onOpenWorkspace: (handler) => {
      // 开发态或升级后的旧窗口可能仍运行未暴露 onOpenWorkspace 的 preload，
      // renderer 直接调用会在启动时崩溃。这里和 activateOrSetWorkspace 一样做兼容兜底，
      // 缺少该 bridge 时只禁用原生菜单回调，不影响应用继续打开。
      return window.knorvia.onOpenWorkspace?.(handler) ?? (() => {});
    },
    onOpenWorkspacePath: (handler) => window.knorvia.onOpenWorkspacePath?.(handler) ?? (() => {}),
    onOpenFeedbackDialog: (handler) => window.knorvia.onOpenFeedbackDialog?.(handler) ?? (() => {}),
    onOpenTicketsPanel: (handler) => window.knorvia.onOpenTicketsPanel?.(handler) ?? (() => {}),
    onWindowFullscreenChanged: (handler) => window.knorvia.onWindowFullscreenChanged(handler),
    getDesktopWindowChromeState: window.knorvia.getDesktopWindowChromeState
      ? () => window.knorvia.getDesktopWindowChromeState!()
      : undefined,
    onDesktopWindowChromeStateChanged: window.knorvia.onDesktopWindowChromeStateChanged
      ? (handler) => window.knorvia.onDesktopWindowChromeStateChanged!(handler)
      : undefined,
    getWindowControlsOverlayMetrics: () =>
      window.knorvia.getWindowControlsOverlayMetrics?.() ?? null,
    onWindowControlsOverlayChanged: (handler) =>
      window.knorvia.onWindowControlsOverlayChanged?.(handler) ?? (() => {}),
    getDesktopZoomLevel: () =>
      window.knorvia.getDesktopZoomLevel?.() ?? Promise.resolve({ zoomLevel: 0 }),
    onDesktopZoomLevelChanged: (handler) =>
      window.knorvia.onDesktopZoomLevelChanged?.(handler) ?? (() => {}),
    onTaskNotificationClick: (handler) => window.knorvia.onTaskNotificationClick(handler),
    exportLogs: () => window.knorvia.exportLogs(),
    previewLocalDiagnostics: (request) => window.knorvia.previewLocalDiagnostics(request),
    exportLocalDiagnostics: (id) => window.knorvia.exportLocalDiagnostics(id),
    checkReleaseUpdate: () => window.knorvia.checkReleaseUpdate(),
    captureWindowScreenshot: () =>
      window.knorvia.captureWindowScreenshot?.() ?? Promise.resolve(null),
    onUpdateReady: (callback) => window.knorvia.onUpdateReady(callback),
    onUpdateCheckResult: (callback) => window.knorvia.onUpdateCheckResult(callback),
    onUpdateStateChanged: (callback) =>
      window.knorvia.onUpdateStateChanged?.(callback) ?? (() => {}),
    getUpdateState: () =>
      window.knorvia.getUpdateState?.() ?? Promise.resolve({ kind: "idle", enabled: false }),
    downloadUpdate: () => window.knorvia.downloadUpdate?.() ?? Promise.resolve(),
    cancelUpdateDownload: () => window.knorvia.cancelUpdateDownload?.() ?? Promise.resolve(),
    openUpdateStatusWindow: () => window.knorvia.openUpdateStatusWindow?.() ?? Promise.resolve(),
    getAutoUpdatePreferences: () =>
      window.knorvia.getAutoUpdatePreferences?.() ??
      Promise.resolve({ autoDownloadAndInstallUpdates: false }),
    setAutoDownloadAndInstallUpdates: (enabled) =>
      window.knorvia.setAutoDownloadAndInstallUpdates?.(enabled) ?? Promise.resolve(),
    getDesktopSessionActivity: () =>
      window.knorvia.getDesktopSessionActivity?.() ??
      Promise.resolve({ runningAgentSessionCount: 0 }),
    getKnorviaStdioTapDevState: () =>
      window.knorvia.getKnorviaStdioTapDevState?.() ??
      Promise.resolve({ enabled: false, visible: false, logDir: "", statePath: "" }),
    onSettingsChanged: (callback) => window.knorvia.onSettingsChanged?.(callback) ?? (() => {}),
    onApplicationLocaleChanged: (callback) =>
      window.knorvia.onApplicationLocaleChanged?.(callback) ?? (() => {}),
    onPostUpdateReleaseNotes: (callback) => window.knorvia.onPostUpdateReleaseNotes(callback),
    acknowledgePostUpdateReleaseNotes: (version) =>
      window.knorvia.acknowledgePostUpdateReleaseNotes(version),
    skipUpdateVersion: (version) =>
      window.knorvia.skipUpdateVersion?.(version) ?? Promise.resolve(),
    quitAndInstallUpdate: () => window.knorvia.quitAndInstallUpdate(),
    getInstalledEditors: () => window.knorvia.getInstalledEditors(),
    getApplicationIcon: (bundleId) =>
      window.knorvia.getApplicationIcon?.(bundleId) ?? Promise.resolve(null),
    openInEditor: (editorId, path, editorOptions) =>
      window.knorvia.openInEditor(editorId, path, editorOptions),
    executeDesktopCommand: (command) => window.knorvia.executeDesktopCommand(command),
    setApplicationLocale: (locale) => window.knorvia.setApplicationLocale(locale),
    getSystemLocale: () =>
      window.knorvia.getSystemLocale?.() ??
      Promise.resolve(navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US"),
    setTitleBarTheme: (theme) => window.knorvia.setTitleBarTheme(theme),
    setWindowGlass: (enabled) => window.knorvia.setWindowGlass?.(enabled) ?? Promise.resolve(false),
    getDeviceId: () =>
      (window as Window & { __KNORVIA_DEVICE_ID__?: string }).__KNORVIA_DEVICE_ID__ ?? "",
  };
}
