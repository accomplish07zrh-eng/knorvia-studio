import type { SessionId, ToolArtifactStorePort, TraceContext, TurnAttachment, TurnId } from "../deps.js";
type PersistedAttachmentResource = {
    metadata: {
        artifactUri?: string;
        recoverability: "provider_ready";
        storageKind: "artifact" | "inline";
    };
    url: string;
};
type InlineAttachmentContent = {
    artifactUri?: string;
    dataUrl: string;
};
export declare function persistAttachmentDataUrl(dataUrl: string, index: number, mediaType: string, options: {
    abortSignal?: AbortSignal;
    artifactStore?: ToolArtifactStorePort;
    existingArtifactUri?: string;
    sessionId?: SessionId;
    traceContext: TraceContext;
    turnId?: TurnId;
}): Promise<PersistedAttachmentResource>;
export declare function readInlineAttachmentContent(attachment: TurnAttachment, options: {
    artifactStore?: ToolArtifactStorePort;
    traceContext: TraceContext;
}): Promise<InlineAttachmentContent | undefined>;
export declare function safeAttachmentOriginalRef(attachment: TurnAttachment): string | undefined;
export {};
