export declare const PDF_INPUT_MAX_BYTES: number;
export declare function parseInlinePdfDataUrl(dataUrl: string): {
    mediaType: "application/pdf";
    sizeBytes: number;
    bytes: Buffer;
} | undefined;
export declare function isPdfBytes(bytes: Uint8Array): boolean;
