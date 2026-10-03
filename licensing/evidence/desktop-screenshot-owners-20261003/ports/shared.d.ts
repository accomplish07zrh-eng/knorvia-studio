export interface BrowserViewportSize {width: number; height: number;}
export declare const BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS = 3000;
/** Main 将一次能够定位真实 tab 的 browser-use 操作投递给其 origin renderer。 */
export interface BrowserViewOperationPayload {
    workspaceKey: string;
    remoteSessionId?: string;
    sessionId: string;
    tabId: string;
    browserId: string;
    browserGeneration: number;
    /** 当前模型命令会打开、激活或改变 Browser 布局，renderer 应重建 resize observation baseline。 */
    resetsResizeBaseline?: boolean;
}
/** 截图/录制握手对 renderer 预览比例的瞬时要求；缺失时沿用用户当前预览。 */
export type BrowserViewSurfaceScaleMode = "current" | "unscaled";
/** Main 请求 owner renderer 在截图前准备后台 guest 合成表面。 */
export interface BrowserViewScreenshotSurfacePreparePayload extends BrowserViewOperationPayload {
    requestId: string;
    webContentsId: number;
    viewport: BrowserViewportSize;
    /** 自然 viewport 不使用 metrics 的 guest 布局补偿；缺失时保持原仿真行为（含录制）。 */
    viewportMode?: "natural" | "emulated";
    /** `unscaled` 只在 lease 生命周期内强制真实 100% surface，不写回用户的 Fit/固定比例。 */
    surfaceScaleMode?: BrowserViewSurfaceScaleMode;
    /** Main 当前实际使用的 prepare 超时；旧 payload 缺失时 renderer 回退到共享默认值。 */
    timeoutMs?: number;
}
/** Owner renderer 确认目标 guest 的逻辑 viewport 与原生预览 surface 比例均已稳定。 */
export interface BrowserViewScreenshotSurfaceReadyPayload extends BrowserViewScreenshotSurfacePreparePayload {
    surfaceScale: number;
}
/** Main 通知 owner renderer 释放临时后台截图合成表面。 */
export type BrowserViewScreenshotSurfaceReleasePayload = Omit<BrowserViewScreenshotSurfacePreparePayload, "viewport" | "viewportMode" | "surfaceScaleMode" | "timeoutMs">;
