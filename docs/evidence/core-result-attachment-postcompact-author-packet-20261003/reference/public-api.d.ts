import type { FilePartSource, TurnAttachment } from "../deps.js";
import type { ResolvedTurnAttachment } from "../types.js";
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
export {};
