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
