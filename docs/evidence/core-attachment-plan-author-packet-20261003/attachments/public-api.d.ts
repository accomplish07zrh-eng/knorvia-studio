import type { FileSystemPort, ImageProcessorPort, SessionId, ToolArtifactStorePort, TraceContext, TurnAttachmentMeta, TurnState, TurnId } from "../deps.js";
import type { ResolvedTurnAttachment } from "../types.js";
type ResolveAttachmentOptions = {
    abortSignal?: AbortSignal;
    artifactStore?: ToolArtifactStorePort;
    fileSystemPort?: FileSystemPort;
    imageProcessorPort?: ImageProcessorPort;
    sessionId?: SessionId;
    traceContext: TraceContext;
    turnId?: TurnId;
    workingDirectory: string;
};
export declare function summarizeTurnAttachmentsForEvent(attachments: TurnState["attachments"]): TurnAttachmentMeta[] | undefined;
export declare function resolveTurnAttachments(attachments: TurnState["attachments"], options: ResolveAttachmentOptions): Promise<ResolvedTurnAttachment[]>;
export { parseDataUrlHeader } from "./attachment-data-url.js";
export { inferImageMimeFromPath, prepareImageDataUrl } from "./attachment-image.js";
