import { isFileSystemPortError } from "../../deps.js";
import type { ResolvedTurnAttachment } from "../../types.js";
import { persistAttachmentDataUrl } from "../attachment-artifacts.js";
import { resolvedPathReferenceAttachment } from "../attachment-path-reference.js";
import { isPdfBytes, PDF_INPUT_MAX_BYTES } from "../attachment-pdf.js";
import { resolvedPlaceholderAttachment } from "../attachment-placeholder.js";
import type { LocalMediaContext } from "./context.js";
import { localReadFailed } from "./read-failure.js";

export async function resolveLocalPdf(context: LocalMediaContext): Promise<ResolvedTurnAttachment> {
  const { absolutePath, attachment, filename, mime, options, source, stat } = context;
  if (stat.sizeBytes > PDF_INPUT_MAX_BYTES) {
    return resolvedPathReferenceAttachment(attachment, attachment.path!, {
      filename,
      mime,
      sizeBytes: stat.sizeBytes,
      reason: "pdf_too_large",
      source,
    });
  }
  let read: Awaited<ReturnType<typeof options.fileSystemPort.readBinaryFile>>;
  try {
    read = await options.fileSystemPort.readBinaryFile(
      { path: absolutePath, maxBytes: PDF_INPUT_MAX_BYTES, trace: options.traceContext },
      { signal: options.abortSignal },
    );
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === "too_large") {
      return resolvedPathReferenceAttachment(attachment, attachment.path!, {
        filename,
        mime,
        reason: "pdf_too_large",
        source,
      });
    }
    return localReadFailed(attachment, filename, mime, source);
  }
  if (read.bytesRead === 0 || !isPdfBytes(read.content)) {
    return resolvedPlaceholderAttachment(attachment, attachment.path!, "attachment_pdf_invalid", {
      filename,
      mime,
      sizeBytes: read.sizeBytes,
      source,
    });
  }
  const dataUrl = `data:${mime};base64,${Buffer.from(read.content).toString("base64")}`;
  const resource = await persistAttachmentDataUrl(dataUrl, context.index, mime, {
    abortSignal: options.abortSignal,
    artifactStore: options.artifactStore,
    sessionId: options.sessionId,
    traceContext: options.traceContext,
    turnId: options.turnId,
  });
  return {
    contentBlock: {
      type: "file",
      mediaType: mime,
      name: filename,
      dataUrl,
      source: {
        id: `turn-attachment-${context.index + 1}`,
        kind: "local_file",
        mimeType: mime,
        path: absolutePath,
        placeholder: attachment.path!,
        sizeBytes: read.sizeBytes,
        sha256: read.revision?.hash,
        ...(resource.metadata.artifactUri ? { uri: resource.metadata.artifactUri } : {}),
      },
    },
    filename,
    metadata: {
      originalUrl: attachment.path,
      recoverability: resource.metadata.recoverability,
      sha256: read.revision?.hash,
      sizeBytes: read.sizeBytes,
      storageKind: resource.metadata.storageKind,
      ...(resource.metadata.artifactUri ? { artifactUri: resource.metadata.artifactUri } : {}),
    },
    mime,
    source,
    url: resource.url,
  };
}
