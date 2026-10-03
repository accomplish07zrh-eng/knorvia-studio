import { isArtifactUri } from "@knorvia/shared";
import { traceContextToLogContext } from "../deps.js";
import type {
  Logger,
  ModelInputMessage,
  ModelMessageContentBlock,
  TraceContext,
} from "../deps.js";
import type { MediaBudgetProjection } from "./media-budget.js";
import type { ResolvedTurnAttachment } from "../types.js";

export function logResolvedTurnAttachments(
  logger: Logger | undefined,
  traceContext: TraceContext,
  attachments: readonly ResolvedTurnAttachment[],
): void {
  if (attachments.length === 0) {
    return;
  }

  const summaries = attachments.map((attachment, index) => {
    const block = attachment.contentBlock;
    const blockSource = "source" in block ? block.source : undefined;
    const metadata = attachment.metadata;

    return {
      contentBlockType: block.type,
      dataUrlBytes: encodedBytes(block),
      errorCode: metadata.errorCode,
      filename: attachment.filename,
      hasArtifact: typeof metadata.artifactUri === "string",
      index,
      mediaType: mediaType(block),
      mime: attachment.mime,
      payloadBytes: payloadBytes(block),
      placeholder: blockSource?.placeholder ?? attachment.source?.text.value,
      recoverability: metadata.recoverability,
      sizeBytes: metadata.sizeBytes,
      sourceKind: blockSource?.kind ?? attachment.source?.type,
      storageKind: metadata.storageKind,
      urlKind: classifyUrl(attachment.url),
    };
  });

  logger?.debug("Turn attachments resolved", {
    ...traceContextToLogContext(traceContext),
    attachmentCount: attachments.length,
    attachmentContentBlockCounts: countContentBlocks(summaries),
    attachments: summaries,
    event: "turn.attachments.resolved",
    fileAttachmentCount: summaries.filter(
      (summary) => summary.contentBlockType === "file",
    ).length,
    imageAttachmentCount: summaries.filter(
      (summary) => summary.contentBlockType === "image",
    ).length,
    module: "core.runtime",
    resourceAttachmentCount: summaries.filter(
      (summary) => summary.contentBlockType === "resource_link",
    ).length,
    status: "completed",
    textFallbackAttachmentCount: summaries.filter(
      (summary) => summary.contentBlockType === "text",
    ).length,
    videoAttachmentCount: summaries.filter(
      (summary) => summary.contentBlockType === "video",
    ).length,
  });
}

export function logModelRequestMediaSummary(
  logger: Logger | undefined,
  traceContext: TraceContext,
  input: {
    incomingMessages: readonly ModelInputMessage[];
    mediaProjection: MediaBudgetProjection;
    providerMessages: readonly ModelInputMessage[];
  },
): void {
  const incoming = collectMediaBlocks(input.incomingMessages);
  const provider = collectMediaBlocks(input.providerMessages);
  if (incoming.length === 0 && provider.length === 0) {
    return;
  }

  logger?.debug("Model request media summary", {
    ...traceContextToLogContext(traceContext),
    event: "model.request.media_summary",
    incomingMediaBlockCount: incoming.length,
    incomingMediaBlocks: incoming.slice(0, 12),
    incomingMediaBlocksTruncated: incoming.length > 12,
    module: "core.runtime",
    omittedMediaCount: input.mediaProjection.omittedMediaCount,
    projectedMediaBytes: input.mediaProjection.projectedMediaBytes,
    providerMediaBlockCount: provider.length,
    providerMediaBlocks: provider.slice(0, 12),
    providerMediaBlocksTruncated: provider.length > 12,
    retainedMediaCount: input.mediaProjection.retainedMediaCount,
    status: "completed",
    totalMediaBytes: input.mediaProjection.totalMediaBytes,
  });
}

function countContentBlocks(
  summaries: readonly { contentBlockType: ModelMessageContentBlock["type"] }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const summary of summaries) {
    const key = summary.contentBlockType;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function collectMediaBlocks(messages: readonly ModelInputMessage[]) {
  const summaries: {
    blockIndex: number;
    blockType: "image" | "file" | "video";
    dataUrlBytes: number;
    mediaType: string;
    messageIndex: number;
    placeholder: string | undefined;
    role: ModelInputMessage["role"];
    sourceKind: "local_file" | "resource" | "inline" | undefined;
  }[] = [];

  messages.forEach((message, messageIndex) => {
    if (!Array.isArray(message.content)) {
      return;
    }
    message.content.forEach((block, blockIndex) => {
      if (
        block.type !== "image" &&
        block.type !== "file" &&
        block.type !== "video"
      ) {
        return;
      }
      const dataUrlBytes = encodedBytes(block);
      if (dataUrlBytes === 0) {
        return;
      }
      summaries.push({
        blockIndex,
        blockType: block.type,
        dataUrlBytes,
        mediaType: mediaType(block) ?? "unknown",
        messageIndex,
        placeholder: block.source?.placeholder,
        role: message.role,
        sourceKind: block.source?.kind,
      });
    });
  });

  return summaries;
}

function encodedBytes(block: ModelMessageContentBlock): number {
  if (block.type === "image" || block.type === "video") {
    return Buffer.byteLength(block.dataUrl, "utf8");
  }
  if (block.type === "file" && block.dataUrl && !block.text) {
    return Buffer.byteLength(block.dataUrl, "utf8");
  }
  return 0;
}

function payloadBytes(block: ModelMessageContentBlock): number {
  if (block.type === "image" || block.type === "video") {
    return payloadCharacterBytes(block.dataUrl);
  }
  if (block.type === "file" && block.dataUrl && !block.text) {
    return payloadCharacterBytes(block.dataUrl);
  }
  return 0;
}

function payloadCharacterBytes(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex < 0
    ? 0
    : Buffer.byteLength(dataUrl.slice(commaIndex + 1), "utf8");
}

function mediaType(block: ModelMessageContentBlock): string | undefined {
  if (
    block.type === "image" ||
    block.type === "file" ||
    block.type === "video"
  ) {
    return block.mediaType;
  }
  return undefined;
}

function classifyUrl(url: string): "empty" | "artifact" | "data-url" | "reference" {
  if (url.length === 0) {
    return "empty";
  }
  if (isArtifactUri(url)) {
    return "artifact";
  }
  return url.startsWith("data:") ? "data-url" : "reference";
}
