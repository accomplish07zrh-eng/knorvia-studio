import { basename, resolvePath } from "../deps.js";
import { READ_DEFAULT_MAX_LINES, READ_MAX_FILE_SIZE_BYTES } from "@knorvia/contracts";
import type {
  FilePartSource,
  FileSystemPort,
  ImageProcessorPort,
  SessionId,
  ToolArtifactStorePort,
  TraceContext,
  TurnAttachment,
  TurnAttachmentMeta,
  TurnState,
  TurnId,
} from "../deps.js";
import { readTextFileForModel } from "../../tool/handlers/read-text.js";
import type { ResolvedTurnAttachment } from "../types.js";
import { readInlineAttachmentContent } from "./attachment-artifacts.js";
import { parseDataUrlHeader } from "./attachment-data-url.js";
import {
  resolveInlineMediaAttachment,
  resolveLocalMediaAttachment,
} from "./attachment-media-resolver.js";
import { resolvedPlaceholderAttachment } from "./attachment-placeholder.js";
import { inferImageMimeFromPath } from "./attachment-image.js";
import {
  inferAttachmentMimeFromPath,
  isDataOrArtifactUrl,
  isTextLikePath,
  resolvedInlineTextAttachment,
  resolvedPathReferenceAttachment,
} from "./attachment-path-reference.js";

export { parseDataUrlHeader } from "./attachment-data-url.js";
export { inferImageMimeFromPath, prepareImageDataUrl } from "./attachment-image.js";

type ResolveAttachmentOptions = {
  abortSignal?: AbortSignal;
  artifactStore?: ToolArtifactStorePort;
  fileSystemPort?: FileSystemPort;
  imageProcessorPort?: ImageProcessorPort;
  sessionId?: SessionId;
  traceContext: TraceContext;
  turnId?: TurnId;
  workingDirectory: string;
};

type InlineAttachmentOptions = ResolveAttachmentOptions & {
  existingArtifactUri?: string;
};

type LocalAttachmentOptions = ResolveAttachmentOptions & {
  fileSystemPort: FileSystemPort;
};

export function summarizeTurnAttachmentsForEvent(
  attachments: TurnState["attachments"],
): TurnAttachmentMeta[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;

  return attachments.map((attachment, index) => {
    const path = attachment.path;
    const fileName =
      attachment.filename ?? (path ? basename(path) : undefined) ?? `attachment-${index + 1}`;
    const dataUrlMime =
      attachment.content !== undefined
        ? parseDataUrlHeader(attachment.content)?.mediaType
        : undefined;
    const mime =
      attachment.mimeType ??
      dataUrlMime ??
      (attachment.type === "url"
        ? "text/uri-list"
        : path
          ? attachment.type === "image"
            ? inferImageMimeFromPath(path)
            : inferAttachmentMimeFromPath(path)
          : "application/octet-stream");
    const bytes =
      attachment.sizeBytes ??
      (attachment.content !== undefined ? Buffer.byteLength(attachment.content, "utf8") : 0);
    const ref =
      path && !isDataOrArtifactUrl(path)
        ? path
        : attachment.type === "url"
          ? (attachment.content ?? path)
          : undefined;
    return { fileName, mime, bytes, ...(ref ? { ref } : {}) };
  });
}

export async function resolveTurnAttachments(
  attachments: TurnState["attachments"],
  options: ResolveAttachmentOptions,
): Promise<ResolvedTurnAttachment[]> {
  const resolved: ResolvedTurnAttachment[] = [];
  for (const [index, attachment] of (attachments ?? []).entries()) {
    const item = await resolveAttachment(attachment, index, options);
    resolved.push(item);
  }
  return resolved;
}

async function resolveAttachment(
  attachment: TurnAttachment,
  index: number,
  options: ResolveAttachmentOptions,
): Promise<ResolvedTurnAttachment> {
  if (attachment.type === "url") {
    const uri = attachment.content ?? attachment.path ?? `attachment-${index + 1}`;
    return {
      contentBlock: { type: "resource_link", uri },
      metadata: {
        originalUrl: uri,
        recoverability: "metadata_only",
        storageKind: "remote_ref",
      },
      mime: "text/uri-list",
      url: uri,
    };
  }

  if (attachment.content) {
    if (attachment.type === "pdf" && !isDataOrArtifactUrl(attachment.content)) {
      return resolvedPlaceholderAttachment(
        attachment,
        attachment.path ?? `attachment-${index + 1}`,
        "attachment_pdf_invalid",
        {
          filename: attachment.filename,
          mime: "application/pdf",
          sizeBytes: attachment.sizeBytes,
        },
      );
    }
    if (attachment.type !== "image" && !isDataOrArtifactUrl(attachment.content)) {
      return resolvedInlineTextAttachment(attachment, index);
    }
    const inline = await readInlineAttachmentContent(attachment, options);
    if (!inline) {
      return resolvedPlaceholderAttachment(
        attachment,
        attachment.path ?? `attachment-${index + 1}`,
        "attachment_read_failed",
      );
    }
    return await resolveInlineAttachment({ ...attachment, content: inline.dataUrl }, index, {
      ...options,
      existingArtifactUri: inline.artifactUri,
    });
  }

  const fileSystemPort = options.fileSystemPort;
  if (attachment.path && fileSystemPort) {
    if (attachment.type === "image" || attachment.type === "video" || attachment.type === "pdf") {
      return await resolveLocalMediaAttachment(attachment, index, {
        ...options,
        fileSystemPort,
      });
    }
    return await resolveLocalTextAttachment(attachment, {
      ...options,
      fileSystemPort,
    });
  }
  return resolvedPlaceholderAttachment(
    attachment,
    attachment.path ?? `attachment-${index + 1}`,
    "attachment_read_failed",
  );
}

