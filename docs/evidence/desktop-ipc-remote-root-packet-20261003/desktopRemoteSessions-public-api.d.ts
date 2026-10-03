import { BrowserWindow } from "electron";
import type { MessagePortMain, UtilityProcess as ElectronUtilityProcess } from "electron";
import { type RemoteTarget } from "@knorvia/shared";
import type { RemoteConnectionStats, RemoteDisconnectReason, RemoteGaugeTransition } from "./desktopRemoteUsageArmsTelemetry.js";
import type { RemoteAssetDirs } from "./desktopRuntimeEnv.js";
interface RemoteWorkspaceSessionContext {
    workspacePath: string;
    workspaceIdentity?: string;
}
export declare function createRemoteWorkspaceSessionManager(options: {
    logger: {
        info: (...args: unknown[]) => void;
        warn: (...args: unknown[]) => void;
        error: (...args: unknown[]) => void;
    };
    windowHostProcessMap: Map<number, ElectronUtilityProcess>;
    resolveRemoteAssetDirs: () => RemoteAssetDirs;
    resolveWslTarget?: (target: Extract<RemoteTarget, {
        kind: "wsl";
    }>) => Promise<Extract<RemoteTarget, {
        kind: "wsl";
    }>>;
    createMessageChannel?: () => {
        port1: MessagePortMain;
        port2: MessagePortMain;
    };
    rendererAttachmentReadyTimeoutMs?: number;
    reportRemoteConnectionStateChanged?: (params: {
        rendererId: number;
        remoteKind: RemoteTarget["kind"];
        transition: Exclude<RemoteGaugeTransition, "none">;
    }) => void;
    reportRemoteDisconnect?: (params: {
        rendererId: number;
        remoteKind: RemoteTarget["kind"];
        disconnectReason: RemoteDisconnectReason;
        durationMs: number;
    }) => void;
    monotonicNowMs?: () => number;
}): {
    createRemoteWorkspaceSession: (win: BrowserWindow, target: RemoteTarget, requestId?: string, context?: RemoteWorkspaceSessionContext, lifecycle?: {
        remoteUsageTelemetryEligible?: boolean;
    }) => Promise<string>;
    attachRemoteWorkspaceSessionHost: (params: {
        windowId: number;
        remoteSessionId: string;
        workspacePath: string;
        workspaceIdentity: string;
        workspaceKey: string;
        clientMode: "web-remote-replayable";
    }) => {
        process: ElectronUtilityProcess;
        port: MessagePortMain;
        remoteKind: RemoteTarget["kind"];
    };
    bindRemoteWorkspaceSessionContext: (sessionId: string, context: RemoteWorkspaceSessionContext, expectedWebContentsId?: number) => Promise<void>;
    confirmRendererAttachmentReady: (webContentsId: number, payload: {
        sessionId: string;
        attachmentId: string;
    }) => void;
    reattachRemoteWorkspaceSessionsForWindow: (win: BrowserWindow, reason: string) => void;
    getRemoteConnectionStats: () => RemoteConnectionStats;
    disposeRemoteWorkspaceSession: (sessionId: string, _reason?: string) => void;
    disposeRemoteWorkspaceSessionsForWindow: (webContentsId: number) => void;
    disposeAllAndWaitForAppShutdown: (_reason: string) => any;
    cancelPendingRemoteWorkspaceSessionsForWindow: (webContentsId: number, _reason: string, requestId?: string) => void;
    handleWorkspaceRunningTaskCountChanged: () => void;
};
export {};
