import { isArtifactUri } from "@knorvia/shared";
import type {
  ModelInputMessage,
  ModelMessageContentBlock,
  ToolArtifactStorePort,
} from "../deps.js";

type MediaBlock = Extract<
  ModelMessageContentBlock,
  { type: "image" | "video" | "file" }
>;

function isPdf(block: ModelMessageContentBlock): boolean {
  return (
    block.type === "file" &&
    block.mediaType.split(";", 1)[0]?.trim().toLowerCase() === "application/pdf"
  );
}

function hasMediaSource(block: ModelMessageContentBlock): block is MediaBlock {
  if (block.type !== "image" && block.type !== "video" && !isPdf(block)) {
    return false;
  }
  const mediaBlock = block as MediaBlock;
  return (
    (mediaBlock.source?.kind === "inline" && isArtifactUri(mediaBlock.source!.uri)) ||
    (mediaBlock.source?.kind === "local_file" && Boolean(mediaBlock.source!.path))
  );
}

function materializationMessage(mediaKind: string, label: string | undefined): string {
  return `Unable to materialize ${mediaKind} attachment path: ${label}`;
}

async function resolveMediaPath(
  block: MediaBlock,
  artifactStore: ToolArtifactStorePort | undefined,
): Promise<string | undefined> {
  const source = block.source!;
  const mediaKind = isPdf(block) ? "pdf" : block.type;
  if (source.kind === "local_file" && source.path) {
    return source.path;
  }
  const uri = source.uri;
  if (!isArtifactUri(uri) || !artifactStore?.ensureMediaAttachmentPath) {
    throw new Error(
      materializationMessage(mediaKind, source.placeholder ?? uri ?? source.id),
      { cause: undefined },
    );
  }
  try {
    const result = await artifactStore.ensureMediaAttachmentPath({
      mediaType: source.mimeType ?? block.mediaType,
      uri,
    });
    if (result.status === "unsupported") {
      return undefined;
    }
    if (!result.path.trim()) {
      throw new Error("empty derived path");
    }
    return result.path;
  } catch (error) {
    throw new Error(materializationMessage(mediaKind, source.placeholder ?? uri), {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

function cloneBlock(block: ModelMessageContentBlock): ModelMessageContentBlock {
  if (block.type === "image" || block.type === "video" || block.type === "file") {
    return {
      ...block,
      source: block.source ? { ...block.source } : undefined,
    };
  }
  return { ...block };
}

function sourceAnnotation(block: MediaBlock, path: string): string {
  if (block.type === "image") {
    return `[Image: source: ${path}]`;
  }
  if (block.type === "video") {
    return `[Video: source: ${path}]`;
  }
  return `[PDF: source: ${path}]`;
}

export async function projectMessagesWithMediaAttachmentPaths(
  messages: ModelInputMessage[],
  artifactStore: ToolArtifactStorePort | undefined,
): Promise<ModelInputMessage[]> {
  let changed = false;
  const projected = await Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user" || !Array.isArray(message.content)) {
        return message;
      }
      const mediaBlocks = message.content.filter(hasMediaSource);
      if (mediaBlocks.length === 0) {
        return message;
      }
      const paths = await Promise.all(
        mediaBlocks.map((block) => resolveMediaPath(block, artifactStore)),
      );
      const pathsByBlock = new Map<MediaBlock, string>();
      mediaBlocks.forEach((block, index) => {
        const path = paths[index];
        if (path) {
          pathsByBlock.set(block, path);
        }
      });
      if (pathsByBlock.size === 0) {
        return message;
      }
      changed = true;
      const content = message.content.map((block) => {
        if (hasMediaSource(block) && pathsByBlock.has(block)) {
          return {
            ...block,
            source: { ...block.source!, path: pathsByBlock.get(block)! },
          };
        }
        return cloneBlock(block);
      });
      pathsByBlock.forEach((path, block) => {
        content.push({ type: "text", text: sourceAnnotation(block, path) });
      });
      return {
        ...message,
        cacheControl: message.cacheControl ? { ...message.cacheControl } : undefined,
        content,
        toolCalls: message.toolCalls?.map((call) => ({ ...call })),
      };
    }),
  );
  return changed ? projected : messages;
}
