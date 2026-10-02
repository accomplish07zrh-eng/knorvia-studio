// Source-grounded exact qualifications; raw isolated diagnostics remain recorded, no semantic compilation claim.
// screenshot: async function yields this shape or null, not the raw isolated unknown.
type QualifiedScreenshotResult = Promise<{
  dataBase64: string;
  filename: string;
  contentType: string;
  size: number;
} | null>;
// registerRemoteIpcHandlers already emits void despite inherited TS9007; keep explicit void.
type QualifiedRemoteIpcRegistrationResult = void;
// Manager's other method signatures/ordered object fields are exact in its public-api.d.ts.
// Its raw isolated disposeAllAndWaitForAppShutdown(_reason:string):any is specifically Promise<void>.
type QualifiedDisposeAllAndWaitForAppShutdown = (_reason: string) => Promise<void>;
// Explicit complete private return shape; no self-return-derived type.
type QualifiedRemoteSessionManager = {
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
    disposeAllAndWaitForAppShutdown: (_reason: string) => Promise<void>;
    cancelPendingRemoteWorkspaceSessionsForWindow: (webContentsId: number, _reason: string, requestId?: string) => void;
    handleWorkspaceRunningTaskCountChanged: () => void;
};
