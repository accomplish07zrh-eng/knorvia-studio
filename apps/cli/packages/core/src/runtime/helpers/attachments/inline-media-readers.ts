// SPDX-License-Identifier: Apache-2.0
// 内联媒体附件的解析（B7 内联路径）。
// 附件内容已是 data URL、媒体类型已由上游解析。三种媒体各走一支：图片先经图像处理器缩放
// （缺席则原样透传），PDF 校验「媒体类型 + base64 载荷 + `%PDF-` 魔数」，视频校验
// 「`video/*` + 严格载荷」。任何缩放异常、载荷非法或超限都翻译成对应占位项或路径引用；
// 非媒体内容返回 undefined 交回上层回退成纯文本块。本组不打日志，失败只体现在返回值。

import { VIDEO_INPUT_MAX_BYTES } from "@knorvia/contracts";
import type { AttachmentRef, AttachmentStorageMetadata } from "@knorvia/contracts";
import type {
  ImageProcessorPort,
  SessionId,
  ToolArtifactStorePort,
  TraceContext,
  TurnAttachment,
  TurnId,
} from "../../deps.js";
import type { PreparedImageData, ResolvedTurnAttachment } from "../../types.js";
import { persistAttachmentDataUrl } from "./artifact-content.js";
import {
  parseInlinePdfDataUrl,
  parseInlineVideoDataUrl,
  PDF_INPUT_MAX_BYTES,
} from "./document-codecs.js";
import {
  resolvedPathReferenceAttachment,
  resolvedPlaceholderAttachment,
} from "./fallback-blocks.js";
import { prepareImageDataUrl } from "./image-preparation.js";

// 内联媒体解析的注入面：产物库与图像处理器可缺席（缺席即纯内联 / 原样透传）。
export interface InlineMediaOptions {
  abortSignal?: /* 取消信号随每次端口调用透传 */ AbortSignal;
  // 附件产物库：内联 data URL 落盘；与会话标识同时在场才真正写库。
  artifactStore?: ToolArtifactStorePort;
  // 已有产物 URI 时直接复用，产物写入被短路（幂等点）。
  existingArtifactUri?: string;
  imageProcessorPort?: /* 图像处理器缺席即原样透传 */ ImageProcessorPort;
  sessionId?: /* 会话标识：与产物库同时在场才真正写库 */ SessionId;
  traceContext: /* 追踪上下文随每次端口调用透传 */ TraceContext;
  turnId?: TurnId;
}

type ResolvedItem = ResolvedTurnAttachment;
type Persisted = Awaited<ReturnType<typeof persistAttachmentDataUrl>>;

// 语义冻结的错误码：模型侧与事件观测都按这些串识别失败原因。
const IMAGE_RESIZE_FAILED = "attachment_image_resize_failed";
const IMAGE_INVALID = "attachment_image_invalid";
const PDF_INVALID = "attachment_pdf_invalid";
const VIDEO_INVALID = "attachment_video_invalid";
const PDF_MEDIA = "application/pdf";
const UNKNOWN_VIDEO_MEDIA = "video/*";

// 附件种类 → 占位兜底媒体类型的顺序与内联解析无关，这里只做媒体分派。
export async function resolveInlineMedia(
  item: TurnAttachment,
  ordinal: number,
  declaredMedia: string | undefined,
  settings: InlineMediaOptions,
): Promise<ResolvedItem | undefined> {
  // 占位串：优先用户给的路径，缺路径按附件序号兜底（序号从 1 起）。
  const tag = item.path ?? `attachment-${ordinal + 1}`;
  if (item.type === "image" && item.content && declaredMedia?.startsWith("image/")) {
    return await inlineImageAttachment(item, ordinal, tag, declaredMedia, settings);
  }
  if (item.type === "pdf" && item.content) {
    return await inlinePdfAttachment(item, ordinal, tag, settings);
  }
  if (item.type !== "video" || !item.content) {
    // 非图片/视频，或没有内联内容：交回上层按纯文本回退。
    return undefined;
  }
  return await inlineVideoAttachment(item, ordinal, tag, declaredMedia, settings);
}

// 兼容入口（attachment-media-resolver.ts 的冻结名）：内联媒体分派的对外转发点。
export function resolveInlineMediaAttachment(
  item: TurnAttachment,
  ordinal: number,
  declaredMedia: string | undefined,
  settings: InlineMediaOptions,
): Promise<ResolvedItem | undefined> {
  return resolveInlineMedia(item, ordinal, declaredMedia, settings);
}

// 图片内联：交给图像处理器缩放，再把结果写入产物库并组装 image 块。缩放异常按「缩放失败」、
// 载荷非 base64 形态按「无效图片」降级。体积按 data URL 字符串的字节计（与解码后不同）。
async function inlineImageAttachment(
  item: TurnAttachment,
  ordinal: number,
  tag: string,
  declaredMedia: string,
  settings: InlineMediaOptions,
): Promise<ResolvedItem> {
  const payload = item.content ?? "";
  let scaled: PreparedImageData | undefined;
  try {
    scaled = await prepareImageDataUrl(payload, declaredMedia, settings);
  } catch {
    // 图像处理器抛错不在预处理层吞掉，这里翻译成占位项。
    return resolvedPlaceholderAttachment(item, tag, IMAGE_RESIZE_FAILED);
  }
  if (!scaled) {
    // 载荷不是 `;base64,` 形式：按「无效图片」降级。
    return resolvedPlaceholderAttachment(item, tag, IMAGE_INVALID);
  }
  const persisted = await persistAttachmentDataUrl(
    scaled.dataUrl,
    ordinal,
    scaled.mediaType,
    settings,
  );
  // 复用已有产物 URI 时沿用上游解析出的媒体类型，否则用缩放后的类型（仅影响来源标记）。
  const originMedia = settings.existingArtifactUri ? declaredMedia : scaled.mediaType;
  return {
    contentBlock: {
      type: "image",
      dataUrl: scaled.dataUrl,
      mediaType: scaled.mediaType,
      source: inlineSource(ordinal, originMedia, tag, persisted),
    },
    metadata: storageMetadata(persisted, Buffer.byteLength(payload, "utf8"), scaled.metadata),
    mime: scaled.mediaType,
    url: persisted.url,
  };
}

