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

export const TRANSPARENT_WINDOW_PRESENTATION_GRACE_MS = 100;

export function startBrowserScreenshotTransparentWindowBootstrap(options: {
    win: BrowserWindowForTransparentBootstrap;
    enabled: boolean;
    windowId: number;
    webContentsId: number;
    requestId: string;
    hideTaskbarDuringBootstrap?: boolean;
    log?(message: string): void;
}): TransparentWindowBootstrap | false | undefined {
    const win = options.win;
    if (!options.enabled || win.isVisible?.() !== false || win.isMinimized?.() === true) {
        return undefined;
    }

    if (
        !win.isFocused ||
        !win.getOpacity ||
        !win.setOpacity ||
        !win.showInactive ||
        !win.hide ||
        !win.on ||
        !win.removeListener ||
        (options.hideTaskbarDuringBootstrap && !win.setSkipTaskbar)
    ) {
        options.log?.(`[browser-screenshot-activity] transparent bootstrap unavailable windowId=${options.windowId} webContentsId=${options.webContentsId} requestId=${options.requestId}`);
        return false;
    }

    let originalOpacity: number;
    try {
        originalOpacity = win.getOpacity();
    } catch {
        options.log?.(`[browser-screenshot-activity] transparent bootstrap opacity read failed windowId=${options.windowId}`);
        return false;
    }

    let released = false;
    let taskbarHidden = false;
    const onFocus = () => release(true);

    function release(preserveVisibility: boolean): void {
        if (released) return;
        released = true;

        try {
            win.removeListener?.("focus", onFocus);
        } catch {
            options.log?.(`[browser-screenshot-activity] transparent bootstrap listener cleanup failed windowId=${options.windowId}`);
        }

        if (win.isDestroyed()) return;

        try {
            if (!preserveVisibility && !win.isFocused?.()) {
                win.hide?.();
            }
        } catch {
            options.log?.(`[browser-screenshot-activity] transparent bootstrap hide failed windowId=${options.windowId}`);
        } finally {
            if (!win.isDestroyed()) {
                try {
                    win.setOpacity?.(originalOpacity);
                } catch {
                    options.log?.(`[browser-screenshot-activity] transparent bootstrap opacity restore failed windowId=${options.windowId}`);
                }

                if (taskbarHidden) {
                    try {
                        win.setSkipTaskbar?.(false);
                    } catch {
                        options.log?.(`[browser-screenshot-activity] transparent bootstrap taskbar restore failed windowId=${options.windowId}`);
                    }
                }
            }
        }
    }

    try {
        if (options.hideTaskbarDuringBootstrap) {
            win.setSkipTaskbar?.(true);
            taskbarHidden = true;
        }
        win.setOpacity(0);
        win.on("focus", onFocus);
        win.showInactive();
    } catch {
        release(true);
        options.log?.(`[browser-screenshot-activity] transparent bootstrap failed windowId=${options.windowId} webContentsId=${options.webContentsId} requestId=${options.requestId}`);
        return false;
    }

    return { release: () => release(false) };
}
