// Qualified exact public shape; raw isolated declaration diagnostics retained separately.

// Public owner: packages/desktop/src/main/about.ts
import type { BrowserWindow, MessageBoxReturnValue } from "electron";
import { type Locale } from "@knorvia/shared";
interface DesktopBuildMetadata {
    appVersion?: string;
    buildCommitId?: string;
    buildTime?: string;
    electronBuilderVersion?: string;
}
interface AboutSnapshot {
    appVersion: string;
    buildCommitId: string;
    buildTime: string;
    environment: string;
    electronVersion: string;
    electronBuilderVersion: string;
    chromiumVersion: string;
    nodeVersion: string;
    v8Version: string;
    osType: string;
    osPlatform: string;
    osRelease: string;
    osVersion: string;
    osArch: string;
    hostname: string;
}
interface AboutSnapshotOptions {
    appVersion?: string;
    buildMetadata?: DesktopBuildMetadata | null;
    environment?: string;
    runtimeVersions?: Pick<NodeJS.ProcessVersions, "electron" | "chrome" | "node" | "v8">;
    osInfo?: {
        type: string;
        platform: string;
        release: string;
        version: string;
        arch: string;
        hostname: string;
    };
}
export declare function readBuildMetadata(filePath?: string): DesktopBuildMetadata | null;
export declare function createAboutSnapshot(options?: AboutSnapshotOptions): AboutSnapshot;
export declare function formatAboutDetail(snapshot: AboutSnapshot): string;
export declare function showAboutDialog(parentWindow?: BrowserWindow, locale?: Locale): Promise<MessageBoxReturnValue>;
export {};

// Public owner: packages/desktop/src/main/aboutWindow.ts
interface CustomAboutDialogHtmlInput {
    applicationName: string;
    iconDataUrl: string;
    appVersion: string;
    copyright: string;
    optimizationLine: string;
    versionLabel: string;
    okButtonLabel: string;
}
export declare function createCustomAboutDialogHtml(input: CustomAboutDialogHtmlInput): string;
export {};

// Public owner: packages/desktop/src/main/desktopApplicationMenu.ts
import { BrowserWindow } from "electron";
import { desktopMenuMessageIds, type DesktopCommandId, type Locale } from "@knorvia/shared";
export declare function getDesktopMenuLabel(locale: Locale, id: (typeof desktopMenuMessageIds)[keyof typeof desktopMenuMessageIds]): string;
export declare function resolveSystemApplicationLocale(): Locale;
export declare function updateKnorviaStdioTapDevMenuState(): void;
export declare function rebuildApplicationMenu(options: {
    currentApplicationLocale: Locale;
    endpointSelection?: "production" | "test" | "custom";
    executeDesktopCommand: (command: DesktopCommandId, senderWindow?: BrowserWindow | null) => Promise<unknown>;
    currentZoomLevel?: number;
    shortcutBindings?: Record<string, string[]>;
    disableShortcutAccelerators?: boolean;
}): void;
