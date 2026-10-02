import { isArtifactUri } from "@knorvia/shared";
import type { FilePartSource, TurnAttachment } from "../deps.js";
import type { ResolvedTurnAttachment } from "../types.js";
import { safeAttachmentOriginalRef } from "./attachment-artifacts.js";

const IMAGE_PLACEHOLDER_MIME = "image/*";
const PDF_PLACEHOLDER_MIME = "application/pdf";
const TEXT_PLACEHOLDER_MIME = "text/plain";
const INLINE_PDF_REFERENCE = "inline:pdf";

function placeholderUrl(
  attachment: TurnAttachment,
  originalUrl: string | undefined,
): string {
  if (attachment.type === "video" || attachment.type === "pdf") {
    if (isArtifactUri(attachment.content)) {
      return attachment.content;
    }
    return attachment.path ?? (
      attachment.type === "pdf" ? INLINE_PDF_REFERENCE : originalUrl ?? ""
    );
  }
  return attachment.path ?? attachment.content ?? "";
}

export function resolvedPlaceholderAttachment(
  attachment: TurnAttachment,
  placeholder: string,
  errorCode: string,
  options: {
    filename?: string;
    mime?: string;
    sizeBytes?: number;
    source?: FilePartSource;
  } = {},
): ResolvedTurnAttachment {
  const mime = options.mime ?? (
    attachment.type === "image"
      ? IMAGE_PLACEHOLDER_MIME
      : attachment.type === "pdf" ? PDF_PLACEHOLDER_MIME : TEXT_PLACEHOLDER_MIME
  );
  const originalUrl = safeAttachmentOriginalRef(attachment);

  return {
    contentBlock: { type: "text", text: `[Attached ${mime}: ${placeholder}]` },
    filename: options.filename,
    metadata: {
      errorCode,
      originalUrl,
      recoverability: "metadata_only",
      sizeBytes: options.sizeBytes,
      storageKind: attachment.path ? "local_ref" : "metadata_only",
    },
    mime,
    source: options.source,
    url: placeholderUrl(attachment, originalUrl),
  };
}
