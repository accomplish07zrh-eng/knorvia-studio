// Original selected public types, not standalone compilation.
// Original owner: apps/cli/packages/core/src/runtime/types.ts
export interface ResolvedTurnAttachment {
    contentBlock: ModelMessageContentBlock;
    filename?: string;
    metadata: AttachmentStorageMetadata;
    mime: string;
    source?: FilePartSource;
    url: string;
}
// Original owner: apps/cli/packages/core/src/agent/turn-state.ts
export interface TurnAttachment {
    type: "file" | "image" | "video" | "pdf" | "url";
    path?: string;
    content?: string;
    sourceKind?: "clipboard-text";
    filename?: string;
    mimeType?: string;
    sizeBytes?: number;
}
// Original owner: apps/cli/packages/contracts/src/interfaces/session-store.port.ts
export type FilePartSource = {
    type: "file";
    path: string;
    text: {
        value: string;
        start: number;
        end: number;
    };
} | {
    type: "symbol";
    path: string;
    range: unknown;
    name: string;
    kind: number;
    text: {
        value: string;
        start: number;
        end: number;
    };
} | {
    type: "resource";
    clientName: string;
    uri: string;
    text: {
        value: string;
        start: number;
        end: number;
    };
};
export interface AttachmentStorageMetadata {
    sizeBytes?: number;
    sha256?: string;
    image?: {
        maxDimension?: number;
        originalWidth?: number;
        originalHeight?: number;
        width?: number;
        height?: number;
        resized?: boolean;
        transformedSizeBytes?: number;
    };
    storageKind?: "inline" | "artifact" | "local_ref" | "remote_ref" | "metadata_only";
    artifactUri?: string;
    originalUrl?: string;
    recoverability?: "provider_ready" | "rebuildable" | "preview_only" | "metadata_only" | "missing";
    preview?: {
        text?: string;
        truncated?: boolean;
        originalBytes?: number;
        startLine?: number;
        totalLines?: number;
        truncatedByTokenCap?: boolean;
        partialViewNotice?: string;
    };
    errorCode?: string;
}
export type ModelMessageContentBlock = import("@knorvia/contracts").ModelMessageContentBlock;
export type ArtifactUri = import("@knorvia/shared").ArtifactUri;
