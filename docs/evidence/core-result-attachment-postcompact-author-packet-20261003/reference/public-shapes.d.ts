// Original type owner: apps/cli/packages/core/src/runtime/types.ts
export interface ResolvedTurnAttachment {
    contentBlock: ModelMessageContentBlock;
    filename?: string;
    metadata: AttachmentStorageMetadata;
    mime: string;
    source?: FilePartSource;
    url: string;
}
export type TurnAttachment = import("@knorvia/contracts").TurnAttachment;
export type FilePartSource = import("@knorvia/contracts").FilePartSource;
export type ModelMessageContentBlock = import("@knorvia/contracts").ModelMessageContentBlock;
export type AttachmentStorageMetadata = import("@knorvia/contracts").AttachmentStorageMetadata;
