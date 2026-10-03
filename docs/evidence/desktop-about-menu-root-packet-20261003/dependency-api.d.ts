// Selected original public ports/types only, opaque implementations; not standalone semantic closure.
// Original public owner: packages/desktop/src/main/aboutWindow.ts
interface CustomAboutDialogHtmlInput {
    applicationName: string;
    iconDataUrl: string;
    appVersion: string;
    copyright: string;
    optimizationLine: string;
    versionLabel: string;
    okButtonLabel: string;
}
export declare function createCustomAboutDialogHtml(input: CustomAboutDialogHtmlInput): string;
// Original public owner: packages/desktop/src/main/desktopZoom.ts
export declare const DESKTOP_ZOOM_MIN_LEVEL = -3;
export declare const DESKTOP_ZOOM_MAX_LEVEL = 5;
export declare function clampDesktopZoomLevel(level: number): number;
// Original public owner: packages/desktop/src/main/desktopCommandHandlers.ts
import { BrowserWindow } from "electron";
import { type AppSettings, type DesktopCommandId, type Locale } from "@knorvia/shared";
export declare const HELP_TOGGLE_DEV_TOOLS_MENU_ID = "help.toggle-dev-tools";
export declare const HELP_TOGGLE_KNORVIA_STDIO_TAP_MENU_ID = "help.toggle-stdio-tap";
// Original public owner: packages/shared/src/desktopMenu.ts
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
export type DesktopMenuMessageId = (typeof desktopMenuMessageIds)[keyof typeof desktopMenuMessageIds];
export declare function getDesktopMenuMessage(locale: Locale, id: DesktopMenuMessageId): string;
// Original public owner: packages/shared/src/platform.ts
import type { DockerConnectOptions, RemoteTarget, SSHConnectOptions, WSLConnectOptions } from "./remoteTarget.js";
import type { LoadCliMcpFromUserDirectoryRequest, LoadCliMcpFromUserDirectoryResult, MigrateLegacyCommonMcpRequest, MigrateLegacyCommonMcpResult, SaveCliMcpToUserDirectoryRequest } from "./mcp.js";
import type { AppSettings, Locale } from "./protocol.js";
import type { ArmsCustomEventPayload, RendererTelemetryEventPayload } from "./telemetry.js";
import type { RendererActionTraceBatchV1, RendererActionTraceConfigV1 } from "./rendererActionTrace.js";
import type { RendererHeapSample } from "./validation.js";
import type { CuaAccessibilitySettingsResult, OpenCuaPermissionOnboardingOptions, PrepareCuaHelperPermissionDragResult } from "./cuaAccessibilitySettings.js";
import type { BrowserViewportSize } from "./browser-use/command-metadata.js";
import type { PostUpdateReleaseNotesPayload, UpdateCheckResultPayload, UpdateStatePayload } from "./update.js";
export interface KnorviaStdioTapDevState {
    enabled: boolean;
    visible: boolean;
    logDir: string;
    statePath: string;
}
export declare const DesktopCommandIds: {
    readonly NewTask: "newTask";
    readonly OpenWorkspace: "openWorkspace";
    readonly CloseActiveContext: "closeActiveContext";
    readonly CloseWindow: "closeWindow";
    readonly MinimizeWindow: "minimizeWindow";
    readonly ToggleMaximizeWindow: "toggleMaximizeWindow";
    readonly ToggleFullScreen: "toggleFullScreen";
    readonly ResetWindowSize: "resetWindowSize";
    readonly ResetZoom: "resetZoom";
    readonly ZoomIn: "zoomIn";
    readonly ZoomOut: "zoomOut";
    readonly ShowAbout: "showAbout";
    readonly OpenChangelog: "openChangelog";
    readonly CheckForUpdates: "checkForUpdates";
    readonly RelaunchApp: "relaunchApp";
    readonly OpenFeedback: "openFeedback";
    readonly OpenCommunity: "openCommunity";
    readonly ExportLogs: "exportLogs";
    readonly ToggleDevTools: "toggleDevTools";
    readonly OpenResourceManager: "openResourceManager";
    readonly ToggleKnorviaStdioTapDevProxy: "toggleKnorviaStdioTapDevProxy";
    readonly SetKnorviaEndpointProduction: "setKnorviaEndpointProduction";
    readonly SetKnorviaEndpointTest: "setKnorviaEndpointTest";
    readonly SetKnorviaEndpointCustom: "setKnorviaEndpointCustom";
    readonly ResetKnorviaEndpoint: "resetKnorviaEndpoint";
    readonly ClearAllData: "clearAllData";
    readonly ClearCodingPlanWebviewStorage: "clearCodingPlanWebviewStorage";
    readonly GetCuaOsSupport: "getCuaOsSupport";
};
export type DesktopCommandId = (typeof DesktopCommandIds)[keyof typeof DesktopCommandIds];
// Original public owner: packages/shared/src/shortcutCommands.ts
export declare function isValidShortcutBinding(binding: string): boolean;
// Original public owner: packages/services/src/agent/stdioTapDevConfig.ts
import type { KnorviaStdioTapDevState } from "@knorvia/shared";
export declare function readKnorviaStdioTapDevState(): KnorviaStdioTapDevState;
// Original public owner: packages/shared/src/version.ts
export declare const KNORVIA_VERSION: string;
export declare const KNORVIA_COMMIT: string;
export declare const KNORVIA_BUILD_TIME: string;
// Original public owner: packages/shared/src/protocol.ts
import type { RemoteAssetInstallMode } from "./remoteAssetInstallMode.js";
import type { RemoteResourcePackageSelection } from "./remoteResourcePackages.js";
import type { ProviderFamilyDomain } from "./model-provider-family.js";
import type { ProviderFamilyConnectionSelectionSettings } from "./provider-family-connection-selection.js";
import type { WorkspacePurpose } from "./workspacePurpose.js";
import type { EmbeddedBrowserViewportPreference } from "./browser-use/command-metadata.js";
export type Locale = "zh-CN" | "en-US";
export declare const DEFAULT_LOCALE: Locale;
// Original public owner: packages/shared/src/env.ts
import type { KnorviaRuntimeEnv } from "./runtimeEnv.js";
export declare const KNORVIA_ENV: KnorviaEnv;