async function resolveInlineAttachment(
  attachment: TurnAttachment,
  index: number,
  options: InlineAttachmentOptions,
): Promise<ResolvedTurnAttachment> {
  const parsed = attachment.content?.startsWith("data:")
    ? parseDataUrlHeader(attachment.content)
    : undefined;
  const media = await resolveInlineMediaAttachment(attachment, index, parsed?.mediaType, options);
  if (media) return media;

  const content = attachment.content ?? "";
  return {
    contentBlock: { type: "text", text: content },
    metadata: {
      originalUrl: attachment.path ?? attachment.content,
      preview: {
        text: content,
        truncated: false,
        originalBytes: Buffer.byteLength(content, "utf8"),
      },
      recoverability: "provider_ready",
      sizeBytes: Buffer.byteLength(content, "utf8"),
      storageKind: "inline",
    },
    mime: parsed?.mediaType ?? (attachment.type === "image" ? "image/*" : "text/plain"),
    url: attachment.content ?? "",
  };
}

async function resolveLocalTextAttachment(
  attachment: TurnAttachment,
  options: LocalAttachmentOptions,
): Promise<ResolvedTurnAttachment> {
  const absolutePath = resolvePath(options.workingDirectory, attachment.path!);
  const filename = basename(absolutePath);
  const mime = "text/plain";
  const source: FilePartSource = {
    type: "file",
    path: absolutePath,
    text: {
      value: attachment.path!,
      start: 0,
      end: attachment.path!.length,
    },
  };

  try {
    const stat = await options.fileSystemPort.stat(
      { path: absolutePath, trace: options.traceContext },
      { signal: options.abortSignal },
    );
    if (stat.kind !== "file") {
      return resolvedPlaceholderAttachment(attachment, attachment.path!, "attachment_not_file", {
        filename,
        mime,
        sizeBytes: stat.sizeBytes,
        source,
      });
    }
    if (!isTextLikePath(absolutePath)) {
      return resolvedPathReferenceAttachment(attachment, attachment.path!, {
        filename,
        mime: inferAttachmentMimeFromPath(absolutePath),
        reason: "binary_file",
        sizeBytes: stat.sizeBytes,
        source,
      });
    }
    if (attachment.sourceKind === "clipboard-text") {
      return resolvedPathReferenceAttachment(attachment, attachment.path!, {
        filename,
        mime,
        reason: "deferred_clipboard_text",
        sizeBytes: stat.sizeBytes,
        source,
      });
    }
    const oversized = stat.sizeBytes > READ_MAX_FILE_SIZE_BYTES;
    const read = await readTextFileForModel({
      abortSignal: options.abortSignal,
      filePath: absolutePath,
      fileSystemPort: options.fileSystemPort,
      ...(oversized
        ? { allowPartialFallback: true, limit: READ_DEFAULT_MAX_LINES, offset: 1 }
        : {}),
      trace: options.traceContext,
    });
    return {
      contentBlock: { type: "text", text: read.content },
      filename,
      metadata: {
        originalUrl: attachment.path,
        preview: {
          text: read.content,
          truncated: read.truncated ?? false,
          ...(read.sizeBytes !== undefined ? { originalBytes: read.sizeBytes } : {}),
          startLine: read.startLine,
          totalLines: read.totalLines,
          ...(read.truncatedByTokenCap !== undefined
            ? { truncatedByTokenCap: read.truncatedByTokenCap }
            : {}),
          ...(read.partialViewNotice !== undefined
            ? { partialViewNotice: read.partialViewNotice }
            : {}),
        },
        recoverability: read.truncated ? "preview_only" : "provider_ready",
        ...(read.sizeBytes !== undefined ? { sizeBytes: read.sizeBytes } : {}),
        storageKind: "inline",
      },
      mime,
      source,
      url: attachment.path!,
    };
  } catch {
    return resolvedPlaceholderAttachment(attachment, attachment.path!, "attachment_read_failed", {
      filename,
      mime,
      source,
    });
  }
}
