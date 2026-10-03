import { BrowserWindow } from "electron";
import type { DesktopTitleBarTheme, Locale } from "@knorvia/shared";
import { type WindowBootstrapOptions } from "./desktopHostProcess.js";
import { type DesktopWindowSize } from "./desktopWindowSize.js";
export declare function applyAppIcon(iconPath: string): void;
export declare function getWindowOverlayTheme(): Exclude<DesktopTitleBarTheme, "system">;
export declare function applyWindowsTitleBarTheme(targetWindow: BrowserWindow, theme: DesktopTitleBarTheme): void;
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
