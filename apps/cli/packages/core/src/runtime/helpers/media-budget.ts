import {
  CoreErrorType,
  MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE,
  createCoreError,
  modelMessageContentToText,
  traceContextToLogContext,
} from "../deps.js";
import type {
  Logger,
  ModelInputFormat,
  ModelInputMessage,
  ModelMessageContent,
  ModelMessageContentBlock,
  TraceContext,
} from "../deps.js";
import { findLatestRealUserMessageIndex } from "./conversation.js";
import {
  projectMessagesForInputFormat,
  type MediaCapabilityProjection,
} from "./media-capability.js";
import {
  officialCuaImageRefIndexesForUnavailableMedia,
  officialCuaRasterUnavailableBlock,
} from "./official-cua-media.js";

export interface MediaBudgetProjection {
  messages: ModelInputMessage[];
  omittedMediaCount: number;
  projectedMediaBytes: number;
  retainedMediaCount: number;
  totalMediaBytes: number;
}

interface ModelMediaPolicyProjection {
  capabilityProjection: MediaCapabilityProjection;
  mediaBudgetProjection: MediaBudgetProjection;
  messages: ModelInputMessage[];
}

interface MediaBudgetProjectionOptions {
  latestRealUserMessageIndex?: number;
  maxMediaBytes?: number;
  preserveLatestUserMedia?: boolean;
}

interface MediaReference {
  blockIndex: number;
  requestBytes: number;
  messageIndex: number;
  protected: boolean;
}

const DEFAULT_MEDIA_BUDGET_BYTES = 40 * 1024 * 1024;
const MEDIA_OMISSION_NOTE =
  "\n[Media omitted from provider request to keep the request body under the configured media budget.]";

function mediaBytes(block: ModelMessageContentBlock): number {
  switch (block.type) {
    case "image":
    case "video":
      return Buffer.byteLength(block.dataUrl, "utf8");
    case "file":
      return block.dataUrl && !block.text ? Buffer.byteLength(block.dataUrl, "utf8") : 0;
    default:
      return 0;
  }
}

function mediaKey(messageIndex: number, blockIndex: number): string {
  return `${messageIndex}:${blockIndex}`;
}

function copyBlock(block: ModelMessageContentBlock): ModelMessageContentBlock {
  switch (block.type) {
    case "image":
    case "video":
    case "file":
      return {
        ...block,
        source: block.source ? { ...block.source } : undefined,
      };
    case "text":
    case "reasoning":
    case "resource_link":
      return { ...block };
  }
}

function projectContent(
  content: ModelMessageContent,
  messageIndex: number,
  retained: ReadonlySet<string>,
): ModelMessageContent {
  if (!Array.isArray(content)) {
    return content;
  }

  const omittedIndexes = new Set<number>();
  content.forEach((block, blockIndex) => {
    if (mediaBytes(block) !== 0 && !retained.has(mediaKey(messageIndex, blockIndex))) {
      omittedIndexes.add(blockIndex);
    }
  });
  const pairedIndexes = officialCuaImageRefIndexesForUnavailableMedia(content, omittedIndexes);

  return content.map((block, blockIndex): ModelMessageContentBlock => {
    if (pairedIndexes.has(blockIndex)) {
      return { type: "text", text: "" };
    }
    if (mediaBytes(block) === 0 || retained.has(mediaKey(messageIndex, blockIndex))) {
      return copyBlock(block);
    }
    if (pairedIndexes.has(blockIndex + 1)) {
      return officialCuaRasterUnavailableBlock();
    }
    return {
      type: "text",
      text: (modelMessageContentToText([block]) || "[Attached media]") + MEDIA_OMISSION_NOTE,
    };
  });
}

export function projectMessagesForModelMediaPolicy(
  messages: ModelInputMessage[],
  inputFormat: ModelInputFormat,
  options: { latestRealUserMessageIndex?: number } = {},
): ModelMediaPolicyProjection {
  const capabilityProjection = projectMessagesForInputFormat(messages, inputFormat);
  const mediaBudgetProjection = projectMessagesForMediaBudget(capabilityProjection.messages, {
    latestRealUserMessageIndex: options.latestRealUserMessageIndex,
  });
  return {
    capabilityProjection,
    mediaBudgetProjection,
    messages: mediaBudgetProjection.messages,
  };
}

