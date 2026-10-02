import type { ModelInputMessage, ToolArtifactStorePort } from "../deps.js";
export declare function projectMessagesWithMediaAttachmentPaths(messages: ModelInputMessage[], artifactStore: ToolArtifactStorePort | undefined): Promise<ModelInputMessage[]>;
