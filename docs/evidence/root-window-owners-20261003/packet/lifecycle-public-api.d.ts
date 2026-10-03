import { BrowserWindow } from "electron";
import type { UtilityProcess as ElectronUtilityProcess } from "electron";
import { type Locale } from "@knorvia/shared";
import { createBrowserWindow } from "./desktopWindowChrome.js";
import type { HostInitMessage, WindowBootstrapOptions } from "./desktopHostProcess.js";
import type { StartupWorkspaceWarmupTarget } from "./startupWorkspace.js";
import { type DesktopWindowSize } from "./desktopWindowSize.js";
export declare function createWindow(options: {
    iconPath: string;
    preloadPath: string;
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
    };
    forceQuitRef: {
        current: boolean;
    };
    handleBeforeClose?: (win: BrowserWindow, label: string) => boolean;
    onUnloadCancelled?: () => void;
    windowHostProcessMap: Map<number, ElectronUtilityProcess>;
    spawnHostProcess: (win: BrowserWindow, label: string, initMessage: Omit<HostInitMessage, "knorviaBuiltinProviderConfigFilePath">) => ElectronUtilityProcess;
    disposeHostProcess: (child: ElectronUtilityProcess, label: string, forceKillDelayMs?: number) => void;
    disposeRemoteWorkspaceSessionsForWindow: (windowId: number, reason: string) => void;
    reattachRemoteWorkspaceSessionsForWindow: (win: BrowserWindow, reason: string) => void;
    bootstrap?: WindowBootstrapOptions;
    agentWarmupTargets?: readonly StartupWorkspaceWarmupTarget[];
    agentSpawnFallbackCwd: string;
    deviceMid: string;
    initialDesktopZoomLevel?: number;
    initialWindowSize?: DesktopWindowSize;
    currentApplicationLocale?: () => Locale;
    persistWindowSize?: (state: DesktopWindowSize) => Promise<void>;
    runtimeProcessEnvPatchPromise?: Promise<Record<string, string>>;
    runtimeProcessEnvFallbackPatch: Record<string, string>;
    runtimeProcessEnvWaitTimeoutMs?: number;
    awaitFirstHostSpawnDecision?: () => Promise<void>;
    onHostProcessReady?: (windowKey: number) => void;
    resolveBrowserViewOwner?: Parameters<typeof createBrowserWindow>[0]["resolveBrowserViewOwner"];
}): BrowserWindow;
export declare function showCurrentWindowFromDock(primaryWindowCoordinator: {
    ensurePrimaryWindow(reason: string): Promise<void>;
}): void;
export declare function focusWorkspaceInExistingWindow(path: string, windowWorkspaceMap: Map<number, Set<string>>, options?: {
    skipWindowId?: number;
}): {
    activated: boolean;
    winId?: number;
};
export declare function syncApplicationUnreadBadge(windowUnreadCountMap: Map<number, number>): void;
export declare function handleWindowUnreadCountSync(win: BrowserWindow | null, payload: unknown, windowUnreadCountMap: Map<number, number>, logger: {
    warn: (...args: unknown[]) => void;
}): boolean;
export declare function configureDockMenu(getLabel: () => string, onShowCurrentWindow: () => void): void;
export declare function handleDesktopWindowCloseRequest(options: {
    platform: NodeJS.Platform;
    forceQuit: boolean;
    explicitQuitRequested?: boolean;
    closeToTrayOnWindows?: boolean;
    isLastWindow: boolean;
    label: string;
    logger: {
        info: (...args: unknown[]) => void;
    };
    shouldConfirmQuit?: boolean;
    confirmQuit: () => boolean;
    requestQuit: () => void;
    hideWindow?: () => void;
}): boolean;
