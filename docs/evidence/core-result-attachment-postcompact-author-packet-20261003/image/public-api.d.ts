import { type ImageProcessorPort, type TraceContext } from "../deps.js";
import type { PreparedImageData } from "../types.js";
export declare function prepareImageDataUrl(dataUrl: string, mediaType: string, options: {
    abortSignal?: AbortSignal;
    imageProcessorPort?: ImageProcessorPort;
    traceContext: TraceContext;
}): Promise<PreparedImageData | undefined>;
export declare function inferImageMimeFromPath(path: string): string;
