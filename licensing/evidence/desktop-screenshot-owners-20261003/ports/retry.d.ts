export declare function isTransientScreenshotCaptureError(error: unknown): boolean;
export declare class DesktopBrowserScreenshotTransientRetry {
 constructor(options?: {delayMs?: number; budgetMs?: number; log?(message: string): void;});
 retryDelayMs(): number;
 schedule(context: {target: "owner" | "guest"; windowId: number; webContentsId: number;}): boolean;
 reset(): void;
}
