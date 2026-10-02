import type { Logger, ModelInputFormat, ModelInputMessage, TraceContext } from "../deps.js";
export interface MediaCapabilityProjection {
    messages: ModelInputMessage[];
    omittedImageCount: number;
    omittedMediaCount: number;
    omittedPdfCount: number;
    omittedVideoCount: number;
    retainedMediaCount: number;
}
export declare function projectMessagesForInputFormat(messages: ModelInputMessage[], inputFormat: ModelInputFormat): MediaCapabilityProjection;
export declare function logMediaCapabilityProjection(logger: Logger | undefined, traceContext: TraceContext, projection: MediaCapabilityProjection, options: {
    event: string;
    message: string;
    model: string;
}): void;
