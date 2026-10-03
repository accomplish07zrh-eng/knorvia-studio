import type {
  FileSystemPort,
  ImageProcessorPort,
  SessionId,
  ToolArtifactStorePort,
  TraceContext,
  TurnAttachment,
  TurnId,
} from "../deps.js";
import type { ResolvedTurnAttachment } from "../types.js";
import { resolveInlineMedia } from "./attachment-media-resolver/inline.js";
import { resolveLocalMedia } from "./attachment-media-resolver/local.js";

interface InlineMediaResolverOptions {
  abortSignal?: AbortSignal;
  artifactStore?: ToolArtifactStorePort;
  existingArtifactUri?: string;
  imageProcessorPort?: ImageProcessorPort;
  sessionId?: SessionId;
  traceContext: TraceContext;
  turnId?: TurnId;
}

interface LocalMediaResolverOptions extends Omit<
  InlineMediaResolverOptions,
  "existingArtifactUri"
> {
  fileSystemPort: FileSystemPort;
  workingDirectory: string;
}

export function resolveInlineMediaAttachment(
  attachment: TurnAttachment,
  index: number,
  parsedMediaType: string | undefined,
  options: InlineMediaResolverOptions,
): Promise<ResolvedTurnAttachment | undefined> {
  return resolveInlineMedia(attachment, index, parsedMediaType, options);
}

export function resolveLocalMediaAttachment(
  attachment: TurnAttachment,
  index: number,
  options: LocalMediaResolverOptions,
): Promise<ResolvedTurnAttachment> {
  return resolveLocalMedia(attachment, index, options);
}
