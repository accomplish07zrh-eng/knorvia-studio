// Body-free selected original declarations; not standalone compilation units.

// Original owner packages/desktop/src/main/desktopDeepLinkUrl.ts
export declare function isWorkspaceOpenUrl(parsedUrl: URL): boolean;
export declare function extractWorkspaceOpenPath(parsedUrl: URL): string | null;

// Original owner packages/shared/src/workspaceSessionRestore.ts
export declare function resolveStartupLocalWorkspaceSessionIndex(persistedSessions: readonly PersistedWorkspaceSessionEntry[], lastActiveTabIndex: number | undefined): number | null;

// Original owner packages/shared/src/validation.ts
export declare function formatZodError(error: z.ZodError): string;

// Original owner packages/shared/src/workspacePurpose.ts
export type WorkspacePurpose = "project" | "conversation";

// Original owner packages/shared/src/protocol.ts
export type Locale = "zh-CN" | "en-US";
export interface LocalWorkspaceSessionEntry {
    kind: "local";
    workspacePath: string;
    workspacePurpose?: WorkspacePurpose;
}
export interface RemoteWorkspaceSessionEntry extends RemoteWorkspaceSessionSnapshot {
    kind: "remote";
}
export interface RemoteWorkspaceSessionSnapshot {
    workspacePath: string;
    localWorkspacePath?: string;
    workspaceIdentity?: string;
    target: RemoteTargetSnapshot;
    lastOpenedAt: number;
    lastConnectionStatus: "connected" | "failed";
    lastConnectionError?: string;
}
export type PersistedWorkspaceSessionEntry = LocalWorkspaceSessionEntry | RemoteWorkspaceSessionEntry;
export type RemoteTargetSnapshot = SSHRemoteTargetSnapshot | WSLRemoteTargetSnapshot | DockerRemoteTargetSnapshot;
export interface SSHRemoteTargetSnapshot {
    kind: "ssh";
    host: string;
    port?: number;
    username: string;
    sshConfigAlias?: string;
    privateKeyPath?: string;
    assetInstallMode?: RemoteAssetInstallMode;
    resourcePackages?: RemoteResourcePackageSelection;
    passwordCredentialKey?: string;
    privateKeyPassphraseCredentialKey?: string;
}
export interface WSLRemoteTargetSnapshot {
    kind: "wsl";
    distro?: string;
    user?: string;
}
export interface DockerRemoteTargetSnapshot {
    kind: "docker";
    container: string;
}

// Authoritative opaque modules, preserving imports and overloads rather than replacement implementations.
import type { RemoteAssetInstallMode } from "@knorvia/shared";
import type { RemoteResourcePackageSelection } from "@knorvia/shared";
import type { z } from "zod";
export declare const appSettingsSchema: typeof import("@knorvia/shared").appSettingsSchema;
export type StartupSettings = ReturnType<typeof appSettingsSchema.parse>;
export type StartupSettingsUsedFields = Pick<StartupSettings, "recentProjects" | "lastWorkspaceSession" | "lastActiveTabIndex">;
export declare const PlatformChannels: typeof import("@knorvia/shared").PlatformChannels;
export declare const desktopProfile: typeof import("../../../packages/desktop/src/main/desktopEarlyDataBaseDirBootstrap.js").desktopProfile;
export declare const app: typeof import("electron").app;
export declare const BrowserWindow: typeof import("electron").BrowserWindow;
export declare const dialog: typeof import("electron").dialog;
export type BrowserWindow = import("electron").BrowserWindow;
export type WebContents = import("electron").WebContents;
export declare const constants: typeof import("node:fs").constants;
export declare const statSync: typeof import("node:fs").statSync;
export declare const access: typeof import("node:fs/promises").access;
export declare const mkdir: typeof import("node:fs/promises").mkdir;
export declare const readFile: typeof import("node:fs/promises").readFile;
export declare const stat: typeof import("node:fs/promises").stat;
export declare const isAbsolute: typeof import("node:path").isAbsolute;
export declare const resolve: typeof import("node:path").resolve;
export declare const process: typeof globalThis.process;
