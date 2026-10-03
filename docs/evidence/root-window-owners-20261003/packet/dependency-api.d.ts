// Selected original public dependency types/ports; opaque runtime owners, no standalone semantic closure. Private/protected class members omitted.
// Original public port/type owner: packages/desktop/src/main/databaseStartupRelay.ts
import { type UtilityProcess } from "electron";
export declare function getDatabaseStartupPortPayload(child: UtilityProcess): {
    databaseStartupId: string;
} | undefined;

// Original public port/type owner: packages/desktop/src/main/desktopWindowChrome.ts
import { BrowserWindow } from "electron";
import type { Locale } from "@knorvia/shared";
import { type WindowBootstrapOptions } from "./desktopHostProcess.js";
import { type DesktopWindowSize } from "./desktopWindowSize.js";
export declare function createBrowserWindow(options: {
    iconPath: string;
    preloadPath: string;
    title?: string;
    bootstrap?: WindowBootstrapOptions;
    logger: {
        warn: (...args: unknown[]) => void;
    };
    deviceMid?: string;
    initialDesktopZoomLevel?: number;
    initialWindowSize?: DesktopWindowSize;
    currentApplicationLocale?: () => Locale;
    resolveBrowserViewOwner?: (webContentsId: number) => {
        workspaceKey: string;
        remoteSessionId?: string;
        sessionId: string;
        browserId: string;
        browserGeneration: number;
        tabId: string;
    } | undefined;
}): BrowserWindow;

// Original public port/type owner: packages/desktop/src/main/desktopHostProcess.ts
import { type TaskRealtimeHostDeliveryKind, HostMessageTypes, type WorkspacePurpose } from "@knorvia/shared";
export interface HostInitMessage {
    type: typeof HostMessageTypes.InitLocal;
    hostId?: string;
    databaseStartupId?: string;
    deliveryKind?: TaskRealtimeHostDeliveryKind;
    deviceMid?: string;
    workspacePath?: string;
    workspaceIdentity?: string;
    agentWarmupTargets?: Array<{
        workspacePath: string;
        workspaceIdentity?: string;
    }>;
    agentSpawnFallbackCwd?: string;
    knorviaBuiltinProviderConfigFilePath: string;
    runtimeProcessEnvPatch?: Record<string, string>;
}
export interface WindowBootstrapOptions {
    restoreSession?: boolean;
    supportsSettings?: boolean;
    initialWorkspacePath?: string;
    initialWorkspacePurpose?: WorkspacePurpose;
    unavailableWorkspacePath?: string;
    windowKind?: "main" | "update-status";
    locale?: string;
}

// Original public port/type owner: packages/desktop/src/main/startupWorkspace.ts
export interface StartupWorkspaceWarmupTarget {
    workspacePath: string;
    workspaceIdentity?: string;
}

// Original public port/type owner: packages/desktop/src/main/desktopDarwinCloseBehavior.ts
export declare function handleDarwinWindowCloseRequest(options: {
    win: DarwinCloseAwareWindow;
    forceQuit: boolean;
    label: string;
    logger: {
        info: (...args: unknown[]) => void;
    };
}): boolean;
interface DarwinCloseAwareWindow {
    isFullScreen(): boolean;
    setFullScreen(flag: boolean): void;
    hide(): void;
}

// Original public port/type owner: packages/desktop/src/main/desktopUnsavedChanges.ts
import type { MessageBoxSyncOptions } from "electron";
import type { Locale } from "@knorvia/shared";
export declare function createUnsavedChangesGuard(options: {
    confirm: () => boolean;
    stay: () => void;
    onError: (error: unknown) => void;
}): (event: {
    preventDefault(): void;
}) => void;
export declare function unsavedChangesDialogOptions(locale: Locale): MessageBoxSyncOptions;

// Original public port/type owner: packages/desktop/src/main/unreadBadge.ts
export declare function parseWindowUnreadCount(payload: unknown): number | null;
export declare function sumWindowUnreadCounts(windowUnreadCountMap: ReadonlyMap<number, number>): number;
export declare function syncAppUnreadBadge(options: {
    platform: NodeJS.Platform;
    totalUnreadCount: number;
    setBadgeCount: AppBadgeSetter;
}): void;
type AppBadgeSetter = (count: number) => void;

