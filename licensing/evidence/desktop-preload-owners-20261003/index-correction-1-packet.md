# Complete preload index owner

Read ONLY this packet and /workspace/knorvia-studio/AGENTS.md and /workspace/knorvia-studio/.agents/skills/architecture-governance/SKILL.md. No other source/tests/dependencies/history/config/environment/prior drafts/other author reads. No network, execution, formatter/build/tests or repository edits.
Author ONE COMPLETE TypeScript module at assigned /tmp path with ONE literal quoted heredoc or apply_patch. No file copying/transforms/assembly. SHA-only afterward; do not reopen/execute draft. Choose private design freely, no novelty requirement. Preserve complete behavior/API/context isolation/errors/references/order; imported policy unchanged. Do not export new APIs. Module-level side effects occur only when product loads module; curator validation injects all ports/globals. Never install actual preload/access user browser/clipboard/media/settings/permissions/data.
Packet exposes public imports/type declarations/function or bridge signatures and channel-routing contract data, no predecessor private helpers/state/decomposition or function bodies. Static facade names/signatures/channels/defaults/normalized identical expressions earn zero credit. Whole candidate accepted independence/MIT credit zero pending parent. Restrictions instruction-limited, not OS clean room.

Assigned output: /tmp/knorvia-preload-index-author.ts

## Permitted public imports/types

import { databaseStartupControlSchema, databaseStartupStateSchema, databaseStartupPortPayloadSchema, } from "@knorvia/shared";
import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";
import type { AppSettings, ApplicationIconRequest, BrowserViewOperationPayload, BrowserGuestAttachResult, BrowserViewScreenshotSurfacePreparePayload, BrowserViewScreenshotSurfaceReadyPayload, BrowserViewScreenshotSurfaceReleasePayload, BrowserViewViewportChangedPayload, BrowserViewCloseTabNotification, BrowserViewCloseTabRequest, BrowserViewResidencyReportPayload, BrowserViewResidencyTransitionPayload, BrowserViewRestoredTabShell, BrowserViewRestoreTabsRequest, BrowserViewportSize, DesktopZoomState, DesktopWindowChromeState, DesktopCommandId, DesktopTitleBarTheme, EmbeddedBrowserOpenUrlRequest, Locale, OpenInEditorOptions, RemoteTarget, TaskNotificationPayload, TelemetryRendererContext, RendererActionTraceBatchV1, RendererActionTraceConfigV1, RendererHeapSample, PostUpdateReleaseNotesPayload, RemoteSessionClosedEvent, UpdateCheckResultPayload, UpdateStatePayload, KnorviaStdioTapDevState, LoadCliMcpFromUserDirectoryRequest, MigrateLegacyCommonMcpRequest, SaveCliMcpToUserDirectoryRequest, SaveFileRequest, SaveFileResult, PrintPageToPdfResult, SSHConfigAliasOption, RemoteConnectionRuntimeLog, WindowControlsOverlayMetrics, WindowControlsOverlayReadyPayload, CreateTempTextAttachmentRequest, OpenCuaPermissionOnboardingOptions, ConfigureFinalArmsCustomEventE2ERequest, FinalArmsCustomEventE2EEntry, } from "@knorvia/shared";
import { InternalChannels, PlatformChannels, formatKnorviaRendererProcessName, shouldEnableE2ETestBridge, } from "@knorvia/shared";


## Public bridge signatures and channel-routing catalog

