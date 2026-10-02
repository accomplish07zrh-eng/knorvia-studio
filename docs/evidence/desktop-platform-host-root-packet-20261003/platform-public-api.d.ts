import { BrowserWindow } from "electron";
import { type DesktopCommandId, type AppSettings, type ReleaseUpdateCheckResult, type Locale } from "@knorvia/shared";
import { type AttachBrowserGuest, type ReportBrowserScreenshotSurfaceReady, type UpdateBrowserGuestViewport, type BrowserViewResidencyIpcHandlers } from "./desktopBrowserViewIpc.js";
export declare function registerPlatformIpcHandlers(options: {
    checkReleaseUpdate?: () => Promise<ReleaseUpdateCheckResult>;
    fetchHelpConfig?: () => Promise<unknown>;
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
    };
    applyApplicationLocale: (locale: Locale) => Promise<void>;
    resolveSystemLocale: () => Locale;
    focusWorkspaceInExistingWindow: (path: string, extra?: {
        skipWindowId?: number;
    }) => {
        activated: boolean;
        winId?: number;
    };
    windowWorkspaceMap: Map<number, Set<string>>;
    windowUnreadCountMap: Map<number, number>;
    currentApplicationLocale: () => Locale;
    executeDesktopCommand: (command: DesktopCommandId, senderWindow?: BrowserWindow | null) => Promise<unknown>;
    syncActiveTaskSession: (windowId: number, sessionId: string | null) => void;
    syncTaskRealtimeWorkspaceKeys: (windowId: number, workspaceKeys: Iterable<string>) => void;
    getDesktopSessionActivity: () => {
        runningAgentSessionCount: number;
    };
    syncAppSettings: (patch: Partial<Pick<AppSettings, "closeToTrayOnWindows" | "keepAwakeWhileRunning" | "shortcutBindings">>) => void;
    setShortcutRecordingActive?: (active: boolean, ownerWebContentsId?: number | null) => void;
    deviceMid: string;
    attachBrowserGuest?: AttachBrowserGuest;
    updateBrowserGuestViewport?: UpdateBrowserGuestViewport;
    reportBrowserScreenshotSurfaceReady?: ReportBrowserScreenshotSurfaceReady;
    browserViewResidencyHandlers?: BrowserViewResidencyIpcHandlers;
}): void;
