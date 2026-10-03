// Body-free collaborator/type fragments; original module ownership, not standalone compilation.
// Original type owner: apps/cli/packages/core/src/runtime/helpers/attachment-artifacts.ts
type PersistedAttachmentResource = {
    metadata: {
        artifactUri?: string;
        recoverability: "provider_ready";
        storageKind: "artifact" | "inline";
    };
    url: string;
};
export declare function persistAttachmentDataUrl(dataUrl: string, index: number, mediaType: string, options: {
    abortSignal?: AbortSignal;
    artifactStore?: ToolArtifactStorePort;
    existingArtifactUri?: string;
    sessionId?: SessionId;
    traceContext: TraceContext;
    turnId?: TurnId;
}): Promise<PersistedAttachmentResource>;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/attachment-placeholder.ts
export declare function resolvedPlaceholderAttachment(attachment: TurnAttachment, placeholder: string, errorCode: string, options?: {
    filename?: string;
    mime?: string;
    sizeBytes?: number;
    source?: FilePartSource;
}): ResolvedTurnAttachment;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/attachment-path-reference.ts
type PathReferenceReason = "binary_file" | "deferred_clipboard_text" | "image_too_large" | "pdf_too_large" | "text_too_large" | "video_too_large";
export declare function resolvedPathReferenceAttachment(attachment: TurnAttachment, placeholder: string, options: {
    filename?: string;
    mime?: string;
    reason: PathReferenceReason;
    sizeBytes?: number;
    source?: FilePartSource;
}): ResolvedTurnAttachment;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/attachment-image.ts
export declare function prepareImageDataUrl(dataUrl: string, mediaType: string, options: {
    abortSignal?: AbortSignal;
    imageProcessorPort?: ImageProcessorPort;
    traceContext: TraceContext;
}): Promise<PreparedImageData | undefined>;
export declare function inferImageMimeFromPath(path: string): string;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/attachment-video.ts
export declare function inferVideoMimeFromPath(path: string): VideoInputMimeType | undefined;
export declare function parseInlineVideoDataUrl(dataUrl: string): {
    mediaType: string;
    sizeBytes: number;
} | undefined;
// Original type owner: apps/cli/packages/core/src/runtime/helpers/attachment-pdf.ts
export declare function parseInlinePdfDataUrl(dataUrl: string): {
    mediaType: "application/pdf";
    sizeBytes: number;
    bytes: Buffer;
} | undefined;
export declare function isPdfBytes(bytes: Uint8Array): boolean;
export declare const basename:typeof import("node:path").basename;
export declare const resolvePath:typeof import("node:path").resolve;
export declare const isFileSystemPortError:typeof import("../deps.js").isFileSystemPortError;
export declare const VIDEO_INPUT_MAX_BYTES:number; // 31457280
export declare const PDF_INPUT_MAX_BYTES:number; // 20971520
export declare const INLINE_MEDIA_ATTACHMENT_MAX_BYTES:number; // 20971520
