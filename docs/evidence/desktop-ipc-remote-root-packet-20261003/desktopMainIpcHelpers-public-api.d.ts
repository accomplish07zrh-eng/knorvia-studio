import type { BrowserWindow } from "electron";
type DesktopIpcLogger = {
    info?: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
};
export declare function openPathInDefaultApp(rawPath: string, logger: DesktopIpcLogger): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function openPathInFileManager(rawPath: string, logger: DesktopIpcLogger): Promise<{
    success: boolean;
    error?: string;
}>;
export declare function captureWindowScreenshot(senderWindow: BrowserWindow | null): unknown;
export {};