// Original public port/type owner: packages/desktop/src/main/desktopWindowSize.ts
import type { BrowserWindow } from "electron";
import type { AppSettings } from "@knorvia/shared";
export declare function attachDesktopWindowSizePersistence(win: WindowSizePersistenceTarget, save: (state: DesktopWindowSize) => Promise<void>, onSaveError?: (error: unknown) => void): void;
type WindowSizePersistenceTarget = Pick<BrowserWindow, "getNormalBounds" | "isDestroyed" | "isMaximized" | "on">;
export type DesktopWindowSize = NonNullable<AppSettings["desktopWindowSize"]>;

// Original public port/type owner: packages/desktop/src/main/resourceManagerWindow.ts
export declare function registerMainApplicationWindow(webContentsId: number): void;
export declare function unregisterMainApplicationWindow(webContentsId: number): void;

// Original public port/type owner: packages/desktop/src/main/desktopHostProcess.ts
import { BrowserWindow } from "electron";
import { type WorkspacePurpose } from "@knorvia/shared";
export declare function loadWindow(win: BrowserWindow, bootstrap?: WindowBootstrapOptions): Promise<void>;
export interface WindowBootstrapOptions {
    restoreSession?: boolean;
    supportsSettings?: boolean;
    initialWorkspacePath?: string;
    initialWorkspacePurpose?: WorkspacePurpose;
    unavailableWorkspacePath?: string;
    windowKind?: "main" | "update-status";
    locale?: string;
}

// Original public port/type owner: packages/desktop/src/main/desktopWindowButtonPosition.ts
import { type BrowserWindow } from "electron";
export declare function buildWindowsTitleBarOverlayForZoomLevel(zoomLevel: number, theme: "light" | "dark"): {
    color: string;
    symbolColor: string;
    height: any;
};
export declare function hasCustomWindowsControls(window: BrowserWindow): any;
export declare function registerCustomWindowsControls(window: BrowserWindow): void;
export declare const MACOS_TRAFFIC_LIGHT_BASE_POSITION: {
    readonly x: 22;
    readonly y: 23;
};
export declare function syncWindowControlsOverlayForZoomLevel(targetWindow: BrowserWindow | null | undefined, zoomLevel: number): void;

// Original public port/type owner: packages/desktop/src/main/desktopZoom.ts
export declare function clampDesktopZoomLevel(level: number): number;
export declare function resolveDesktopZoomFactorForLevel(level: number): number;
export declare function resolveDesktopZoomLevelFromFactor(zoomFactor: number): number;

// Original public port/type owner: packages/desktop/src/main/desktopWindowChromeState.ts
import type { DesktopWindowChromeState } from "@knorvia/shared";
export declare function resolveDesktopWindowChromeState(isMaximized: boolean, platform?: NodeJS.Platform, platformRelease?: string): DesktopWindowChromeState;

// Original public port/type owner: packages/desktop/src/main/desktopWindowSize.ts
import type { Rectangle } from "electron";
import type { AppSettings } from "@knorvia/shared";
export declare const MIN_DESKTOP_WINDOW_HEIGHT = 640;
export declare const MIN_DESKTOP_WINDOW_WIDTH = 480;
export declare function resolveDesktopWindowSize(persisted: DesktopWindowSize | undefined, workAreaSize: Pick<Rectangle, "width" | "height">): DesktopWindowSize;
export type DesktopWindowSize = NonNullable<AppSettings["desktopWindowSize"]>;

// Original public port/type owner: packages/shared/src/protocol.ts
export type Locale = "zh-CN" | "en-US";
export declare const DEFAULT_LOCALE: Locale;

// Original public port/type owner: packages/shared/src/platform.ts
export type DesktopTitleBarTheme = "light" | "dark" | "system";

