// Original selected public types, not standalone compilation.
// Original owner: apps/cli/packages/contracts/src/tools/read.ts
export interface ReadVideoOutput {
    type: "video";
    base64: string;
    mimeType: "video/mp4" | "video/quicktime" | "video/webm" | "video/x-matroska" | "video/x-m4v" | "video/x-msvideo";
    originalSize: number;
}
