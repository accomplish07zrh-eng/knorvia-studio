import { recordArmsCustomEventForE2E } from "@knorvia/ui";
import {
  DesktopCommandIds,
  buildLocalMediaPreviewUrl,
  type IPlatformService,
} from "@knorvia/shared";
import { desktopBrowserPlatformBridge } from "./desktopBrowserPlatformBridge.js";
import { RendererPreloadCalls } from "./rendererPreloadCalls.js";

export function createDesktopPlatform(options: {
  isLocalDevelopmentRuntime: boolean;
}): IPlatformService {
  const calls = new RendererPreloadCalls();
  const executeCommand = calls.required("executeDesktopCommand", 1);
  const reportArms = calls.required("reportArmsCustomEvent", 1);
  return {
    canSelectFilePath: true,
    createLocalMediaPreviewUrl: buildLocalMediaPreviewUrl,
    isLocalDevelopmentRuntime: options.isLocalDevelopmentRuntime,
    selectDirectory: calls.required("selectDirectory", 0),
    selectFile: calls.required("selectFile", 0),
    selectFiles: calls.optional("selectFiles", 0, () => Promise.resolve([])),
    createTempTextAttachment: calls.required("createTempTextAttachment", 1),
    onRemoteConnectionLog: calls.required("onRemoteConnectionLog", 1),
    onRemoteSessionClosed: calls.required("onRemoteSessionClosed", 1),
    activateOrSetWorkspace: calls.optional("activateOrSetWorkspace", 1, () =>
      Promise.resolve({ activated: false })),
    connectRemote: calls.required("connectRemote", 3),
    cancelPendingRemoteConnection: calls.optional("cancelPendingRemoteConnection", 1, () => Promise.resolve()),
    bindRemoteWorkspaceSessionContext: calls.optional("bindRemoteWorkspaceSessionContext", 1, () => Promise.resolve()),
    disposeRemoteSession: calls.required("disposeRemoteSession", 1),
    isDockerAvailable: calls.required("isDockerAvailable", 0),
    listWSLDistros: calls.required("listWSLDistros", 0),
    listDockerContainers: calls.required("listDockerContainers", 0),
    listSSHConfigAliases: calls.required("listSSHConfigAliases", 0),
    loadMcpFromUserDirectory: calls.required("loadMcpFromUserDirectory", 1),
    saveMcpToUserDirectory: calls.required("saveMcpToUserDirectory", 1),
    migrateLegacyCommonMcp: calls.required("migrateLegacyCommonMcp", 1),
    openExternal: calls.required("openExternal", 1),
    openFeedback: () => executeCommand(DesktopCommandIds.OpenFeedback),
    openCommunity: () => executeCommand(DesktopCommandIds.OpenCommunity),
    canOpenCommunity: calls.required("canOpenCommunity", 1),
    openInFileManager: calls.required("openInFileManager", 1),
    openExternalFile: calls.required("openExternalFile", 1),
    openCuaPermissionOnboarding: calls.capability("openCuaPermissionOnboarding",
      calls.optional("openCuaPermissionOnboarding", 1, () =>
        Promise.resolve({ success: false, error: "not_supported" }))),
    prepareCuaHelperPermissionDrag: calls.capability("prepareCuaHelperPermissionDrag",
      calls.optional("prepareCuaHelperPermissionDrag", 0, () =>
        Promise.resolve({ success: false, error: "not_supported" }))),
    startCuaHelperPermissionDrag: calls.capability("startCuaHelperPermissionDrag",
      calls.optional("startCuaHelperPermissionDrag", 0)),
    notifyRendererReady: calls.required("notifyRendererReady", 0),
    reportTelemetryEvent: calls.required("reportTelemetryEvent", 1),
    reportArmsCustomEvent: (payload) => {
      recordArmsCustomEventForE2E(payload);
      return reportArms(payload);
    },
    getRendererActionTraceConfig: calls.capability("getRendererActionTraceConfig",
      calls.required("getRendererActionTraceConfig", 0)),
    onRendererActionTraceConfigChanged: calls.capability("onRendererActionTraceConfigChanged",
      calls.required("onRendererActionTraceConfigChanged", 1)),
    reportLocalTtftBatch: calls.required("reportLocalTtftBatch", 1),
    reportRendererActionTraceBatch: calls.capability("reportRendererActionTraceBatch",
      calls.required("reportRendererActionTraceBatch", 1)),
    reportRendererHeapSample: calls.capability("reportRendererHeapSample",
      calls.required("reportRendererHeapSample", 1)),
    showTaskNotification: calls.required("showTaskNotification", 1),
    syncWindowTabs: calls.required("syncWindowTabs", 1),
    syncWindowUnreadCount: calls.required("syncWindowUnreadCount", 1),
    syncActiveTaskSession: calls.required("syncActiveTaskSession", 1),
    syncAppSettings: calls.optional("syncAppSettings", 1),
    setShortcutRecordingActive: calls.optional("setShortcutRecordingActive", 1),
    onFocusTab: calls.required("onFocusTab", 1),
    onNewTab: calls.required("onNewTab", 1),
    onCloseActiveContextRequest: calls.optional("onCloseActiveContextRequest", 1, () => () => {}),
    onOpenBrowserUrl: calls.optional("onOpenBrowserUrl", 1, () => () => {}),
    onBrowserViewScreenshotSurfacePrepare: calls.optional("onBrowserViewScreenshotSurfacePrepare", 1, () => () => {}),
    onBrowserViewScreenshotSurfaceRelease: calls.optional("onBrowserViewScreenshotSurfaceRelease", 1, () => () => {}),
    browserViewScreenshotSurfaceReady: calls.optional("browserViewScreenshotSurfaceReady", 1),
    ...desktopBrowserPlatformBridge,
    onNewTask: calls.required("onNewTask", 1),
    onOpenWorkspace: calls.optional("onOpenWorkspace", 1, () => () => {}),
    onOpenWorkspacePath: calls.optional("onOpenWorkspacePath", 1, () => () => {}),
    onOpenFeedbackDialog: calls.optional("onOpenFeedbackDialog", 1, () => () => {}),
    onOpenTicketsPanel: calls.optional("onOpenTicketsPanel", 1, () => () => {}),
    onWindowFullscreenChanged: calls.required("onWindowFullscreenChanged", 1),
    getDesktopWindowChromeState: calls.capability("getDesktopWindowChromeState",
      calls.required("getDesktopWindowChromeState", 0)),
    onDesktopWindowChromeStateChanged: calls.capability("onDesktopWindowChromeStateChanged",
      calls.required("onDesktopWindowChromeStateChanged", 1)),
    getWindowControlsOverlayMetrics: calls.optional("getWindowControlsOverlayMetrics", 0, () => null),
    onWindowControlsOverlayChanged: calls.optional("onWindowControlsOverlayChanged", 1, () => () => {}),
    getDesktopZoomLevel: calls.optional("getDesktopZoomLevel", 0, () => Promise.resolve({ zoomLevel: 0 })),
    onDesktopZoomLevelChanged: calls.optional("onDesktopZoomLevelChanged", 1, () => () => {}),
    onTaskNotificationClick: calls.required("onTaskNotificationClick", 1),
    exportLogs: calls.required("exportLogs", 0),
    previewLocalDiagnostics: calls.required("previewLocalDiagnostics", 1),
    exportLocalDiagnostics: calls.required("exportLocalDiagnostics", 1),
    checkReleaseUpdate: calls.required("checkReleaseUpdate", 0),
    captureWindowScreenshot: calls.optional("captureWindowScreenshot", 0, () => Promise.resolve(null)),
    onUpdateReady: calls.required("onUpdateReady", 1),
    onUpdateCheckResult: calls.required("onUpdateCheckResult", 1),
    onUpdateStateChanged: calls.optional("onUpdateStateChanged", 1, () => () => {}),
    getUpdateState: calls.optional("getUpdateState", 0, () => Promise.resolve({ kind: "idle", enabled: false })),
    downloadUpdate: calls.optional("downloadUpdate", 0, () => Promise.resolve()),
    cancelUpdateDownload: calls.optional("cancelUpdateDownload", 0, () => Promise.resolve()),
    openUpdateStatusWindow: calls.optional("openUpdateStatusWindow", 0, () => Promise.resolve()),
    getAutoUpdatePreferences: calls.optional("getAutoUpdatePreferences", 0, () =>
      Promise.resolve({ autoDownloadAndInstallUpdates: false })),
    setAutoDownloadAndInstallUpdates: calls.optional("setAutoDownloadAndInstallUpdates", 1, () => Promise.resolve()),
    getDesktopSessionActivity: calls.optional("getDesktopSessionActivity", 0, () =>
      Promise.resolve({ runningAgentSessionCount: 0 })),
    getKnorviaStdioTapDevState: calls.optional("getKnorviaStdioTapDevState", 0, () =>
      Promise.resolve({ enabled: false, visible: false, logDir: "", statePath: "" })),
    onSettingsChanged: calls.optional("onSettingsChanged", 1, () => () => {}),
    onApplicationLocaleChanged: calls.optional("onApplicationLocaleChanged", 1, () => () => {}),
    onPostUpdateReleaseNotes: calls.required("onPostUpdateReleaseNotes", 1),
    acknowledgePostUpdateReleaseNotes: calls.required("acknowledgePostUpdateReleaseNotes", 1),
    skipUpdateVersion: calls.optional("skipUpdateVersion", 1, () => Promise.resolve()),
    quitAndInstallUpdate: calls.required("quitAndInstallUpdate", 0),
    getInstalledEditors: calls.required("getInstalledEditors", 0),
    getApplicationIcon: calls.optional("getApplicationIcon", 1, () => Promise.resolve(null)),
    openInEditor: calls.required("openInEditor", 3),
    executeDesktopCommand: calls.required("executeDesktopCommand", 1),
    setApplicationLocale: calls.required("setApplicationLocale", 1),
    getSystemLocale: calls.optional("getSystemLocale", 0, () =>
      Promise.resolve(navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US")),
    setTitleBarTheme: calls.required("setTitleBarTheme", 1),
    setWindowGlass: calls.optional("setWindowGlass", 1, () => Promise.resolve(false)),
    getDeviceId: () =>
      (window as Window & { __KNORVIA_DEVICE_ID__?: string }).__KNORVIA_DEVICE_ID__ ?? "",
  };
}