{
  "bridges": [
    {
      "key": "\"__knorviaFinalArmsCustomEventsE2E\"",
      "methods": [
        {
          "name": "read",
          "signature": "() => Promise<FinalArmsCustomEventE2EEntry[]>",
          "returnAnnotationPresent": true
        },
        {
          "name": "clear",
          "signature": "() => Promise<void>",
          "returnAnnotationPresent": true
        },
        {
          "name": "configure",
          "signature": "(request: ConfigureFinalArmsCustomEventE2ERequest) => Promise<void>",
          "returnAnnotationPresent": true
        }
      ]
    },
    {
      "key": "\"knorvia\"",
      "methods": [
        {
          "name": "connectRemote",
          "signature": "(options: RemoteTarget, requestId?: string, context?: {\n    workspacePath: string;\n    workspaceIdentity?: string;\n    connectTrigger?: import(\"@knorvia/shared\").RemoteWorkspaceConnectTrigger;\n}) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "cancelPendingRemoteConnection",
          "signature": "(requestId?: string) => Promise<void>",
          "returnAnnotationPresent": true
        },
        {
          "name": "bindRemoteWorkspaceSessionContext",
          "signature": "(context: {\n    remoteSessionId: string;\n    workspacePath: string;\n    workspaceIdentity?: string;\n}) => Promise<void>",
          "returnAnnotationPresent": true
        },
        {
          "name": "disposeRemoteSession",
          "signature": "(sessionId: string) => Promise<void>",
          "returnAnnotationPresent": true
        },
        {
          "name": "isDockerAvailable",
          "signature": "() => Promise<boolean>",
          "returnAnnotationPresent": true
        },
        {
          "name": "listWSLDistros",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "listDockerContainers",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "listSSHConfigAliases",
          "signature": "() => Promise<SSHConfigAliasOption[]>",
          "returnAnnotationPresent": true
        },
        {
          "name": "loadMcpFromUserDirectory",
          "signature": "(payload?: LoadCliMcpFromUserDirectoryRequest) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "saveMcpToUserDirectory",
          "signature": "(payload: SaveCliMcpToUserDirectoryRequest) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "migrateLegacyCommonMcp",
          "signature": "(payload?: MigrateLegacyCommonMcpRequest) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "log",
          "signature": "(level: \"info\" | \"warn\" | \"error\", args: unknown[]) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "selectDirectory",
          "signature": "() => Promise<string | null>",
          "returnAnnotationPresent": true
        },
        {
          "name": "selectFile",
          "signature": "() => Promise<string | null>",
          "returnAnnotationPresent": true
        },
        {
          "name": "selectFiles",
          "signature": "() => Promise<string[]>",
          "returnAnnotationPresent": true
        },
        {
          "name": "saveFile",
          "signature": "(payload: SaveFileRequest) => Promise<SaveFileResult>",
          "returnAnnotationPresent": true
        },
        {
          "name": "printPageToPdf",
          "signature": "() => Promise<PrintPageToPdfResult>",
          "returnAnnotationPresent": true
        },
        {
          "name": "getPathForFile",
          "signature": "(file: File) => string | null",
          "returnAnnotationPresent": true
        },
        {
          "name": "createTempTextAttachment",
          "signature": "(payload: CreateTempTextAttachmentRequest) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "onRemoteConnectionLog",
          "signature": "(callback: (entry: RemoteConnectionRuntimeLog) => void) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "onRemoteSessionClosed",
          "signature": "(callback: (event: RemoteSessionClosedEvent) => void) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "activateOrSetWorkspace",
          "signature": "(path: string) => Promise<{\n    activated: boolean;\n}>",
          "returnAnnotationPresent": true
        },
        {
          "name": "syncWindowTabs",
          "signature": "(paths: string[]) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "syncWindowUnreadCount",
          "signature": "(count: number) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "syncActiveTaskSession",
          "signature": "(sessionId: string | null) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "syncAppSettings",
          "signature": "(patch: Partial<AppSettings>) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "setShortcutRecordingActive",
          "signature": "(active: boolean) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "onFocusTab",
          "signature": "(callback: (path: string) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onNewTab",
          "signature": "(callback: () => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onCloseActiveContextRequest",
          "signature": "(callback: () => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onOpenBrowserUrl",
          "signature": "(callback: (request: EmbeddedBrowserOpenUrlRequest) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewReady",
          "signature": "(callback: (payload: {\n    workspaceKey: string;\n    remoteSessionId?: string;\n    sessionId: string;\n    tabId: string;\n    browserId: string;\n    browserGeneration: number;\n}) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewOperation",
          "signature": "(callback: (payload: BrowserViewOperationPayload) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewViewportChanged",
          "signature": "(callback: (payload: BrowserViewViewportChangedPayload) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewScreenshotSurfacePrepare",
          "signature": "(callback: (payload: BrowserViewScreenshotSurfacePreparePayload) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewScreenshotSurfaceRelease",
          "signature": "(callback: (payload: BrowserViewScreenshotSurfaceReleasePayload) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "browserViewScreenshotSurfaceReady",
          "signature": "(payload: BrowserViewScreenshotSurfaceReadyPayload) => void",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewVisibility",
          "signature": "(callback: (payload: {\n    visible: boolean;\n    workspaceKey: string;\n    remoteSessionId: string | undefined;\n    sessionId: string;\n    tabId?: string;\n    browserId: string;\n    browserGeneration: number;\n}) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewCloseTab",
          "signature": "(callback: (payload: BrowserViewCloseTabNotification) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewSuspend",
          "signature": "(callback: (payload: BrowserViewResidencyTransitionPayload) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onBrowserViewRestore",
          "signature": "(callback: (payload: BrowserViewResidencyTransitionPayload) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onNewTask",
          "signature": "(callback: () => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onOpenWorkspace",
          "signature": "(callback: () => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onOpenWorkspacePath",
          "signature": "(callback: (path: string) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onOpenFeedbackDialog",
          "signature": "(callback: () => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onOpenTicketsPanel",
          "signature": "(callback: () => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onWindowFullscreenChanged",
          "signature": "(callback: (isFullscreen: boolean) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "getDesktopWindowChromeState",
          "signature": "() => Promise<DesktopWindowChromeState>",
          "returnAnnotationPresent": true
        },
        {
          "name": "onDesktopWindowChromeStateChanged",
          "signature": "(callback: (state: DesktopWindowChromeState) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "getWindowControlsOverlayMetrics",
          "signature": "() => WindowControlsOverlayMetrics",
          "returnAnnotationPresent": true
        },
        {
          "name": "onWindowControlsOverlayChanged",
          "signature": "(callback: (metrics: WindowControlsOverlayMetrics) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "getDesktopZoomLevel",
          "signature": "() => Promise<DesktopZoomState>",
          "returnAnnotationPresent": true
        },
        {
          "name": "onDesktopZoomLevelChanged",
          "signature": "(callback: (state: DesktopZoomState) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onTaskNotificationClick",
          "signature": "(callback: (taskId: string) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "openExternal",
          "signature": "(url: string) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "canOpenCommunity",
          "signature": "(locale: Locale) => Promise<boolean>",
          "returnAnnotationPresent": true
        },
        {
          "name": "openInFileManager",
          "signature": "(path: string) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "openExternalFile",
          "signature": "(path: string) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "openCuaPermissionOnboarding",
          "signature": "(options?: OpenCuaPermissionOnboardingOptions) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "cancelCuaPermissionOnboarding",
          "signature": "(operationId: string) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "prepareCuaHelperPermissionDrag",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "startCuaHelperPermissionDrag",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "notifyRendererReady",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "syncTelemetryContext",
          "signature": "(_context: TelemetryRendererContext) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "reportTelemetryEvent",
          "signature": "(_payload: {\n    context: TelemetryRendererContext;\n    elementName: string;\n    eventRegion: string;\n    eventType: string;\n    eventText?: string;\n    eventExtraDetail: Record<string, string>;\n    userId?: string;\n    talkId?: string;\n    messageId?: string;\n}) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "reportArmsCustomEvent",
          "signature": "(_payload: {\n    name: string;\n    group: string;\n    value?: number;\n    properties?: Record<string, string | number | boolean | undefined>;\n}) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "getRendererActionTraceConfig",
          "signature": "() => Promise<RendererActionTraceConfigV1>",
          "returnAnnotationPresent": true
        },
        {
          "name": "onRendererActionTraceConfigChanged",
          "signature": "(callback: (config: RendererActionTraceConfigV1) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "reportLocalTtftBatch",
          "signature": "(batch: import(\"@knorvia/shared\").LocalTtftBatch) => void",
          "returnAnnotationPresent": true
        },
        {
          "name": "reportRendererActionTraceBatch",
          "signature": "(batch: RendererActionTraceBatchV1) => void",
          "returnAnnotationPresent": true
        },
        {
          "name": "reportRendererHeapSample",
          "signature": "(sample: RendererHeapSample) => void",
          "returnAnnotationPresent": true
        },
        {
          "name": "showTaskNotification",
          "signature": "(payload: TaskNotificationPayload) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "exportLogs",
          "signature": "() => Promise<{\n    success: boolean;\n    path?: string;\n    error?: string;\n}>",
          "returnAnnotationPresent": true
        },
        {
          "name": "previewLocalDiagnostics",
          "signature": "(request: import(\"@knorvia/shared\").LocalDiagnosticRequest) => Promise<import(\"@knorvia/shared\").LocalDiagnosticPreview>",
          "returnAnnotationPresent": true
        },
        {
          "name": "exportLocalDiagnostics",
          "signature": "(id: string) => Promise<import(\"@knorvia/shared\").LocalDiagnosticExportResult>",
          "returnAnnotationPresent": true
        },
        {
          "name": "checkReleaseUpdate",
          "signature": "() => Promise<import(\"@knorvia/shared\").ReleaseUpdateCheckResult>",
          "returnAnnotationPresent": true
        },
        {
          "name": "captureWindowScreenshot",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "browserViewAttachGuest",
          "signature": "(payload: {\n    key: string;\n    webContentsId: number;\n    active?: boolean;\n    workspaceKey?: string;\n    remoteSessionId?: string;\n    sessionId?: string;\n    residencyGeneration?: number;\n}) => Promise<BrowserGuestAttachResult>",
          "returnAnnotationPresent": true
        },
        {
          "name": "browserViewDetachGuest",
          "signature": "(payload: {\n    key: string;\n    webContentsId: number;\n}) => Promise<boolean>",
          "returnAnnotationPresent": true
        },
        {
          "name": "browserViewCloseTab",
          "signature": "(payload: BrowserViewCloseTabRequest) => Promise<void>",
          "returnAnnotationPresent": true
        },
        {
          "name": "browserViewReportResidency",
          "signature": "(payload: BrowserViewResidencyReportPayload) => Promise<void>",
          "returnAnnotationPresent": true
        },
        {
          "name": "browserViewSuspendReady",
          "signature": "(payload: {\n    tabId: string;\n    generation: number;\n}) => Promise<void>",
          "returnAnnotationPresent": true
        },
        {
          "name": "browserViewEnsureResident",
          "signature": "(payload: BrowserViewCloseTabRequest) => Promise<void>",
          "returnAnnotationPresent": true
        },
        {
          "name": "browserViewRestoreTabs",
          "signature": "(payload: BrowserViewRestoreTabsRequest) => Promise<BrowserViewRestoredTabShell[]>",
          "returnAnnotationPresent": true
        },
        {
          "name": "browserViewUpdateViewport",
          "signature": "(payload: {\n    tabId: string;\n    viewport: BrowserViewportSize | null;\n}) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "importChromeBrowserData",
          "signature": "(options?: import(\"@knorvia/shared\").ChromeBrowserDataImportOptions) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "clearEmbeddedBrowserData",
          "signature": "(mode: \"cache\" | \"all\") => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "getKnorviaStdioTapDevState",
          "signature": "() => Promise<KnorviaStdioTapDevState>",
          "returnAnnotationPresent": true
        },
        {
          "name": "onSettingsChanged",
          "signature": "(callback: () => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onApplicationLocaleChanged",
          "signature": "(callback: (locale: Locale) => void) => (() => void)",
          "returnAnnotationPresent": true
        },
        {
          "name": "onUpdateCheckResult",
          "signature": "(_callback: (payload: UpdateCheckResultPayload) => void) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "getUpdateState",
          "signature": "() => Promise<UpdateStatePayload>",
          "returnAnnotationPresent": true
        },
        {
          "name": "onUpdateStateChanged",
          "signature": "(_callback: (payload: UpdateStatePayload) => void) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "onUpdateReady",
          "signature": "(_callback: (version: string) => void) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "onPostUpdateReleaseNotes",
          "signature": "(_callback: (payload: PostUpdateReleaseNotesPayload) => void) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "getAutoUpdatePreferences",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "setAutoDownloadAndInstallUpdates",
          "signature": "(_enabled: boolean) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "downloadUpdate",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "cancelUpdateDownload",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "openUpdateStatusWindow",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "acknowledgePostUpdateReleaseNotes",
          "signature": "(_version: string) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "skipUpdateVersion",
          "signature": "(_version: string) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "quitAndInstallUpdate",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "getDesktopSessionActivity",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "getInstalledEditors",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "getApplicationIcon",
          "signature": "(request: string | ApplicationIconRequest) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "openInEditor",
          "signature": "(editorId: string, path: string, options?: OpenInEditorOptions) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "executeDesktopCommand",
          "signature": "(command: DesktopCommandId) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "setApplicationLocale",
          "signature": "(locale: Locale) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "getSystemLocale",
          "signature": "() => Promise<Locale>",
          "returnAnnotationPresent": true
        },
        {
          "name": "setTitleBarTheme",
          "signature": "(theme: DesktopTitleBarTheme) => unknown",
          "returnAnnotationPresent": false
        },
        {
          "name": "setWindowGlass",
          "signature": "(enabled: boolean) => Promise<boolean>",
          "returnAnnotationPresent": true
        },
        {
          "name": "getDeviceId",
          "signature": "() => unknown",
          "returnAnnotationPresent": false
        }
      ]
    }
  ],
  "routes": [
    {
      "bridgeKey": "\"__knorviaFinalArmsCustomEventsE2E\"",
      "method": "read",
      "mode": "invoke",
      "channel": "PlatformChannels.ReadFinalArmsCustomEventsE2E",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"__knorviaFinalArmsCustomEventsE2E\"",
      "method": "clear",
      "mode": "invoke",
      "channel": "PlatformChannels.ClearFinalArmsCustomEventsE2E",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"__knorviaFinalArmsCustomEventsE2E\"",
      "method": "configure",
      "mode": "invoke",
      "channel": "PlatformChannels.ConfigureFinalArmsCustomEventsE2E",
      "argumentNames": [
        "request"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "connectRemote",
      "mode": "invoke",
      "channel": "PlatformChannels.ConnectRemote",
      "argumentNames": [
        "options",
        "requestId",
        "context"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "cancelPendingRemoteConnection",
      "mode": "invoke",
      "channel": "PlatformChannels.CancelPendingRemoteConnection",
      "argumentNames": [
        "requestId"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "bindRemoteWorkspaceSessionContext",
      "mode": "invoke",
      "channel": "PlatformChannels.BindRemoteWorkspaceSessionContext",
      "argumentNames": [
        "context"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "disposeRemoteSession",
      "mode": "invoke",
      "channel": "PlatformChannels.DisposeRemoteSession",
      "argumentNames": [
        "sessionId"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "isDockerAvailable",
      "mode": "invoke",
      "channel": "PlatformChannels.IsDockerAvailable",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "listWSLDistros",
      "mode": "invoke",
      "channel": "PlatformChannels.ListWSLDistros",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "listDockerContainers",
      "mode": "invoke",
      "channel": "PlatformChannels.ListDockerContainers",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "listSSHConfigAliases",
      "mode": "invoke",
      "channel": "PlatformChannels.ListSSHConfigAliases",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "loadMcpFromUserDirectory",
      "mode": "invoke",
      "channel": "PlatformChannels.LoadMcpFromUserDirectory",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "saveMcpToUserDirectory",
      "mode": "invoke",
      "channel": "PlatformChannels.SaveMcpToUserDirectory",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "migrateLegacyCommonMcp",
      "mode": "invoke",
      "channel": "PlatformChannels.MigrateLegacyCommonMcp",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "log",
      "mode": "send",
      "channel": "PlatformChannels.Log",
      "argumentNames": [
        "level",
        "args"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "selectDirectory",
      "mode": "invoke",
      "channel": "PlatformChannels.SelectDirectory",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "selectFile",
      "mode": "invoke",
      "channel": "PlatformChannels.SelectFile",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "selectFiles",
      "mode": "invoke",
      "channel": "PlatformChannels.SelectFiles",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "saveFile",
      "mode": "invoke",
      "channel": "PlatformChannels.SaveFile",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "printPageToPdf",
      "mode": "invoke",
      "channel": "PlatformChannels.PrintToPdf",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getPathForFile",
      "channels": [],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "createTempTextAttachment",
      "mode": "invoke",
      "channel": "PlatformChannels.CreateTempTextAttachment",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onRemoteConnectionLog",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.RemoteConnectionLog"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.RemoteConnectionLog"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onRemoteSessionClosed",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.RemoteSessionClosed"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.RemoteSessionClosed"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "activateOrSetWorkspace",
      "mode": "invoke",
      "channel": "PlatformChannels.ActivateOrSetWorkspace",
      "argumentNames": [
        "path"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "syncWindowTabs",
      "mode": "send",
      "channel": "PlatformChannels.SyncWindowTabs",
      "argumentNames": [
        "paths"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "syncWindowUnreadCount",
      "mode": "send",
      "channel": "PlatformChannels.SyncWindowUnreadCount",
      "argumentNames": [
        "count"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "syncActiveTaskSession",
      "mode": "send",
      "channel": "PlatformChannels.SyncActiveTaskSession",
      "argumentNames": [
        "sessionId"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "syncAppSettings",
      "mode": "send",
      "channel": "PlatformChannels.SyncAppSettings",
      "argumentNames": [
        "patch"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "setShortcutRecordingActive",
      "mode": "send",
      "channel": "PlatformChannels.SetShortcutRecordingActive",
      "argumentNames": [
        "active"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onFocusTab",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.FocusTab"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.FocusTab"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onNewTab",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.NewTab"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.NewTab"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onCloseActiveContextRequest",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.CloseActiveContextRequest"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.CloseActiveContextRequest"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onOpenBrowserUrl",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.OpenBrowserUrl"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.OpenBrowserUrl"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewReady",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewReady"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewReady"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewOperation",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewOperation"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewOperation"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewViewportChanged",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewViewportChanged"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewViewportChanged"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewScreenshotSurfacePrepare",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewScreenshotSurfacePrepare"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewScreenshotSurfacePrepare"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewScreenshotSurfaceRelease",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewScreenshotSurfaceRelease"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewScreenshotSurfaceRelease"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewScreenshotSurfaceReady",
      "channels": [
        {
          "mode": "send",
          "channel": "PlatformChannels.BrowserViewScreenshotSurfaceReady"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewVisibility",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewVisibility"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewVisibility"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewCloseTab",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewCloseTab"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewCloseTab"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewSuspend",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewSuspend"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewSuspend"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onBrowserViewRestore",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.BrowserViewRestore"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.BrowserViewRestore"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onNewTask",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.NewTask"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.NewTask"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onOpenWorkspace",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.OpenWorkspace"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.OpenWorkspace"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onOpenWorkspacePath",
      "channels": [],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onOpenFeedbackDialog",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.OpenFeedbackDialog"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.OpenFeedbackDialog"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onOpenTicketsPanel",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.OpenTicketsPanel"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.OpenTicketsPanel"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onWindowFullscreenChanged",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.WindowFullscreenChanged"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.WindowFullscreenChanged"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getDesktopWindowChromeState",
      "mode": "invoke",
      "channel": "PlatformChannels.GetDesktopWindowChromeState",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onDesktopWindowChromeStateChanged",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.DesktopWindowChromeStateChanged"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.DesktopWindowChromeStateChanged"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getWindowControlsOverlayMetrics",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onWindowControlsOverlayChanged",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.WindowControlsOverlayChanged"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.WindowControlsOverlayChanged"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getDesktopZoomLevel",
      "channels": [
        {
          "mode": "invoke",
          "channel": "PlatformChannels.GetDesktopZoomLevel"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onDesktopZoomLevelChanged",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.DesktopZoomLevelChanged"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.DesktopZoomLevelChanged"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onTaskNotificationClick",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.TaskNotificationClick"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.TaskNotificationClick"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "openExternal",
      "mode": "send",
      "channel": "PlatformChannels.OpenExternal",
      "argumentNames": [
        "url"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "canOpenCommunity",
      "mode": "invoke",
      "channel": "PlatformChannels.CanOpenCommunity",
      "argumentNames": [
        "locale"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "openInFileManager",
      "mode": "invoke",
      "channel": "PlatformChannels.OpenInFileManager",
      "argumentNames": [
        "path"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "openExternalFile",
      "mode": "invoke",
      "channel": "PlatformChannels.OpenExternalFile",
      "argumentNames": [
        "path"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "openCuaPermissionOnboarding",
      "mode": "invoke",
      "channel": "PlatformChannels.OpenCuaPermissionOnboarding",
      "argumentNames": [
        "options"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "cancelCuaPermissionOnboarding",
      "mode": "send",
      "channel": "PlatformChannels.CancelCuaPermissionOnboarding",
      "argumentNames": [
        "operationId"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "prepareCuaHelperPermissionDrag",
      "mode": "invoke",
      "channel": "PlatformChannels.PrepareCuaHelperPermissionDrag",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "startCuaHelperPermissionDrag",
      "mode": "send",
      "channel": "PlatformChannels.StartCuaHelperPermissionDrag",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "notifyRendererReady",
      "mode": "send",
      "channel": "PlatformChannels.RendererReady",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "syncTelemetryContext",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "reportTelemetryEvent",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "reportArmsCustomEvent",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getRendererActionTraceConfig",
      "mode": "invoke",
      "channel": "PlatformChannels.GetRendererActionTraceConfig",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onRendererActionTraceConfigChanged",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.RendererActionTraceConfigChanged"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.RendererActionTraceConfigChanged"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "reportLocalTtftBatch",
      "mode": "send",
      "channel": "PlatformChannels.ReportLocalTtftBatch",
      "argumentNames": [
        "batch"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "reportRendererActionTraceBatch",
      "mode": "send",
      "channel": "PlatformChannels.ReportRendererActionTraceBatch",
      "argumentNames": [
        "batch"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "reportRendererHeapSample",
      "mode": "send",
      "channel": "PlatformChannels.ReportRendererHeapSample",
      "argumentNames": [
        "sample"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "showTaskNotification",
      "mode": "send",
      "channel": "PlatformChannels.ShowTaskNotification",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "exportLogs",
      "mode": "invoke",
      "channel": "PlatformChannels.ExportLogs",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "previewLocalDiagnostics",
      "mode": "invoke",
      "channel": "PlatformChannels.PreviewLocalDiagnostics",
      "argumentNames": [
        "request"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "exportLocalDiagnostics",
      "mode": "invoke",
      "channel": "PlatformChannels.ExportLocalDiagnostics",
      "argumentNames": [
        "id"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "checkReleaseUpdate",
      "mode": "invoke",
      "channel": "PlatformChannels.CheckReleaseUpdate",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "captureWindowScreenshot",
      "mode": "invoke",
      "channel": "PlatformChannels.CaptureWindowScreenshot",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewAttachGuest",
      "mode": "invoke",
      "channel": "PlatformChannels.BrowserViewAttachGuest",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewDetachGuest",
      "mode": "invoke",
      "channel": "PlatformChannels.BrowserViewDetachGuest",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewCloseTab",
      "mode": "invoke",
      "channel": "PlatformChannels.BrowserViewCloseTabFromRenderer",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewReportResidency",
      "mode": "invoke",
      "channel": "PlatformChannels.BrowserViewReportResidency",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewSuspendReady",
      "mode": "invoke",
      "channel": "PlatformChannels.BrowserViewSuspendReady",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewEnsureResident",
      "mode": "invoke",
      "channel": "PlatformChannels.BrowserViewEnsureResident",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewRestoreTabs",
      "mode": "invoke",
      "channel": "PlatformChannels.BrowserViewRestoreTabs",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "browserViewUpdateViewport",
      "mode": "invoke",
      "channel": "PlatformChannels.BrowserViewUpdateViewport",
      "argumentNames": [
        "payload"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "importChromeBrowserData",
      "mode": "invoke",
      "channel": "PlatformChannels.ImportChromeBrowserData",
      "argumentNames": [
        "options"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "clearEmbeddedBrowserData",
      "mode": "invoke",
      "channel": "PlatformChannels.ClearEmbeddedBrowserData",
      "argumentNames": [
        "mode"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getKnorviaStdioTapDevState",
      "mode": "invoke",
      "channel": "PlatformChannels.GetKnorviaStdioTapDevState",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onSettingsChanged",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.SettingsChanged"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.SettingsChanged"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onApplicationLocaleChanged",
      "channels": [
        {
          "mode": "on",
          "channel": "PlatformChannels.ApplicationLocaleChanged"
        },
        {
          "mode": "removeListener",
          "channel": "PlatformChannels.ApplicationLocaleChanged"
        }
      ],
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onUpdateCheckResult",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getUpdateState",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onUpdateStateChanged",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onUpdateReady",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "onPostUpdateReleaseNotes",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getAutoUpdatePreferences",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "setAutoDownloadAndInstallUpdates",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "downloadUpdate",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "cancelUpdateDownload",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "openUpdateStatusWindow",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "acknowledgePostUpdateReleaseNotes",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "skipUpdateVersion",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "quitAndInstallUpdate",
      "special": true
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getDesktopSessionActivity",
      "mode": "invoke",
      "channel": "PlatformChannels.GetDesktopSessionActivity",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getInstalledEditors",
      "mode": "invoke",
      "channel": "PlatformChannels.GetInstalledEditors",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getApplicationIcon",
      "mode": "invoke",
      "channel": "PlatformChannels.GetApplicationIcon",
      "argumentNames": [
        "request"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "openInEditor",
      "mode": "invoke",
      "channel": "PlatformChannels.OpenInEditor",
      "argumentNames": [
        "editorId",
        "path",
        "options"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "executeDesktopCommand",
      "mode": "invoke",
      "channel": "PlatformChannels.ExecuteDesktopCommand",
      "argumentNames": [
        "command"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "setApplicationLocale",
      "mode": "invoke",
      "channel": "PlatformChannels.SetApplicationLocale",
      "argumentNames": [
        "locale"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getSystemLocale",
      "mode": "invoke",
      "channel": "PlatformChannels.GetSystemLocale",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "setTitleBarTheme",
      "mode": "invoke",
      "channel": "PlatformChannels.SetTitleBarTheme",
      "argumentNames": [
        "theme"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "setWindowGlass",
      "mode": "invoke",
      "channel": "PlatformChannels.SetWindowGlass",
      "argumentNames": [
        "enabled"
      ],
      "payloadCount": 1,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    },
    {
      "bridgeKey": "\"knorvia\"",
      "method": "getDeviceId",
      "mode": "invoke",
      "channel": "PlatformChannels.GetDeviceId",
      "argumentNames": [],
      "payloadCount": 0,
      "forwarding": "See special cases below; all other direct routes forward named positional arguments unchanged, including explicitly undefined optional arguments."
    }
  ]
}

## External behavior


Complete platform bridge entry, public methods/routing listed below. Preserve static method names/signatures/channel bindings and disabled defaults exactly; no novel policy or facade data needed. Raw ipc invoke Promise identity and send return identity preserved in direct routes, including undefined optional args. Callback errors propagate. No main process/renderer business state changes.
Public no-return-annotation signatures in catalog use unknown PLACEHOLDER, not a required return annotation; retain inferred typing where supplied annotation absent. Preserve listed explicit annotations.
Module startup order:
- shouldEnableE2ETestBridge(process.env) retained policy exactly once; truthy exposes "__knorviaFinalArmsCustomEventsE2E" methods before all other operations, falsey no exposure.
- Read webFrame.getZoomFactor() once. Convert zoom factor finite&&>0 elselevel0, else round(logfactor/log1.1), clamp[-3,5]. Derivedfactor=1.1^clampedlevel. Metrics darwin{leftPaddingPx:round(96/factor)}, win32{rightPaddingPx:round(136/factor),titleBarHeightPx:round(48*factor)},else{}. Payload order {zoomLevel,metrics}; sendPlatform.WindowControlsOverlayReady(initialpayload) BEFOREregisteringlisteners.
- Permanent IPClisteners Platform.WindowControlsOverlayChanged sets cachedmetrics to payload (including null); Platform.DesktopZoomLevelChanged reads state.zoomLevel and iffinite clampscachedlevel; Platform.OpenWorkspacePath: no registeredcallbacks ->queue originalpath; else Set encounter-ordercallbacks(path), no validation/catches. Per-module state only, no sharedglobal queue.
- Set process.title=formatKnorviaRendererProcessName(document.title), then window.addEventListener("DOMContentLoaded",sameupdatetitle,{once:true}). No other document/window/native probes.
- Expose contextBridge "knorvia" COMPLETE method object, public method catalog order.
- Register Internal.ServicePort listener then ScopedServicePort listener then samewindow ready ACKmessage listener, Platform.TaskNotificationSound listener, Internal.DatabaseStartupState listener, then samewindow startupcontrol message listener.

Special method semantics:
connectRemote(options,requestId?,context?): invoke ConnectRemote with {target:options,requestId,...truthycontext fields}; spread context last, so callercontext own fields can override target/requestId at runtime; preserve reference values and keysundefined.
cancelPendingRemoteConnection(requestId?):invoke CancelPendingRemoteConnection,{requestId}, includeundefinedkey.
loadMcpFromUserDirectory/migrateLegacyCommonMcp optional payload??{}; no extra args.
log(level,args):send Log,{level,args}.
openInEditor(editorId,path,options?):invoke OpenInEditor,{editorId,path,options},includeundefinedkey.
cancelCuaPermissionOnboarding(operationId):send CancelCuaPermissionOnboarding,{operationId}. No actual permission operation in tests.
getPathForFile(file):webUtils.getPathForFile(file).trim();length>0?trimmedstring:null; rawerrorpropagates.
syncTelemetryContext returnsundefined/noIPC. reportTelemetryEvent/reportArmsCustomEvent returnnew Promise.resolve(undefined)/noIPC.
Disabled updater facade: onUpdateCheckResult,onUpdateStateChanged,onUpdateReady,onPostUpdateReleaseNotes ignore callbacks and return no-op disposer (noIPC or callback). getUpdateState returnsPromise.resolve({kind:"idle",enabled:false});getAutoUpdatePreferences Promise.resolve({autoDownloadAndInstallUpdates:false}); setAutoDownloadAndInstallUpdates,downloadUpdate,cancelUpdateDownload,openUpdateStatusWindow,acknowledgePostUpdateReleaseNotes,skipUpdateVersion,quitAndInstallUpdate ignoreargs and Promise.resolve(undefined). Retain no permission/settingswrite/updaterbehavior.

Ordinary onX subscriptions listed channel catalogs: ipcRenderer.on(channel,handler), return()=>ipcRenderer.removeListener(channel,SAMEhandler) everydisposal. Handler drops first Electron event, forwards ONLYfirst payload argument tocallback; no callbackreceiver (normal bare callback), no payload clone/validation. onNewTab/onCloseActiveContextRequest/onNewTask/onOpenWorkspace/onOpenFeedbackDialog/onOpenTicketsPanel/onSettingsChanged noargcallbacks ignore all IPCargs. Permanent listeners independent of individual subscriptions.
onOpenWorkspacePath: addcallback to Set BEFORE drain. While pending arraylength>0 removehead, truthyhead->callback(head), falseyhead dropped. Callbackthrow propagates, registrationremains and remainingqueue preserved. Return ()=>Set.delete(callback) runtimeboolean (publictypedvoid); duplicatecallback registration sharesoneSetentry, both disposers delete sameentry. Live delivery noqueuewhencallbackexists.
getWindowControlsOverlayMetrics returns cachedmetrics??readcurrentmetrics (webFrame zoomread &existingmetricformula). onWindowControlsOverlayChanged: immediately callback(cached??readcurrent), THENipc on. If immediatecallbackthrows no IPCregistration. Laterhandlercallback(payload) direct and permanentlisteneralreadyupdated cache. Return removesexacthandler.
getDesktopZoomLevel async awaitinvoke GetDesktopZoomLevel; finite state?.zoomLevel updatescachedclampedlevel;return{zoomLevel:cached}. Rejectrawcause unchanged, invalidstatekeepscache.
onDesktopZoomLevelChanged: call callback({zoomLevel:cached}) synchronously BEFORE ipc.on. Handler reads state.zoomLevel; nonfinite=>return;finite updatescachedclamp thencallbackNEW{zoomLevel:cached}. Immediatethrow no registration. Disposerexacthandler.

Authority/message ports:
Internal.ServicePort listener: destructure first event.ports, retained databaseStartupPortPayloadSchema.safeParse(payload) ALWAYS evennoport. If firstporttruthy &parsed.success postwindow.postMessage({type:Internal.ServicePort,...parsed.data},"*",[firstport]); elsefirstport?.close(). No handlingextra ports, catches/newvalidation.
Internal.ScopedServicePort listener: firstevent.ports; iftruthy post{type:ScopedServicePort,attachmentId:payload.attachmentId,sessionId:payload.sessionId,target:payload.target},"*",[port]. Includeundefinedfields; no schema/no newvalidation/closewhenabsent. No raw Electron event/IPC exposed to page.
ReadyACK windowmessage: accept ONLY event.source===window, typeof event.data==="object" &&nonnull (arrays canqualify), payload.type===Internal.ScopedServicePortReady, attachmentId &sessionId typeofstring and truthy (whitespaceaccepted). Then sendthatInternalchannel,{attachmentId,sessionId} ONLY. Ignore foreignsender/otherchannels/malformed fields; no newguard/retries/generationstate.
TaskNotificationSound IPC ignoresargs, postwindow.postMessage(Internal.TaskNotificationSound,"*").
DatabaseStartupState safeParse(raw),success=>post{type:Internal.DatabaseStartupState,state:parsed.data},"*", no transfer; invaliddrop.
StartupControl message onlysamewindow source ANDevent.data?.type===Internal.DatabaseStartupControl; then safeParse(event.data.control),success=>sendInternal.DatabaseStartupControl,parsed.data EXACTref. No additionalplain-objectguard or schema replacement. No listenerteardownnew cancellation because modulelifetimelisteners intentional.

## Body-free external correction

Incoming sound IPC listener MUST subscribe PlatformChannels.TaskNotificationSound; its outgoing postMessage remains InternalChannels.TaskNotificationSound. reportLocalTtftBatch/reportRendererActionTraceBatch/reportRendererHeapSample direct expression sends must return the exact ipcRenderer.send result at runtime, even with public :void annotation. browserViewScreenshotSurfaceReady is a block send with NO return and must stay runtimeundefined. A :void type annotation does NOT erase runtime return identity. Initial synthetic index cases fail missing sentinels and missing sound post. Preserve all other public API/signatures/catalog/authority boundaries.
Initial whole draft frozen. Author ONE NEW WHOLE literal TypeScript file /tmp/knorvia-preload-index-correction-1.ts; no predecessor/draft/source/tests reads or transforms, only this packet/two instructions; SHA-only afterward. Choose private design freely.
