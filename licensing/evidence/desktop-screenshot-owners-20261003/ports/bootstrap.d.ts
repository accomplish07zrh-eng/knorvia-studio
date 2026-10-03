export interface BrowserWindowForTransparentBootstrap {
    isDestroyed(): boolean;
    isVisible?(): boolean;
    isMinimized?(): boolean;
    isFocused?(): boolean;
    getOpacity?(): number;
    setOpacity?(opacity: number): void;
    showInactive?(): void;
    hide?(): void;
    setSkipTaskbar?(skip: boolean): void;
    on?(event: "focus", listener: () => void): void;
    removeListener?(event: "focus", listener: () => void): void;
}
export interface TransparentWindowBootstrap {
    release(): void;
}
/**
 * 为 macOS hide-close 后才创建的 guest 提供一次对用户不可见的窗口级 presentation。
 *
 * 返回 undefined 表示不需要 bootstrap，false 表示当前窗口无法安全 bootstrap。
 */
export function startBrowserScreenshotTransparentWindowBootstrap(options: {
    win: BrowserWindowForTransparentBootstrap;
    enabled: boolean;
    windowId: number;
    webContentsId: number;
    requestId: string;
    hideTaskbarDuringBootstrap?: boolean;
    log?(message: string): void;
}): TransparentWindowBootstrap | false | undefined;
export declare const TRANSPARENT_WINDOW_PRESENTATION_GRACE_MS = 100;
