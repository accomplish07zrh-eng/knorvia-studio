import type { ModelMessageContentBlock } from "@knorvia/contracts";
import { traceContextToLogContext } from "../deps.js";
import type { Logger, ModelInputMessage, TraceContext } from "../deps.js";
import {
  officialCuaImageRefIndexesForUnavailableMedia,
  officialCuaRasterUnavailableBlock,
} from "./official-cua-media.js";

interface CompactMediaPlaceholderProjection {
  messages: ModelInputMessage[];
  replacedMediaCount: number;
}

export function projectCompactMediaForRetry(
  messages: readonly ModelInputMessage[],
): CompactMediaPlaceholderProjection {
  let replacedMediaCount = 0;
  const projectedMessages = messages.map((message): ModelInputMessage => {
    const content = message.content;
    if (!Array.isArray(content)) {
      return message;
    }

    const replacedMediaIndexes = new Set<number>();
    const projectedContent = content.map(
      (block, index): ModelMessageContentBlock => {
        if (block.type === "image") {
          replacedMediaIndexes.add(index);
          return { type: "text", text: "[image]" };
        }
        if (block.type === "video") {
          replacedMediaIndexes.add(index);
          return { type: "text", text: "[video]" };
        }
        if (
          block.type === "file" &&
          !(block.text !== undefined && block.text.length > 0) &&
          Boolean(block.dataUrl || block.uri)
        ) {
          replacedMediaIndexes.add(index);
          return { type: "text", text: "[document]" };
        }
        if ("source" in block && block.source) {
          return { ...block, source: { ...block.source } };
        }
        return { ...block };
      },
    );

    const imageRefIndexes = officialCuaImageRefIndexesForUnavailableMedia(
      content,
      replacedMediaIndexes,
    );
    for (const index of imageRefIndexes) {
      projectedContent[index - 1] = officialCuaRasterUnavailableBlock();
      projectedContent[index] = { type: "text", text: "" };
    }

    const messageReplacedMediaCount = replacedMediaIndexes.size;
    if (messageReplacedMediaCount === 0) {
      return message;
    }
    replacedMediaCount += messageReplacedMediaCount;
    return {
      ...message,
      cacheControl: message.cacheControl
        ? { ...message.cacheControl }
        : undefined,
      content: projectedContent,
      toolCalls: message.toolCalls?.map((call) => ({ ...call })),
    };
  });

  return { messages: projectedMessages, replacedMediaCount };
}

export function logCompactMediaRetryProjection(
  logger: Logger | undefined,
  traceContext: TraceContext,
  projection: CompactMediaPlaceholderProjection,
): void {
  if (projection.replacedMediaCount === 0) {
    return;
  }
  logger?.debug("Compact request media replaced with placeholders", {
    ...traceContextToLogContext(traceContext),
    event: "compact.request.media_placeholder_projection",
    module: "core.runtime",
    replacedMediaCount: projection.replacedMediaCount,
    status: "completed",
  });
}
