export function isTransientScreenshotCaptureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("UnknownVizError");
}

interface ScreenshotTransientRetryContext {
  target: "owner" | "guest";
  windowId: number;
  webContentsId: number;
}

export class DesktopBrowserScreenshotTransientRetry {
  private startedAt: number | undefined;
  private attempts = 0;

  constructor(
    private readonly options: {
      delayMs?: number;
      budgetMs?: number;
      log?(message: string): void;
    } = {},
  ) {}

  retryDelayMs(): number {
    return this.options.delayMs ?? 100;
  }

  schedule(context: ScreenshotTransientRetryContext): boolean {
    this.startedAt ??= Date.now();
    this.attempts += 1;

    if (Date.now() - this.startedAt >= (this.options.budgetMs ?? 2000)) {
      this.options.log?.(
        "[browser-screenshot-activity] transient capture retry budget exhausted target=" +
          context.target +
          " windowId=" +
          context.windowId +
          " webContentsId=" +
          context.webContentsId +
          " attempts=" +
          this.attempts,
      );
      return false;
    }

    this.options.log?.(
      "[browser-screenshot-activity] transient capture retry scheduled target=" +
        context.target +
        " windowId=" +
        context.windowId +
        " webContentsId=" +
        context.webContentsId +
        " attempt=" +
        this.attempts +
        " delayMs=" +
        this.retryDelayMs(),
    );
    return true;
  }

  reset(): void {
    this.startedAt = undefined;
    this.attempts = 0;
  }
}
