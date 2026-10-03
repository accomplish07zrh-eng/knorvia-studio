// Original type owner: apps/cli/packages/core/src/runtime/types.ts
export interface PreparedImageData {
    dataUrl: string;
    mediaType: string;
    metadata?: AttachmentStorageMetadata["image"];
}

// Original type owner: apps/cli/packages/contracts/src/interfaces/image-processor.port.ts
export interface ImageProcessorPort {
    resizeToFit(request: ImageResizeRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ImageResizeResult>;
    prepareForModel(request: ImagePrepareForModelRequest, options?: {
        signal?: AbortSignal;
    }): Promise<ImagePrepareForModelResult>;
}
export interface ImageResizeRequest {
    data: Uint8Array;
    mediaType: string;
    maxDimension: number;
    trace?: TraceContext;
}
export interface ImageResizeResult {
    data: Uint8Array;
    mediaType: string;
    originalWidth?: number;
    originalHeight?: number;
    width?: number;
    height?: number;
    resized: boolean;
}
export interface ImagePrepareForModelRequest extends ImageResizeRequest {
    maxBase64Bytes: number;
    maxRawBytes: number;
    maxTokens?: number;
    tokenToBase64CharRatio?: number;
}
export interface ImagePrepareForModelResult extends ImageResizeResult {
    compressed: boolean;
    originalSizeBytes: number;
    strategy: ImageCompressionStrategy;
    transformedSizeBytes: number;
}
export type TraceContext = import("@knorvia/contracts").TraceContext;
export type AttachmentStorageMetadata = import("@knorvia/contracts").AttachmentStorageMetadata;
export type ImageCompressionStrategy = import("@knorvia/contracts").ImageCompressionStrategy;