// Original public port/type owner: packages/shared/src/desktopMenu.ts
import { type Locale } from "./protocol.js";
export declare const desktopMenuMessageIds: {
    readonly file: "titleBar.menu.file";
    readonly edit: "titleBar.menu.edit";
    readonly view: "titleBar.menu.view";
    readonly window: "titleBar.menu.window";
    readonly help: "titleBar.menu.help";
    readonly fileNewTask: "titleBar.menu.file.newTask";
    readonly fileOpenWorkspace: "titleBar.menu.file.openWorkspace";
    readonly fileCloseWindow: "titleBar.menu.file.closeWindow";
    readonly editUndo: "titleBar.menu.edit.undo";
    readonly editRedo: "titleBar.menu.edit.redo";
    readonly editCut: "titleBar.menu.edit.cut";
    readonly editCopy: "titleBar.menu.edit.copy";
    readonly editPaste: "titleBar.menu.edit.paste";
    readonly editDelete: "titleBar.menu.edit.delete";
    readonly editSelectAll: "titleBar.menu.edit.selectAll";
    readonly viewToggleFullScreen: "titleBar.menu.view.toggleFullScreen";
    readonly viewActualSize: "titleBar.menu.view.actualSize";
    readonly viewZoomIn: "titleBar.menu.view.zoomIn";
    readonly viewZoomOut: "titleBar.menu.view.zoomOut";
    readonly windowMinimize: "titleBar.menu.window.minimize";
    readonly windowZoom: "titleBar.menu.window.zoom";
    readonly windowBringAllToFront: "titleBar.menu.window.bringAllToFront";
    readonly appServices: "titleBar.menu.app.services";
    readonly appHide: "titleBar.menu.app.hide";
    readonly appHideOthers: "titleBar.menu.app.hideOthers";
    readonly appShowAll: "titleBar.menu.app.showAll";
    readonly appQuit: "titleBar.menu.app.quit";
    readonly helpAbout: "titleBar.menu.help.about";
    readonly helpWhatsNew: "titleBar.menu.help.whatsNew";
    readonly helpCheckForUpdates: "titleBar.menu.help.checkForUpdates";
    readonly helpToggleDevTools: "titleBar.menu.help.toggleDevTools";
    readonly helpResourceManager: "titleBar.menu.help.resourceManager";
    readonly helpToggleKnorviaStdioTap: "titleBar.menu.help.toggleKnorviaStdioTap";
    readonly helpKnorviaEndpoint: "titleBar.menu.help.endpoint";
    readonly helpKnorviaEndpointProduction: "titleBar.menu.help.endpoint.production";
    readonly helpKnorviaEndpointTest: "titleBar.menu.help.endpoint.test";
    readonly helpKnorviaEndpointCustom: "titleBar.menu.help.endpoint.custom";
    readonly helpKnorviaEndpointReset: "titleBar.menu.help.endpoint.reset";
    readonly helpFeedback: "titleBar.menu.help.feedback";
    readonly helpExportLogs: "titleBar.menu.help.exportLogs";
    readonly helpClearAllData: "titleBar.menu.help.clearAllData";
    readonly helpCheckingForUpdates: "desktopMenu.help.checkingForUpdates";
    readonly helpUpdateAvailableVersion: "desktopMenu.help.updateAvailableVersion";
    readonly helpDownloadingUpdateVersion: "desktopMenu.help.downloadingUpdateVersion";
    readonly helpDownloadingUpdateProgress: "desktopMenu.help.downloadingUpdateProgress";
    readonly helpRestartToUpdate: "desktopMenu.help.restartToUpdate";
    readonly dockShowCurrentWindow: "dock.menu.showCurrentWindow";
    readonly trayTooltip: "tray.tooltip";
    readonly trayOpenKnorvia: "tray.menu.openKnorvia";
    readonly trayQuit: "tray.menu.quit";
};
export declare function getDesktopMenuMessage(locale: Locale, id: DesktopMenuMessageId): string;
export type DesktopMenuMessageId = (typeof desktopMenuMessageIds)[keyof typeof desktopMenuMessageIds];

