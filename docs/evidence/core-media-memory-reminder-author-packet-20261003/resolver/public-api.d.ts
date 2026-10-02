import type { FileSystemPort, ImageProcessorPort, SessionId, ToolArtifactStorePort, TraceContext, TurnAttachment, TurnId } from "../deps.js";
import type { ResolvedTurnAttachment } from "../types.js";
interface InlineMediaResolverOptions {
    abortSignal?: AbortSignal;
    artifactStore?: ToolArtifactStorePort;
    existingArtifactUri?: string;
    imageProcessorPort?: ImageProcessorPort;
    sessionId?: SessionId;
    traceContext: TraceContext;
    turnId?: TurnId;
}
interface LocalMediaResolverOptions extends Omit<InlineMediaResolverOptions, "existingArtifactUri"> {
    fileSystemPort: FileSystemPort;
    workingDirectory: string;
}
export declare function resolveInlineMediaAttachment(attachment: TurnAttachment, index: number, parsedMediaType: string | undefined, options: InlineMediaResolverOptions): Promise<ResolvedTurnAttachment | undefined>;
export declare function resolveLocalMediaAttachment(attachment: TurnAttachment, index: number, options: LocalMediaResolverOptions): Promise<ResolvedTurnAttachment>;
export {};
