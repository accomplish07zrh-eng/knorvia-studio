// SPDX-License-Identifier: Apache-2.0
// 压缩重试请求的媒体占位投影（B10）。
// 压缩失败后的重试请求要瘦身：图片、视频、无文本的 data URL 文件块换成等宽占位文本，
// 其余块原样浅拷贝；整条消息没有媒体块时保持入参原引用。官方 CUA 的光栅图与紧随其后的
// 凭据文本同进退：光栅被占位替换后，凭据文本清空、光栅位换成「不可见」提示。
// 占位文案、事件名与计数字段都是观测契约；本模块同步纯计算，没有可统计项就直接短路。
import type { ModelMessageContentBlock } from "@knorvia/contracts";
import { traceContextToLogContext } from "../../deps.js";
import type { Logger, ModelInputMessage, TraceContext } from "../../deps.js";
import {
  officialCuaImageRefIndexesForUnavailableMedia,
  officialCuaRasterUnavailableBlock,
} from "./model-media-policy.js";

// 三个占位文案是协议文案，逐字冻结：模型侧靠它们知道这里原本是哪种媒体。
const IMAGE_PLACEHOLDER = "[image]";
const VIDEO_PLACEHOLDER = "[video]";
const DOCUMENT_PLACEHOLDER = "[document]";

// 观测消息正文；事件字段另在调用方平铺。
const PLACEHOLDER_PROJECTION_NOTICE = "Compact request media replaced with placeholders";

export interface RetryPlaceholderSummary {
  // 投影后的消息数组：没有媒体块的消息保持入参原引用。
  messages: ModelInputMessage[];
  replacedMediaCount: number; // 被占位替换的媒体块总数
}

// 媒体块 → 占位文本：图片、视频、无文本的 data URL/URI 文件块三类；undefined 表示保留原块。
function placeholderFor(piece: ModelMessageContentBlock): string | undefined {
  if (piece.type === "image") return IMAGE_PLACEHOLDER;
  if (piece.type === "video") return VIDEO_PLACEHOLDER;
  const documentLike =
    piece.type === "file" &&
    !(piece.text !== undefined && piece.text.length > 0) &&
    Boolean(piece.dataUrl || piece.uri);
  return documentLike ? DOCUMENT_PLACEHOLDER : undefined;
}

// 保留块的浅拷贝：带 source 的块多复制一层 source，其余块只复制壳。
function copyRetainedBlock(piece: ModelMessageContentBlock): ModelMessageContentBlock {
  return "source" in piece && piece.source
    ? { ...piece, source: { ...piece.source } }
    : { ...piece };
}

export const projectCompactMediaForRetry = (
  history: readonly ModelInputMessage[],
): RetryPlaceholderSummary => {
  let replacedTotal = 0;

  const projectedHistory = history.map((entry): ModelInputMessage => {
    const blocks = entry.content;
    if (!Array.isArray(blocks)) return entry;

    // 先一次算清每块的占位，再决定这条消息是否需要投影。
    const placeholders = blocks.map((piece) => placeholderFor(piece));
    const replacedOrdinals = new Set<number>();
    placeholders.forEach((label, ordinal) => {
      if (label !== undefined) replacedOrdinals.add(ordinal);
    });
    if (replacedOrdinals.size === 0) return entry;

    const slimmedContent = blocks.map((piece, ordinal): ModelMessageContentBlock => {
      const label = placeholders[ordinal];
      return label !== undefined ? { type: "text", text: label } : copyRetainedBlock(piece);
    });

    // 官方 CUA 配对：光栅位换成「不可见」提示，凭据文本清空。
    const pairedTextOrdinals = officialCuaImageRefIndexesForUnavailableMedia(
      blocks,
      replacedOrdinals,
    );
    for (const textOrdinal of pairedTextOrdinals) {
      slimmedContent[textOrdinal - 1] = officialCuaRasterUnavailableBlock();
      slimmedContent[textOrdinal] = { type: "text", text: "" };
    }

    replacedTotal += replacedOrdinals.size;
    return {
      ...entry,
      content: slimmedContent,
      toolCalls: entry.toolCalls?.map((invocation) => ({ ...invocation })),
      cacheControl: entry.cacheControl ? { ...entry.cacheControl } : undefined,
    };
  });

  return { messages: projectedHistory, replacedMediaCount: replacedTotal };
};

// 占位投影 debug：只在真有替换时打一条，事件名固定（观测契约）。
export const logCompactMediaRetryProjection = (
  sink: Logger | undefined,
  trace: TraceContext,
  summary: RetryPlaceholderSummary,
): void => {
  if (summary.replacedMediaCount === 0) return;
  sink?.debug(PLACEHOLDER_PROJECTION_NOTICE, {
    ...traceContextToLogContext(trace),
    status: "completed", // 事件状态是观测契约字段
    module: "core.runtime", // 模块归属是观测契约字段
    event: "compact.request.media_placeholder_projection",
    replacedMediaCount: summary.replacedMediaCount,
  });
};