export function projectMessagesForMediaBudget(
  messages: ModelInputMessage[],
  options: MediaBudgetProjectionOptions = {},
): MediaBudgetProjection {
  const maxMediaBytes = options.maxMediaBytes ?? DEFAULT_MEDIA_BUDGET_BYTES;
  if (!Number.isFinite(maxMediaBytes) || maxMediaBytes < 0) {
    throw createCoreError(CoreErrorType.ConfigurationError, "Invalid model request media budget", {
      context: { maxMediaBytes },
      recoverable: true,
    });
  }

  let protectedMessageIndex = -1;
  if (options.preserveLatestUserMedia !== false) {
    const suppliedIndex = options.latestRealUserMessageIndex;
    protectedMessageIndex =
      suppliedIndex !== undefined &&
      Number.isInteger(suppliedIndex) &&
      suppliedIndex >= -1 &&
      suppliedIndex < messages.length
        ? suppliedIndex
        : findLatestRealUserMessageIndex(messages);
  }

  const references: MediaReference[] = [];
  let totalMediaBytes = 0;
  messages.forEach((message, messageIndex) => {
    if (!Array.isArray(message.content)) {
      return;
    }
    message.content.forEach((block, blockIndex) => {
      const requestBytes = mediaBytes(block);
      if (requestBytes === 0) {
        return;
      }
      references.push({
        blockIndex,
        requestBytes,
        messageIndex,
        protected: messageIndex === protectedMessageIndex,
      });
      totalMediaBytes += requestBytes;
    });
  });

  if (totalMediaBytes <= maxMediaBytes) {
    return {
      messages,
      omittedMediaCount: 0,
      projectedMediaBytes: totalMediaBytes,
      retainedMediaCount: references.length,
      totalMediaBytes,
    };
  }

  let protectedMediaBytes = 0;
  references.forEach((reference) => {
    if (reference.protected) {
      protectedMediaBytes += reference.requestBytes;
    }
  });
  if (protectedMediaBytes > maxMediaBytes) {
    const error = createCoreError(
      CoreErrorType.InvalidInput,
      "Current attachments are too large to send. Remove or compress attachments and try again.",
      {
        context: {
          code: MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE,
          maxMediaBytes,
          protectedMediaBytes,
          totalMediaBytes,
        },
        recoverable: true,
      },
    );
    error.code = MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE;
    throw error;
  }

  const retained = new Set<string>();
  references.forEach((reference) => {
    if (reference.protected) {
      retained.add(mediaKey(reference.messageIndex, reference.blockIndex));
    }
  });
  let remainingBytes = maxMediaBytes - protectedMediaBytes;
  const candidates = references.filter((reference) => !reference.protected);
  candidates.sort(
    (left, right) => right.messageIndex - left.messageIndex || right.blockIndex - left.blockIndex,
  );
  candidates.forEach((reference) => {
    if (reference.requestBytes <= remainingBytes) {
      retained.add(mediaKey(reference.messageIndex, reference.blockIndex));
      remainingBytes -= reference.requestBytes;
    }
  });

  let projectedMediaBytes = 0;
  references.forEach((reference) => {
    if (retained.has(mediaKey(reference.messageIndex, reference.blockIndex))) {
      projectedMediaBytes += reference.requestBytes;
    }
  });
  const projectedMessages = messages.map((message, messageIndex) => ({
    ...message,
    content: projectContent(message.content, messageIndex, retained),
    toolCalls: message.toolCalls?.map((toolCall) => ({ ...toolCall })),
    cacheControl: message.cacheControl ? { ...message.cacheControl } : undefined,
  }));
  return {
    messages: projectedMessages,
    omittedMediaCount: references.length - retained.size,
    projectedMediaBytes,
    retainedMediaCount: retained.size,
    totalMediaBytes,
  };
}

export function logMediaBudgetProjection(
  logger: Logger | undefined,
  traceContext: TraceContext,
  projection: MediaBudgetProjection,
  options: { event: string; message: string },
): void {
  if (projection.omittedMediaCount === 0) {
    return;
  }
  logger?.debug(options.message, {
    ...traceContextToLogContext(traceContext),
    event: options.event,
    module: "core.runtime",
    status: "completed",
    omittedMediaCount: projection.omittedMediaCount,
    projectedMediaBytes: projection.projectedMediaBytes,
    retainedMediaCount: projection.retainedMediaCount,
    totalMediaBytes: projection.totalMediaBytes,
  });
}
