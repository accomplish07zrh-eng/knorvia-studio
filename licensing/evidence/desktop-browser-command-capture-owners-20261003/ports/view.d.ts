export interface ControlledViewWebContents {
    loadURL(url: string): Promise<void>;
    getURL(): string;
    getTitle(): string;
    canGoBack(): boolean;
    canGoForward(): boolean;
    goBack(): void;
    goForward(): void;
    reload(): void;
    executeJavaScript(script: string): Promise<unknown>;
}
export interface ControlledViewCdp {
    send(method: string, params?: unknown, sessionId?: string): Promise<unknown>;
}
export interface ControlledView {
    webContents: ControlledViewWebContents;
    cdp: ControlledViewCdp;
    captureViewportScreenshot?: () => Promise<string | undefined>;
    normalizeScreenshotToCssPixels?: boolean;
    resizeScreenshotToCssPixels?: (base64Png: string, target: {
        height: number;
        width: number;
    }) => Promise<string | undefined> | string | undefined;
}
export interface BrowserPoint {
    cx: number;
    cy: number;
}
