import { INLINE_MEDIA_ATTACHMENT_MAX_BYTES } from "../../types.js";
import type { PreparedImageData, ResolvedTurnAttachment } from "../../types.js";
import { persistAttachmentDataUrl } from "../attachment-artifacts.js";
import { prepareImageDataUrl } from "../attachment-image.js";
import { resolvedPathReferenceAttachment } from "../attachment-path-reference.js";
import { resolvedPlaceholderAttachment } from "../attachment-placeholder.js";
import type { LocalMediaContext } from "./context.js";
import { localReadFailed } from "./read-failure.js";

export async function resolveLocalImage(context: LocalMediaContext): Promise<ResolvedTurnAttachment> {
  const { absolutePath, attachment, filename, index, mime, options, source, stat } = context;
  if (stat.sizeBytes > INLINE_MEDIA_ATTACHMENT_MAX_BYTES) {
    return resolvedPathReferenceAttachment(attachment, attachment.path!, {
      filename,
      mime,
      sizeBytes: stat.sizeBytes,
      reason: "image_too_large",
      source,
    });
  }
  let read: Awaited<ReturnType<typeof options.fileSystemPort.readTextFile>>;
  try {
    read = await options.fileSystemPort.readTextFile(
      { path: absolutePath, encoding: "base64", trace: options.traceContext },
      { signal: options.abortSignal },
    );
  } catch {
    return localReadFailed(attachment, filename, mime, source);
  }
  const dataUrl = `data:${mime};base64,${read.content}`;
  let prepared: PreparedImageData | undefined;
  try {
    prepared = await prepareImageDataUrl(dataUrl, mime, options);
  } catch {
    return resolvedPlaceholderAttachment(attachment, attachment.path!, "attachment_image_resize_failed", {
      filename,
      mime,
      sizeBytes: stat.sizeBytes,
      source,
    });
  }
  if (!prepared) {
    return resolvedPlaceholderAttachment(attachment, attachment.path!, "attachment_image_invalid", {
      filename,
      mime,
      sizeBytes: stat.sizeBytes,
      source,
    });
  }
  const resource = await persistAttachmentDataUrl(prepared.dataUrl, index, prepared.mediaType, {
    abortSignal: options.abortSignal,
    artifactStore: options.artifactStore,
    sessionId: options.sessionId,
    traceContext: options.traceContext,
    turnId: options.turnId,
  });
  return {
    contentBlock: {
      type: "image",
      mediaType: prepared.mediaType,
      dataUrl: prepared.dataUrl,
      source: {
        id: `turn-attachment-${index + 1}`,
        kind: "local_file",
        mimeType: prepared.mediaType,
        path: absolutePath,
        placeholder: attachment.path!,
        sizeBytes: stat.sizeBytes,
        sha256: read.revision?.hash,
      },
    },
    filename,
    metadata: {
      ...(prepared.metadata ? { image: prepared.metadata } : {}),
      originalUrl: attachment.path,
      recoverability: resource.metadata.recoverability,
      sha256: read.revision?.hash,
      sizeBytes: stat.sizeBytes,
      storageKind: resource.metadata.storageKind,
      ...(resource.metadata.artifactUri ? { artifactUri: resource.metadata.artifactUri } : {}),
    },
    mime: prepared.mediaType,
    source,
    url: resource.url,
  };
}
