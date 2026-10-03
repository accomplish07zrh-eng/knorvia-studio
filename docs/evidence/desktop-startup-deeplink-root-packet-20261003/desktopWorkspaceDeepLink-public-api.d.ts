import { BrowserWindow, type WebContents } from "electron";
import { type Locale } from "@knorvia/shared";
export interface ExternalWorkspaceOpenDialogCopy {
    buttons: [string, string];
    title: string;
    message: string;
    detail: (path: string) => string;
}
export declare function isValidLocalWorkspaceDirectory(path: string): boolean;
export declare function isNetworkWorkspacePath(path: string): boolean;
export declare function resolveExternalWorkspaceOpenDialogCopy(locale: Locale): ExternalWorkspaceOpenDialogCopy;
export declare function confirmExternalWorkspaceOpen(path: string, logger: {
    warn: (...args: unknown[]) => void;
}, parentWindow: BrowserWindow | null, copy?: ExternalWorkspaceOpenDialogCopy): boolean;
export declare function handleOpenWorkspacePath(path: string, logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
}, options?: {
    allowWithoutReadyWindow?: boolean;
    resolveApplicationWindow?: () => BrowserWindow | null;
}): boolean;
export declare function handleDeepLink(url: string, logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
}, options?: {
    canOpenWorkspace?: (path: string) => boolean;
    onWorkspaceOpenBlocked?: (path: string) => void;
    resolveApplicationWindow?: () => BrowserWindow | null;
    confirmationCopy?: ExternalWorkspaceOpenDialogCopy;
}): boolean;
export declare function registerDeepLinkProtocol(logger: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
}, _options?: {
    iconPath?: string;
}): void;
export declare function deliverPendingDeepLink(contents: WebContents): void;
export declare function clearWorkspaceRoutesForWindow(id: number): void;