// Original public port/type owner: packages/shared/src/channels.ts
export declare const HostMessageTypes: {
    readonly DatabaseStartupControl: "database-startup-control";
    readonly InitLocal: "init-local";
    readonly ConnectRemoteWorkspace: "connect-remote-workspace";
    readonly CancelRemoteWorkspaceConnect: "cancel-remote-workspace-connect";
    readonly BindRemoteWorkspaceContext: "bind-remote-workspace-context";
    readonly DisposeRemoteWorkspaceSession: "dispose-remote-workspace-session";
    readonly AttachServicePort: "attach-service-port";
    readonly DetachServicePort: "detach-service-port";
    readonly Dispose: "dispose";
    readonly Broadcast: "broadcast";
    readonly BroadcastClaimResult: "broadcast-claim-result";
    readonly TaskRealtimeDeliver: "task-realtime-deliver";
    readonly TaskRunLeaseResult: "task-run-lease-result";
    readonly TaskOwnerCommandDeliver: "task-owner-command-deliver";
    readonly TaskOwnerCommandResult: "task-owner-command-result";
    readonly SessionMessageDeliver: "session-message-deliver";
    readonly SessionMessageDeliveryResult: "session-message-delivery-result";
    readonly FeedbackLogArchiveResult: "feedback-log-archive-result";
    readonly CronRun: "cron-run";
    readonly OffPeakRun: "off-peak-run";
    readonly BrowserExecuteResult: "browser-execute-result";
    readonly LocalMediaPreviewPathAuthorizeResult: "local-media-preview-path-authorize-result";
    readonly CuaPipFocusChanged: "cua-pip-focus-changed";
    readonly ResourceUsageSnapshotRequest: "resource-usage-snapshot-request";
    readonly ResourceUsageSnapshotCancel: "resource-usage-snapshot-cancel";
};
export declare const InternalChannels: {
    readonly DatabaseStartupState: "knorvia:database-startup-state";
    readonly DatabaseStartupControl: "knorvia:database-startup-control";
    readonly ServicePort: "knorvia:service-port";
    readonly ScopedServicePort: "knorvia:scoped-service-port";
    readonly ScopedServicePortReady: "knorvia:scoped-service-port-ready";
    readonly TaskNotificationSound: "knorvia:task-notification-sound";
};
export declare const PlatformChannels: {
    readonly SelectDirectory: "knorvia:select-directory";
    readonly SelectFile: "knorvia:select-file";
    readonly SelectFiles: "knorvia:select-files";
    readonly CreateTempTextAttachment: "knorvia:create-temp-text-attachment";
    readonly SaveFile: "knorvia:save-file";
    readonly PrintToPdf: "knorvia:print-to-pdf";
    readonly RemoteConnectionLog: "knorvia:remote-connection-log";
    readonly RemoteSessionClosed: "knorvia:remote-session-closed";
    readonly ActivateOrSetWorkspace: "knorvia:activate-or-set-workspace";
    readonly ConnectRemote: "knorvia:connect-remote";
    readonly CancelPendingRemoteConnection: "knorvia:cancel-pending-remote-connection";
    readonly BindRemoteWorkspaceSessionContext: "knorvia:bind-remote-workspace-session-context";
    readonly DisposeRemoteSession: "knorvia:dispose-remote-session";
    readonly IsDockerAvailable: "knorvia:is-docker-available";
    readonly ListWSLDistros: "knorvia:list-wsl-distros";
    readonly ListDockerContainers: "knorvia:list-docker-containers";
    readonly ListSSHConfigAliases: "knorvia:list-ssh-config-aliases";
    readonly LoadMcpFromUserDirectory: "knorvia:load-mcp-from-user-directory";
    readonly SaveMcpToUserDirectory: "knorvia:save-mcp-to-user-directory";
    readonly Log: "knorvia:log";
    readonly SyncWindowTabs: "knorvia:sync-window-tabs";
    readonly SyncWindowUnreadCount: "knorvia:sync-window-unread-count";
    readonly SyncActiveTaskSession: "knorvia:sync-active-task-session";
    readonly SyncAppSettings: "knorvia:sync-app-settings";
    readonly SetShortcutRecordingActive: "knorvia:set-shortcut-recording-active";
    readonly FocusTab: "knorvia:focus-tab";
    readonly NewTab: "knorvia:new-tab";
    readonly CloseActiveContextRequest: "knorvia:close-active-context-request";
    readonly OpenBrowserUrl: "knorvia:open-browser-url";
    readonly BrowserViewReady: "knorvia:browser-view-ready";
    readonly BrowserViewOperation: "knorvia:browser-view-operation";
    readonly BrowserViewVisibility: "knorvia:browser-view-visibility";
    readonly BrowserViewViewportChanged: "knorvia:browser-view-viewport-changed";
    readonly BrowserViewScreenshotSurfacePrepare: "knorvia:browser-view-screenshot-surface-prepare";
    readonly BrowserViewScreenshotSurfaceReady: "knorvia:browser-view-screenshot-surface-ready";
    readonly BrowserViewScreenshotSurfaceRelease: "knorvia:browser-view-screenshot-surface-release";
    readonly BrowserViewCloseTab: "knorvia:browser-view-close-tab";
    readonly BrowserViewSuspend: "knorvia:browser-view-suspend";
    readonly BrowserViewRestore: "knorvia:browser-view-restore";
    readonly NewTask: "knorvia:new-task";
    readonly OpenWorkspace: "knorvia:open-workspace";
    readonly OpenWorkspacePath: "knorvia:open-workspace-path";
    readonly OpenFeedbackDialog: "knorvia:open-feedback-dialog";
    readonly OpenTicketsPanel: "knorvia:open-tickets-panel";
    readonly WindowFullscreenChanged: "knorvia:window-fullscreen-changed";
    readonly GetDesktopWindowChromeState: "knorvia:get-desktop-window-chrome-state";
    readonly DesktopWindowChromeStateChanged: "knorvia:desktop-window-chrome-state-changed";
    readonly WindowControlsOverlayChanged: "knorvia:window-controls-overlay-changed";
    readonly WindowControlsOverlayReady: "knorvia:window-controls-overlay-ready";
    readonly GetResourceUsageSnapshot: "knorvia:get-resource-usage-snapshot";
    readonly SetResourceUsageSamplingActive: "knorvia:set-resource-usage-sampling-active";
    readonly OpenResourceManager: "knorvia:open-resource-manager";
    readonly StorageStartScan: "knorvia:storage-start-scan";
    readonly StorageCancelScan: "knorvia:storage-cancel-scan";
    readonly StorageGetSnapshot: "knorvia:storage-get-snapshot";
    readonly StorageClean: "knorvia:storage-clean";
    readonly StorageRevealPath: "knorvia:storage-reveal-path";
    readonly StorageScanProgress: "knorvia:storage-scan-progress";
    readonly OpenExternal: "knorvia:open-external";
    readonly CanOpenCommunity: "knorvia:can-open-community";
    readonly OpenInFileManager: "knorvia:open-in-file-manager";
    readonly OpenExternalFile: "knorvia:open-external-file";
    readonly OpenCuaPermissionOnboarding: "knorvia:open-cua-permission-onboarding";
    readonly CancelCuaPermissionOnboarding: "knorvia:cancel-cua-permission-onboarding";
    readonly PrepareCuaHelperPermissionDrag: "knorvia:prepare-cua-helper-permission-drag";
    readonly StartCuaHelperPermissionDrag: "knorvia:start-cua-helper-permission-drag";
    readonly NotifyCuaHelperPermissionDragEnded: "knorvia:notify-cua-helper-permission-drag-ended";
    readonly RendererReady: "knorvia:renderer-ready";
    readonly SyncTelemetryContext: "knorvia:sync-telemetry-context";
    readonly ReportTelemetryEvent: "knorvia:report-telemetry-event";
    readonly ReportArmsCustomEvent: "knorvia:report-arms-custom-event";
    readonly GetRendererActionTraceConfig: "knorvia:get-renderer-action-trace-config";
    readonly RendererActionTraceConfigChanged: "knorvia:renderer-action-trace-config-changed";
    readonly ReportRendererActionTraceBatch: "knorvia:report-renderer-action-trace-batch";
    readonly ReportRendererHeapSample: "knorvia:report-renderer-heap-sample";
    readonly ReportLocalTtftBatch: "knorvia:report-local-ttft-batch";
    readonly ReadFinalArmsCustomEventsE2E: "knorvia:e2e:read-final-arms-custom-events";
    readonly ClearFinalArmsCustomEventsE2E: "knorvia:e2e:clear-final-arms-custom-events";
    readonly ConfigureFinalArmsCustomEventsE2E: "knorvia:e2e:configure-final-arms-custom-events";
    readonly ShowTaskNotification: "knorvia:show-task-notification";
    readonly TaskNotificationSound: "knorvia:task-notification-sound";
    readonly TaskNotificationClick: "knorvia:task-notification-click";
    readonly ExportLogs: "knorvia:export-logs";
    readonly PreviewLocalDiagnostics: "knorvia:preview-local-diagnostics";
    readonly ExportLocalDiagnostics: "knorvia:export-local-diagnostics";
    readonly CheckReleaseUpdate: "knorvia:check-release-update";
    readonly CaptureWindowScreenshot: "knorvia:capture-window-screenshot";
    readonly BrowserViewAttachGuest: "knorvia:browser-view-attach-guest";
    readonly BrowserViewDetachGuest: "knorvia:browser-view-detach-guest";
    readonly BrowserViewCloseTabFromRenderer: "knorvia:browser-view-close-tab-from-renderer";
    readonly BrowserViewReportResidency: "knorvia:browser-view-report-residency";
    readonly BrowserViewSuspendReady: "knorvia:browser-view-suspend-ready";
    readonly BrowserViewEnsureResident: "knorvia:browser-view-ensure-resident";
    readonly BrowserViewRestoreTabs: "knorvia:browser-view-restore-tabs";
    readonly BrowserViewUpdateViewport: "knorvia:browser-view-update-viewport";
    readonly EmbeddedBrowserJavaScriptDialog: "knorvia:embedded-browser-javascript-dialog";
    readonly ImportChromeBrowserData: "knorvia:import-chrome-browser-data";
    readonly ClearEmbeddedBrowserData: "knorvia:clear-embedded-browser-data";
    readonly UpdateReady: "knorvia:update-ready";
    readonly UpdateCheckResult: "knorvia:update-check-result";
    readonly UpdateStateChanged: "knorvia:update-state-changed";
    readonly GetUpdateState: "knorvia:get-update-state";
    readonly DownloadUpdate: "knorvia:download-update";
    readonly CancelUpdateDownload: "knorvia:cancel-update-download";
    readonly OpenUpdateStatusWindow: "knorvia:open-update-status-window";
    readonly GetAutoUpdatePreferences: "knorvia:get-auto-update-preferences";
    readonly SetAutoDownloadAndInstallUpdates: "knorvia:set-auto-download-and-install-updates";
    readonly GetDesktopSessionActivity: "knorvia:get-desktop-session-activity";
    readonly GetDesktopZoomLevel: "knorvia:get-desktop-zoom-level";
    readonly DesktopZoomLevelChanged: "knorvia:desktop-zoom-level-changed";
    readonly GetKnorviaStdioTapDevState: "knorvia:get-stdio-tap-dev-state";
    readonly SettingsChanged: "knorvia:settings-changed";
    readonly ApplicationLocaleChanged: "knorvia:application-locale-changed";
    readonly GetSystemLocale: "knorvia:get-system-locale";
    readonly PostUpdateReleaseNotes: "knorvia:post-update-release-notes";
    readonly AcknowledgePostUpdateReleaseNotes: "knorvia:ack-post-update-release-notes";
    readonly SkipUpdateVersion: "knorvia:skip-update-version";
    readonly QuitAndInstallUpdate: "knorvia:quit-and-install-update";
    readonly GetInstalledEditors: "knorvia:get-installed-editors";
    readonly GetApplicationIcon: "knorvia:get-application-icon";
    readonly OpenInEditor: "knorvia:open-in-editor";
    readonly ExecuteDesktopCommand: "knorvia:execute-desktop-command";
    readonly SetApplicationLocale: "knorvia:set-application-locale";
    readonly SetTitleBarTheme: "knorvia:set-title-bar-theme";
    readonly SetWindowGlass: "knorvia:set-window-glass";
    readonly MigrateLegacyCommonMcp: "knorvia:migrate-legacy-common-mcp";
    readonly GetDeviceId: "knorvia:get-device-id";
};

