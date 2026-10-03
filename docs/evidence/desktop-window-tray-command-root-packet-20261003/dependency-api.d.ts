// Distinct retained module types only, no dependency implementation.
// Original type owner: packages/desktop/src/main/startupWorkspace.ts
export interface StartupWindowBootstrap {
    restoreSession?: boolean;
    initialWorkspacePath?: string;
    initialWorkspacePurpose?: WorkspacePurpose;
    unavailableWorkspacePath?: string;
    agentWarmupTargets?: StartupWorkspaceWarmupTarget[];
}
// Original type owner: packages/services/src/agent/stdioTapDevConfig.ts
export declare function readKnorviaStdioTapDevState(): KnorviaStdioTapDevState;
export declare function setKnorviaStdioTapDevEnabled(enabled: boolean): KnorviaStdioTapDevState;
// Original type owner: packages/desktop/src/main/about.ts
export declare function showAboutDialog(parentWindow?: BrowserWindow, locale?: Locale): Promise<MessageBoxReturnValue>;
// Original type owner: packages/desktop/src/main/exportLogs.ts
export declare function exportLogs(dependencies?: ExportLogsDependencies): Promise<{
    success: boolean;
    path?: string;
    error?: string;
}>;
// Original type owner: packages/desktop/src/main/resourceManagerWindow.ts
export declare function openResourceManager(): void;
// Original type owner: packages/desktop/src/main/cuaOsSupport.ts
export declare function resolveCuaOsSupport(platform?: any, darwinRelease?: any): CuaOsSupport;
// Original type owner: packages/desktop/src/main/desktopWindowButtonPosition.ts
export declare function syncWindowControlsOverlayForZoomLevel(targetWindow: BrowserWindow | null | undefined, zoomLevel: number): void;
// Original type owner: packages/desktop/src/main/desktopZoom.ts
export declare function clampDesktopZoomLevel(level: number): any;
export declare function resolveDesktopZoomFactorForLevel(level: number): any;
export declare function resolveDesktopZoomLevelFromFactor(zoomFactor: number): any;
export declare const DEFAULT_DESKTOP_WINDOW_WIDTH: 1200;
export declare const DEFAULT_DESKTOP_WINDOW_HEIGHT: 800;
export type ElectronNamespace = typeof import("electron");
export type WindowStatic = Pick<ElectronNamespace["BrowserWindow"], "getFocusedWindow" | "getAllWindows">;
export type ApplicationPort = Pick<ElectronNamespace["app"], "isPackaged" | "relaunch" | "exit">;
export type DialogPort = Pick<ElectronNamespace["dialog"], "showMessageBox">;
export type TrayConstructor = ElectronNamespace["Tray"];
export type MenuPort = Pick<ElectronNamespace["Menu"], "buildFromTemplate">;
export type RemovePathPort = typeof import("node:fs/promises").rm;
export declare const join: typeof import("node:path").join;
// Process.platform/resourcesPath and import.meta.dirname are original platform properties; no environment probe performed.
// Original type owner: packages/shared/src/desktopMenu.ts
export type DesktopMenuMessageId = (typeof desktopMenuMessageIds)[keyof typeof desktopMenuMessageIds];
export declare function getDesktopMenuMessage(locale: Locale, id: DesktopMenuMessageId): string;
// Original type owner: packages/shared/src/platform.ts
export type DesktopCommandId = (typeof DesktopCommandIds)[keyof typeof DesktopCommandIds];
export type CuaOsSupport = {
    kind: "supported";
} | {
    kind: "macos-below-minimum";
    minimumMacOs: string;
    currentMacOs: string;
} | {
    kind: "not-applicable";
};
// Original type owner: packages/shared/src/protocol.ts
export type Locale = "zh-CN" | "en-US";
export declare const DesktopCommandIds: typeof import("@knorvia/shared").DesktopCommandIds;
export declare const desktopMenuMessageIds: typeof import("@knorvia/shared").desktopMenuMessageIds;
export declare const PlatformChannels: typeof import("@knorvia/shared").PlatformChannels;
export type CommandSettings = Pick<import("@knorvia/shared").AppSettings, "knorviaEndpointOrigin" | "desktopZoomLevel">;
