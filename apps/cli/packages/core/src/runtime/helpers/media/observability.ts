// SPDX-License-Identifier: Apache-2.0
// 媒体观测（B13）：回合附件解析结果与模型请求媒体摘要的结构化 debug。
// 没有日志器、或没有可统计的媒体时直接返回不打日志；请求侧条目数组最多取前 12 个
// 并给出截断标记。字节数按 UTF-8 计算，载荷字节只数 data URL 逗号之后的部分。
// 本模块只读入参、不抛异常；日志器异常不捕获（与仓库日志约定一致）。
import { isArtifactUri } from "@knorvia/shared";
import { traceContextToLogContext } from "../../deps.js";
import type {
  Logger,
  ModelInputMessage,
  ModelMessageContentBlock,
  TraceContext,
} from "../../deps.js";
import type { ResolvedTurnAttachment } from "../../types.js";
import type { MediaBudgetProjection } from "./model-media-policy.js";

// 请求摘要条目数组的截断上限（观测契约）。
const REQUEST_MEDIA_SUMMARY_CAP = 12;

type RequestMediaEntry = {
  blockIndex: number; // 块在消息内容里的下标
  blockType: "file" | "image" | "video";
  dataUrlBytes: number; // data URL 的 UTF-8 字节数
  mediaType: string;
  messageIndex: number; // 消息在输入数组里的下标
  placeholder: string | undefined;
  role: ModelInputMessage["role"];
  sourceKind: "local_file" | "resource" | "inline" | undefined;
};

// 计量口径：image/video 记 data URL 全量；file 只在「有 data URL 且无文本」时计入。
function countedDataUrl(piece: ModelMessageContentBlock): string | undefined {
  if (piece.type === "image" || piece.type === "video") {
    return piece.dataUrl;
  }
  return piece.type === "file" && piece.dataUrl && !piece.text ? piece.dataUrl : undefined;
}

function encodedUtf8Bytes(piece: ModelMessageContentBlock): number {
  const dataUrl = countedDataUrl(piece);
  return dataUrl === undefined ? 0 : Buffer.byteLength(dataUrl, "utf8");
}

// 载荷字节：只数 data URL 逗号之后的载荷部分；没有逗号记 0。
function payloadUtf8Bytes(piece: ModelMessageContentBlock): number {
  const dataUrl = countedDataUrl(piece);
  const boundary = dataUrl?.indexOf(",") ?? -1;
  return boundary < 0 ? 0 : Buffer.byteLength(dataUrl!.slice(boundary + 1), "utf8");
}

// 媒体类型：只有 image/file/video 三类块带 mediaType。
function mediaTypeOf(piece: ModelMessageContentBlock): string | undefined {
  return piece.type === "image" || piece.type === "file" || piece.type === "video"
    ? piece.mediaType
    : undefined;
}

// url 分类：空串 / artifact URI / data URL / 其他引用。
function classifyUrlKind(target: string): "artifact" | "data-url" | "empty" | "reference" {
  if (target.length === 0) return "empty";
  if (isArtifactUri(target)) return "artifact";
  return target.startsWith("data:") ? "data-url" : "reference";
}

// 附件摘要：字段名是观测契约，逐项只读入参。
function attachmentSummary(entry: ResolvedTurnAttachment, ordinal: number) {
  const piece = entry.contentBlock;
  const pieceSource = "source" in piece ? piece.source : undefined;
  const storage = entry.metadata;
  const summary = {
    contentBlockType: piece.type,
    dataUrlBytes: encodedUtf8Bytes(piece),
    errorCode: storage.errorCode,
    filename: entry.filename,
    hasArtifact: typeof storage.artifactUri === "string",
    index: ordinal, // 附件序号（0 起）
    mediaType: mediaTypeOf(piece),
    mime: entry.mime,
    payloadBytes: payloadUtf8Bytes(piece),
    placeholder: pieceSource?.placeholder ?? entry.source?.text.value,
    recoverability: storage.recoverability,
    sizeBytes: storage.sizeBytes,
    sourceKind: pieceSource?.kind ?? entry.source?.type,
    storageKind: storage.storageKind,
    urlKind: classifyUrlKind(entry.url),
  };
  return summary;
}

