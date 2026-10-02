import type { ReadVideoOutput } from "@knorvia/contracts";
export type VideoInputMimeType = ReadVideoOutput["mimeType"];
export declare function inferVideoMimeFromPath(path: string): VideoInputMimeType | undefined;
export declare function parseInlineVideoDataUrl(dataUrl: string): {
    mediaType: string;
    sizeBytes: number;
} | undefined;