// PDF 内联：媒体类型 + base64 载荷 + 魔数三重校验，任一不过或超限即「无效 PDF」占位。
async function inlinePdfAttachment(
  item: TurnAttachment,
  ordinal: number,
  tag: string,
  settings: InlineMediaOptions,
): Promise<ResolvedItem> {
  const payload = item.content ?? "";
  const parsed = parseInlinePdfDataUrl(payload);
  if (!parsed) {
    return resolvedPlaceholderAttachment(item, tag, PDF_INVALID, pdfFallback(item, item.sizeBytes));
  }
  if (parsed.sizeBytes === 0 || parsed.sizeBytes > PDF_INPUT_MAX_BYTES) {
    return resolvedPlaceholderAttachment(
      item,
      tag,
      PDF_INVALID,
      pdfFallback(item, parsed.sizeBytes),
    );
  }
  const persisted = await persistAttachmentDataUrl(payload, ordinal, parsed.mediaType, settings);
  return {
    contentBlock: {
      type: "file",
      dataUrl: payload,
      mediaType: parsed.mediaType,
      name: item.filename,
      source: inlineSource(ordinal, parsed.mediaType, tag, persisted),
    },
    filename: item.filename,
    metadata: storageMetadata(persisted, parsed.sizeBytes),
    mime: parsed.mediaType,
    url: persisted.url,
  };
}

// 视频内联：`video/*` + 严格载荷校验；空载荷即「无效视频」，超限转路径引用。
async function inlineVideoAttachment(
  item: TurnAttachment,
  ordinal: number,
  tag: string,
  declaredMedia: string | undefined,
  settings: InlineMediaOptions,
): Promise<ResolvedItem> {
  const payload = item.content ?? "";
  const parsed = parseInlineVideoDataUrl(payload);
  if (!parsed) {
    return resolvedPlaceholderAttachment(item, tag, VIDEO_INVALID, {
      filename: item.filename,
      mime: item.mimeType ?? declaredMedia ?? UNKNOWN_VIDEO_MEDIA,
      sizeBytes: item.sizeBytes,
    });
  }
  if (parsed.sizeBytes === 0) {
    return resolvedPlaceholderAttachment(item, tag, VIDEO_INVALID, {
      filename: item.filename,
      mime: parsed.mediaType,
      sizeBytes: parsed.sizeBytes,
    });
  }
  if (parsed.sizeBytes > VIDEO_INPUT_MAX_BYTES) {
    return resolvedPathReferenceAttachment(item, tag, {
      filename: item.filename,
      mime: parsed.mediaType,
      reason: "video_too_large",
      sizeBytes: parsed.sizeBytes,
    });
  }
  const persisted = await persistAttachmentDataUrl(payload, ordinal, parsed.mediaType, settings);
  return {
    contentBlock: {
      type: "video",
      dataUrl: payload,
      mediaType: parsed.mediaType,
      source: inlineSource(ordinal, parsed.mediaType, tag, persisted),
    },
    metadata: storageMetadata(persisted, parsed.sizeBytes),
    mime: parsed.mediaType,
    url: persisted.url,
  };
}

// PDF 占位的兜底详情：声明真实 PDF 类型，体积按调用方给出的口径（原始声明或解码估算）。
function pdfFallback(
  item: TurnAttachment,
  sizeBytes: number | undefined,
): { filename?: string; mime: string; sizeBytes?: number } {
  return { filename: item.filename, mime: PDF_MEDIA, sizeBytes };
}

// 组装内联媒体的来源标记：来源恒为 inline，携带媒体类型与占位串，产物形态额外带 URI。
function inlineSource(
  ordinal: number,
  mediaType: string,
  tag: string,
  persisted: Persisted,
): AttachmentRef {
  return {
    id: `turn-attachment-${ordinal + 1}`,
    kind: "inline" as const,
    mimeType: mediaType,
    placeholder: tag,
    ...sourceUri(persisted),
  };
}

// 三支内联媒体共用的存储元数据：可恢复性与存储形态来自产物写入结果，图片额外带尺寸信息。
function storageMetadata(
  persisted: Persisted,
  sizeBytes: number,
  image?: PreparedImageData["metadata"],
): AttachmentStorageMetadata {
  return {
    ...(image ? { image } : {}),
    recoverability: persisted.metadata.recoverability,
    sizeBytes,
    storageKind: persisted.metadata.storageKind,
    ...artifactUriField(persisted),
  };
}

// 产物 URI 只在 artifact 形态出现：内联形态不带空串占位。
function sourceUri(persisted: Persisted): { uri?: string } {
  return persisted.metadata.artifactUri ? { uri: persisted.metadata.artifactUri } : {};
}

function artifactUriField(persisted: Persisted): { artifactUri?: string } {
  return persisted.metadata.artifactUri ? { artifactUri: persisted.metadata.artifactUri } : {};
}