// 回合附件 debug：只在真解析出附件时打一条，事件名 turn.attachments.resolved（观测契约）。
export const logResolvedTurnAttachments = (
  sink: Logger | undefined,
  trace: TraceContext,
  items: readonly ResolvedTurnAttachment[],
): void => {
  if (items.length === 0) return;

  const records = items.map((entry, ordinal) => attachmentSummary(entry, ordinal));
  const blockCounts: Record<string, number> = {};
  for (const record of records) {
    blockCounts[record.contentBlockType] = (blockCounts[record.contentBlockType] ?? 0) + 1;
  }
  const byBlockType = (type: ModelMessageContentBlock["type"]) =>
    records.filter((record) => record.contentBlockType === type).length;

  sink?.debug("Turn attachments resolved", {
    ...traceContextToLogContext(trace),
    status: "completed", // 事件状态是观测契约字段
    module: "core.runtime", // 模块归属是观测契约字段
    event: "turn.attachments.resolved",
    attachmentCount: items.length,
    attachmentContentBlockCounts: blockCounts,
    attachments: records,
    fileAttachmentCount: byBlockType("file"),
    imageAttachmentCount: byBlockType("image"),
    resourceAttachmentCount: byBlockType("resource_link"),
    textFallbackAttachmentCount: byBlockType("text"),
    videoAttachmentCount: byBlockType("video"),
  });
};

// 请求媒体条目：只收 image/file/video 且 data URL 字节数大于 0 的块。
function requestMediaEntries(messages: readonly ModelInputMessage[]): RequestMediaEntry[] {
  const entries: RequestMediaEntry[] = [];
  messages.forEach((entry, messageOrdinal) => {
    const blocks = entry.content;
    if (!Array.isArray(blocks)) return;
    blocks.forEach((piece, blockOrdinal) => {
      if (piece.type !== "image" && piece.type !== "file" && piece.type !== "video") return;
      const dataUrlBytes = encodedUtf8Bytes(piece);
      if (dataUrlBytes === 0) return;
      entries.push({
        blockIndex: blockOrdinal,
        blockType: piece.type,
        dataUrlBytes, // data URL 的 UTF-8 字节数
        mediaType: mediaTypeOf(piece) ?? "unknown",
        messageIndex: messageOrdinal,
        placeholder: piece.source?.placeholder,
        role: entry.role,
        sourceKind: piece.source?.kind,
      });
    });
  });
  return entries;
}

// 模型请求媒体摘要 debug：投影前后两侧的媒体条目各取前 12 个，附预算投影的字节与计数。
export const logModelRequestMediaSummary = (
  sink: Logger | undefined,
  trace: TraceContext,
  view: {
    // 投影前后两侧的消息都要进摘要；预算投影结果提供字节与计数字段。
    providerMessages: readonly ModelInputMessage[];
    incomingMessages: readonly ModelInputMessage[];
    mediaProjection: MediaBudgetProjection;
  },
): void => {
  const incomingEntries = requestMediaEntries(view.incomingMessages);
  const providerEntries = requestMediaEntries(view.providerMessages);
  if (incomingEntries.length === 0 && providerEntries.length === 0) return;

  sink?.debug("Model request media summary", {
    ...traceContextToLogContext(trace),
    event: "model.request.media_summary",
    module: "core.runtime", // 模块归属是观测契约字段
    status: "completed", // 事件状态是观测契约字段
    incomingMediaBlockCount: incomingEntries.length,
    incomingMediaBlocks: incomingEntries.slice(0, REQUEST_MEDIA_SUMMARY_CAP),
    incomingMediaBlocksTruncated: incomingEntries.length > REQUEST_MEDIA_SUMMARY_CAP,
    providerMediaBlockCount: providerEntries.length,
    providerMediaBlocks: providerEntries.slice(0, REQUEST_MEDIA_SUMMARY_CAP),
    providerMediaBlocksTruncated: providerEntries.length > REQUEST_MEDIA_SUMMARY_CAP,
    omittedMediaCount: view.mediaProjection.omittedMediaCount,
    projectedMediaBytes: view.mediaProjection.projectedMediaBytes,
    retainedMediaCount: view.mediaProjection.retainedMediaCount,
    totalMediaBytes: view.mediaProjection.totalMediaBytes,
  });
};
