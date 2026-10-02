import type { FilePartSource, TurnAttachment } from "../deps.js";
import type { ResolvedTurnAttachment } from "../types.js";
export declare function resolvedPlaceholderAttachment(attachment: TurnAttachment, placeholder: string, errorCode: string, options?: {
    filename?: string;
    mime?: string;
    sizeBytes?: number;
    source?: FilePartSource;
}): ResolvedTurnAttachment;
