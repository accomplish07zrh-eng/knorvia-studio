interface RemoteWorkspaceSessionContext {
    workspacePath: string;
    workspaceIdentity?: string;
}
interface PendingConnect {
    requestId: string;
    webContentsId: number;
    win: BrowserWindow;
    remoteUsageTelemetryEligible: boolean;
    resolve: (sessionId: string) => void;
    reject: (error: Error) => void;
}
interface RemoteAttachmentRoute {
    webContentsId: number;
    descriptor: WindowHostRemoteWorkspaceDescriptor;
    rendererAttachmentId?: string;
    pendingRendererAttachment?: {
        attachmentId: string;
        previousAttachmentId?: string;
        reason: string;
        timeout: NodeJS.Timeout;
        resolve: () => void;
        reject: (error: Error) => void;
    };
    attachmentState: "attachable" | "closed";
    connectedAtMonotonicMs: number;
    connectFinalized: boolean;
    remoteUsageTelemetryEligible: boolean;
}
