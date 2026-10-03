export declare function isTransientScreenshotCaptureError(error: unknown): boolean;
interface ScreenshotTransientRetryContext {
    target: "owner" | "guest";
    windowId: number;
    webContentsId: number;
}
export declare class DesktopBrowserScreenshotTransientRetry {
    private readonly options;
    private startedAt;
    private attempts;
    constructor(options?: {
        delayMs?: number;
        budgetMs?: number;
        log?(message: string): void;
    });
    retryDelayMs(): number;
    schedule(context: ScreenshotTransientRetryContext): boolean;
    reset(): void;
}
export {};
