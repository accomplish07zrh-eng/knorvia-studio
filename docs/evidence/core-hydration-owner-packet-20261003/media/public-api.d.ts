import type { FilePart, ModelMessageContentBlock, ToolArtifactStorePort } from "@knorvia/contracts";
export declare function filePartToContentBlock(part: FilePart, artifactStore: ToolArtifactStorePort | undefined): Promise<ModelMessageContentBlock>;
export declare function projectPersistedToolMediaContent(value: unknown, attachmentBlocks: ModelMessageContentBlock[]): ModelMessageContentBlock[] | undefined;
