// Selected body-free declarations. Original module types remain authoritative; not standalone compilation units.
// Original owner packages/desktop/src/main/desktopRemoteUsageArmsTelemetry.ts
export interface RemoteConnectionStats {
    activeSessionCount: number;
    activeTargetCount: number;
}
export type RemoteGaugeTransition = "connected" | "connection-closed" | "disposed" | "window-closed" | "host-exit" | "app-shutdown" | "none";
export type RemoteDisconnectReason = Exclude<RemoteGaugeTransition, "connected" | "none">;

// Original owner packages/desktop/src/main/desktopRuntimeEnv.ts
export type RemoteAssetDirs = Pick<ConnectOptions, "mockCdnDir" | "remoteCdnBaseUrl" | "remoteCdnBaseUrls" | "remoteCacheDir">;

// Original owner packages/desktop/src/main/desktopNotifications.ts
export declare function dispatchTaskNotification(options: {
    event: IpcMainEvent | IpcMainInvokeEvent;
    payload: unknown;
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
    };
}): boolean;

// Original owner packages/desktop/src/main/desktopWorkspaceDeepLink.ts
export declare function clearWorkspaceRoutesForWindow(id: number): void;
export declare function deliverPendingDeepLink(contents: WebContents): void;

// Original owner packages/shared/src/remoteTarget.ts
export type RemoteTarget = SSHConnectOptions | WSLConnectOptions | DockerConnectOptions;
export interface SSHConnectOptions {
    kind: "ssh";
    host: string;
    port?: number;
    username: string;
    sshConfigAlias?: string;
    password?: string;
    privateKeyPath?: string;
    privateKeyPassphrase?: string;
    assetInstallMode?: RemoteAssetInstallMode;
    resourcePackages?: RemoteResourcePackageSelection;
}
export interface WSLConnectOptions {
    kind: "wsl";
    distro?: string;
    user?: string;
}
export interface DockerConnectOptions {
    kind: "docker";
    container: string;
}

// Original owner packages/shared/src/errors.ts
export interface NormalizedUnknownError {
    message: string;
    code?: string;
}
export declare function normalizeUnknownError(error: unknown): NormalizedUnknownError;

// Original owner packages/shared/src/remoteUsageTelemetry.ts
export declare function buildRemoteWorkspaceConnectResultTelemetry(input: {
    result: RemoteUsageResult;
    remoteKind: RemoteUsageRemoteKind;
    connectTrigger: RemoteWorkspaceConnectTrigger;
    errorCategory?: RemoteUsageErrorCategory;
}): TelemetryEventPayload;
export declare function classifyRemoteUsageError(error: unknown): RemoteUsageErrorCategory;

// Original owner packages/shared/src/remote-workspace-identity.ts
export declare function buildRemoteWorkspaceIdentity(workspacePath: string, target: RemoteTarget): string;

// Original owner packages/shared/src/remoteSshHostKey.ts
type SshRemoteHostKeyTarget = SSHConnectOptions | Extract<RemoteTargetSnapshot, {
    kind: "ssh";
}>;
export declare function buildSshRemoteHostKey(target: SshRemoteHostKeyTarget): string;


// Exact authoritative dependencies/overloads, no substitute implementations.
import type { ConnectOptions } from "@knorvia/server/remote";
import type { RemoteAssetInstallMode, RemoteResourcePackageSelection, TelemetryEventPayload, RemoteUsageErrorCategory, RemoteUsageResult, RemoteUsageRemoteKind, RemoteWorkspaceConnectTrigger, RemoteTargetSnapshot } from "@knorvia/shared";
import type { BrowserWindow, MessagePortMain, UtilityProcess as ElectronUtilityProcess, IpcMainEvent, IpcMainInvokeEvent, WebContents } from "electron";
export declare const app: typeof import("electron").app;
export declare const BrowserWindow: typeof import("electron").BrowserWindow;
export declare const ipcMain: typeof import("electron").ipcMain;
export declare const shell: typeof import("electron").shell;
export declare const MessageChannelMain: typeof import("electron").MessageChannelMain;
export declare const execFile: typeof import("node:child_process").execFile;
export declare const realpath: typeof import("node:fs/promises").realpath;
export declare const normalize: typeof import("node:path").normalize;
export declare const randomUUID: typeof import("node:crypto").randomUUID;
export declare const remoteTargetSchema: typeof import("@knorvia/shared").remoteTargetSchema;
export declare const hostResponseMessageSchema: typeof import("@knorvia/shared").hostResponseMessageSchema;
export type WindowHostRemoteWorkspaceDescriptor = import("@knorvia/shared").WindowHostRemoteWorkspaceDescriptor;
export declare const formatZodError: typeof import("@knorvia/shared").formatZodError;
export declare const InternalChannels: typeof import("@knorvia/shared").InternalChannels;
export declare const PlatformChannels: typeof import("@knorvia/shared").PlatformChannels;
export declare const HostMessageTypes: typeof import("@knorvia/shared").HostMessageTypes;
export declare const HostResponseTypes: typeof import("@knorvia/shared").HostResponseTypes;
