// Distinct unchanged collaborator surfaces; no dependency implementation.
// Original owner: apps/cli/packages/core/src/tool/handlers/read-text.ts
interface ReadTextFileForModelOptions {
    abortSignal?: AbortSignal;
    allowPartialFallback?: boolean;
    filePath: string;
    fileSystemPort: FileSystemPort;
    limit?: number;
    onRead?: (read: FileSystemReadTextRangeResult) => void;
    offset?: number;
    trace?: TraceContext;
}
export declare function readTextFileForModel({ abortSignal, allowPartialFallback, filePath, fileSystemPort, limit, onRead, offset, trace, }: ReadTextFileForModelOptions): Promise<ReadTextOutput>;
// Original owner: apps/cli/packages/core/src/runtime/helpers/attachment-media-resolver.ts
interface InlineMediaResolverOptions {
    abortSignal?: AbortSignal;
    artifactStore?: ToolArtifactStorePort;
    existingArtifactUri?: string;
    imageProcessorPort?: ImageProcessorPort;
    sessionId?: SessionId;
    traceContext: TraceContext;
    turnId?: TurnId;
}
interface LocalMediaResolverOptions extends Omit<InlineMediaResolverOptions, "existingArtifactUri"> {
    fileSystemPort: FileSystemPort;
    workingDirectory: string;
}
export declare function resolveInlineMediaAttachment(attachment: TurnAttachment, index: number, parsedMediaType: string | undefined, options: InlineMediaResolverOptions): Promise<ResolvedTurnAttachment | undefined>;
export declare function resolveLocalMediaAttachment(attachment: TurnAttachment, index: number, options: LocalMediaResolverOptions): Promise<ResolvedTurnAttachment>;
// Original owner: apps/cli/packages/core/src/runtime/helpers/attachment-placeholder.ts
export declare function resolvedPlaceholderAttachment(attachment: TurnAttachment, placeholder: string, errorCode: string, options?: {
    filename?: string;
    mime?: string;
    sizeBytes?: number;
    source?: FilePartSource;
}): ResolvedTurnAttachment;
// Original owner: apps/cli/packages/core/src/runtime/helpers/attachment-path-reference.ts
type PathReferenceReason = "binary_file" | "deferred_clipboard_text" | "image_too_large" | "pdf_too_large" | "text_too_large" | "video_too_large";
export declare function resolvedInlineTextAttachment(attachment: TurnAttachment, index: number): ResolvedTurnAttachment;
export declare function resolvedPathReferenceAttachment(attachment: TurnAttachment, placeholder: string, options: {
    filename?: string;
    mime?: string;
    reason: PathReferenceReason;
    sizeBytes?: number;
    source?: FilePartSource;
}): ResolvedTurnAttachment;
export declare function isDataOrArtifactUrl(content: string): boolean;
export declare function isTextLikePath(path: string): boolean;
export declare function inferAttachmentMimeFromPath(path: string): string;
// Original owner: apps/cli/packages/core/src/runtime/helpers/attachment-data-url.ts
export declare function parseDataUrlHeader(dataUrl: string): {
    mediaType: string;
} | undefined;
// Original owner: apps/cli/packages/core/src/runtime/helpers/attachment-image.ts
export declare function prepareImageDataUrl(dataUrl: string, mediaType: string, options: {
    abortSignal?: AbortSignal;
    imageProcessorPort?: ImageProcessorPort;
    traceContext: TraceContext;
}): Promise<PreparedImageData | undefined>;
export declare function inferImageMimeFromPath(path: string): string;
// Original owner: apps/cli/packages/core/src/runtime/helpers/attachment-artifacts.ts
type InlineAttachmentContent = {
    artifactUri?: string;
    dataUrl: string;
};
export declare function readInlineAttachmentContent(attachment: TurnAttachment, options: {
    artifactStore?: ToolArtifactStorePort;
    traceContext: TraceContext;
}): Promise<InlineAttachmentContent | undefined>;
export declare const basename: typeof import("node:path").basename;
export declare const resolvePath: typeof import("node:path").resolve;
export declare const READ_DEFAULT_MAX_LINES: 2000;
export declare const READ_MAX_FILE_SIZE_BYTES: number; // 262144
