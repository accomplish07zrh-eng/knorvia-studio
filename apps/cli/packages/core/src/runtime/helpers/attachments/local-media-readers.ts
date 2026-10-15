// SPDX-License-Identifier: Apache-2.0
// 本地路径媒体附件的解析（B7 本地路径）。
// 先 stat 判定「是不是文件」，再按媒体类型分流：图片按 base64 文本读取后缩放，PDF 与视频
// 按原始字节读取并校验。任何读取失败、超限、魔数不符或空读都翻译成占位项或路径引用；所有
// 端口调用都携带取消信号、按需读取、不持有文件句柄。本组不打日志，失败只体现在返回值。

import { VIDEO_INPUT_MAX_BYTES } from "@knorvia/contracts";
import { basename, isFileSystemPortError, resolvePath } from "../../deps.js";
import type { FileSystemPort, FilePartSource, TurnAttachment } from "../../deps.js";
import { INLINE_MEDIA_ATTACHMENT_MAX_BYTES } from "../../types.js";
import type { PreparedImageData, ResolvedTurnAttachment } from "../../types.js";
import { persistAttachmentDataUrl } from "./artifact-content.js";
import { inferVideoMimeFromPath, isPdfBytes, PDF_INPUT_MAX_BYTES } from "./document-codecs.js";
import {
  resolvedPathReferenceAttachment,
  resolvedPlaceholderAttachment,
} from "./fallback-blocks.js";
import { inferImageMimeFromPath, prepareImageDataUrl } from "./image-preparation.js";
import type { InlineMediaOptions } from "./inline-media-readers.js";

// 本地媒体解析在内联注入面之上追加文件系统端口与工作目录，并去掉产物复用短路。
export interface LocalMediaOptions extends Omit<InlineMediaOptions, "existingArtifactUri"> {
  fileSystemPort: /* 本地分支保证端口在场 */ FileSystemPort;
  workingDirectory: /* 相对路径按它解析成绝对路径 */ string;
}

type ResolvedItem = ResolvedTurnAttachment;
type Persisted = Awaited<ReturnType<typeof persistAttachmentDataUrl>>;
type FsPort = LocalMediaOptions["fileSystemPort"];
type StatResult = Awaited<ReturnType<FsPort["stat"]>>;
type TextRead = Awaited<ReturnType<FsPort["readTextFile"]>>;
type ByteRead = Awaited<ReturnType<FsPort["readBinaryFile"]>>;

// 语义冻结的错误码、原因码与兜底媒体类型。
const NOT_FILE = "attachment_not_file";
const READ_FAILED = "attachment_read_failed";
const IMAGE_RESIZE_FAILED = "attachment_image_resize_failed";
const IMAGE_INVALID = "attachment_image_invalid";
const PDF_INVALID = "attachment_pdf_invalid";
const VIDEO_INVALID = "attachment_video_invalid";
const PDF_MEDIA = "application/pdf";
const DEFAULT_VIDEO_MEDIA = "video/mp4";
const TOO_LARGE_CODE = "too_large";

// 单条本地媒体解析所需的全部上下文：解析后的绝对路径、显示名、来源标记、媒体类型与端口。
export interface LocalMediaContext {
  displayName: string;
  item: TurnAttachment;
  media: string;
  ordinal: number;
  origin: FilePartSource;
  reference: string;
  resolvedPath: string;
  settings: LocalMediaOptions;
  stats: StatResult;
}

// 本地媒体入口：先解析路径并推断媒体类型，stat 判定文件形态，再按类型分派到具体读取器。
export async function resolveLocalMedia(
  item: TurnAttachment,
  ordinal: number,
  settings: LocalMediaOptions,
): Promise<ResolvedItem> {
  const reference = item.path ?? "";
  const resolvedPath = resolvePath(settings.workingDirectory, reference);
  const displayName = basename(resolvedPath);
  const media = localMedia(item, resolvedPath);
  const origin = fileOrigin(resolvedPath, reference);
  let stats: StatResult;
  try {
    stats = await settings.fileSystemPort.stat(
      { path: resolvedPath, trace: settings.traceContext },
      { signal: settings.abortSignal },
    );
  } catch {
    // stat 抛错（含不存在）统一降级成读取失败占位。
    return localReadFailed(item, displayName, media, origin);
  }
  if (stats.kind !== "file") {
    // 指向目录或特殊节点：只能给路径引用占位，模型侧自行读取。
    return resolvedPlaceholderAttachment(item, reference, NOT_FILE, {
      filename: displayName,
      mime: media,
      sizeBytes: stats.sizeBytes,
      source: origin,
    });
  }
  const context: LocalMediaContext = {
    displayName,
    item,
    media,
    ordinal,
    origin,
    reference,
    resolvedPath,
    settings,
    stats,
  };
  if (item.type === "image") {
    return await resolveLocalImage(context);
  }
  return item.type === "pdf" ? await resolveLocalPdf(context) : await resolveLocalVideo(context);
}

// 兼容入口（attachment-media-resolver.ts 的冻结名）：本地媒体分派的对外转发点。
export function resolveLocalMediaAttachment(
  item: TurnAttachment,
  ordinal: number,
  settings: LocalMediaOptions,
): Promise<ResolvedItem> {
  return resolveLocalMedia(item, ordinal, settings);
}

// 本地图片：超限转路径引用；读取（base64 文本）失败降级；缩放异常/无效按对应错误码占位。
export async function resolveLocalImage(context: LocalMediaContext): Promise<ResolvedItem> {
  const { displayName, item, media, ordinal, origin, reference, resolvedPath, settings, stats } =
    context;
  if (stats.sizeBytes > INLINE_MEDIA_ATTACHMENT_MAX_BYTES) {
    return resolvedPathReferenceAttachment(item, reference, {
      filename: displayName,
      mime: media,
      reason: "image_too_large",
      sizeBytes: stats.sizeBytes,
      source: origin,
    });
  }
  let read: TextRead;
  try {
    read = await settings.fileSystemPort.readTextFile(
      { encoding: "base64", path: resolvedPath, trace: settings.traceContext },
      { signal: settings.abortSignal },
    );
  } catch {
    return localReadFailed(item, displayName, media, origin);
  }
  const dataUrl = `data:${media};base64,${read.content}`;
  let scaled: PreparedImageData | undefined;
  try {
    scaled = await prepareImageDataUrl(dataUrl, media, settings);
  } catch {
    return resolvedPlaceholderAttachment(item, reference, IMAGE_RESIZE_FAILED, {
      filename: displayName,
      mime: media,
      sizeBytes: stats.sizeBytes,
      source: origin,
    });
  }
  if (!scaled) {
    return resolvedPlaceholderAttachment(item, reference, IMAGE_INVALID, {
      filename: displayName,
      mime: media,
      sizeBytes: stats.sizeBytes,
      source: origin,
    });
  }
  const persisted = await persistAttachmentDataUrl(
    scaled.dataUrl,
    ordinal,
    scaled.mediaType,
    settings,
  );
  return {
    contentBlock: {
      type: "image",
      dataUrl: scaled.dataUrl,
      mediaType: scaled.mediaType,
      source: {
        id: `turn-attachment-${ordinal + 1}`,
        kind: "local_file",
        mimeType: scaled.mediaType,
        path: resolvedPath,
        placeholder: reference,
        sha256: read.revision?.hash,
        sizeBytes: stats.sizeBytes,
      },
    },
    filename: displayName,
    metadata: {
      ...(scaled.metadata ? { image: scaled.metadata } : {}),
      originalUrl: item.path,
      recoverability: persisted.metadata.recoverability,
      sha256: read.revision?.hash,
      sizeBytes: stats.sizeBytes,
      storageKind: persisted.metadata.storageKind,
      ...artifactUriField(persisted),
    },
    mime: scaled.mediaType,
    source: origin,
    url: persisted.url,
  };
}

// 本地 PDF：超限或端口报 too_large 都转路径引用；空读或魔数不符按「无效 PDF」占位。
export async function resolveLocalPdf(context: LocalMediaContext): Promise<ResolvedItem> {
  const { displayName, item, media, ordinal, origin, reference, resolvedPath, settings, stats } =
    context;
  if (stats.sizeBytes > PDF_INPUT_MAX_BYTES) {
    return resolvedPathReferenceAttachment(item, reference, {
      filename: displayName,
      mime: media,
      reason: "pdf_too_large",
      sizeBytes: stats.sizeBytes,
      source: origin,
    });
  }
  let read: ByteRead;
  try {
    read = await settings.fileSystemPort.readBinaryFile(
      { maxBytes: PDF_INPUT_MAX_BYTES, path: resolvedPath, trace: settings.traceContext },
      { signal: settings.abortSignal },
    );
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === TOO_LARGE_CODE) {
      // 端口在体积护栏处失败：同样转成路径引用，内容留给模型自行读取。
      return resolvedPathReferenceAttachment(item, reference, {
        filename: displayName,
        mime: media,
        reason: "pdf_too_large",
        source: origin,
      });
    }
    return localReadFailed(item, displayName, media, origin);
  }
  if (read.bytesRead === 0 || !isPdfBytes(read.content)) {
    return resolvedPlaceholderAttachment(item, reference, PDF_INVALID, {
      filename: displayName,
      mime: media,
      sizeBytes: read.sizeBytes,
      source: origin,
    });
  }
  const dataUrl = `data:${media};base64,${Buffer.from(read.content).toString("base64")}`;
  const persisted = await persistAttachmentDataUrl(dataUrl, ordinal, media, settings);
  return {
    contentBlock: {
      type: "file",
      dataUrl,
      mediaType: media,
      name: displayName,
      source: {
        id: `turn-attachment-${ordinal + 1}`,
        kind: "local_file",
        mimeType: media,
        path: resolvedPath,
        placeholder: reference,
        sha256: read.revision?.hash,
        sizeBytes: read.sizeBytes,
        ...sourceUri(persisted),
      },
    },
    filename: displayName,
    metadata: {
      originalUrl: item.path,
      recoverability: persisted.metadata.recoverability,
      sha256: read.revision?.hash,
      sizeBytes: read.sizeBytes,
      storageKind: persisted.metadata.storageKind,
      ...artifactUriField(persisted),
    },
    mime: media,
    source: origin,
    url: persisted.url,
  };
}

// 本地视频：超限或端口报 too_large 转路径引用；空读按「无效视频」占位。
export async function resolveLocalVideo(context: LocalMediaContext): Promise<ResolvedItem> {
  const { displayName, item, media, ordinal, origin, reference, resolvedPath, settings, stats } =
    context;
  if (stats.sizeBytes > VIDEO_INPUT_MAX_BYTES) {
    return resolvedPathReferenceAttachment(item, reference, {
      filename: displayName,
      mime: media,
      reason: "video_too_large",
      sizeBytes: stats.sizeBytes,
      source: origin,
    });
  }
  let read: ByteRead;
  try {
    read = await settings.fileSystemPort.readBinaryFile(
      { maxBytes: VIDEO_INPUT_MAX_BYTES, path: resolvedPath, trace: settings.traceContext },
      { signal: settings.abortSignal },
    );
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === TOO_LARGE_CODE) {
      return resolvedPathReferenceAttachment(item, reference, {
        filename: displayName,
        mime: media,
        reason: "video_too_large",
        source: origin,
      });
    }
    return localReadFailed(item, displayName, media, origin);
  }
  if (read.bytesRead === 0) {
    return resolvedPlaceholderAttachment(item, reference, VIDEO_INVALID, {
      filename: displayName,
      mime: media,
      sizeBytes: read.sizeBytes,
      source: origin,
    });
  }
  const dataUrl = `data:${media};base64,${Buffer.from(read.content).toString("base64")}`;
  const persisted = await persistAttachmentDataUrl(dataUrl, ordinal, media, settings);
  return {
    contentBlock: {
      type: "video",
      dataUrl,
      mediaType: media,
      source: {
        id: `turn-attachment-${ordinal + 1}`,
        kind: "local_file",
        mimeType: media,
        path: resolvedPath,
        placeholder: reference,
        sha256: read.revision?.hash,
        sizeBytes: read.sizeBytes,
      },
    },
    filename: displayName,
    metadata: {
      originalUrl: item.path,
      recoverability: persisted.metadata.recoverability,
      sha256: read.revision?.hash,
      sizeBytes: read.sizeBytes,
      storageKind: persisted.metadata.storageKind,
      ...artifactUriField(persisted),
    },
    mime: media,
    source: origin,
    url: persisted.url,
  };
}

// 读取失败占位：stat 或读取端口抛错时统一降级，携带显示名、媒体类型与来源标记。
export function localReadFailed(
  item: TurnAttachment,
  displayName: string,
  media: string,
  origin: FilePartSource,
): ResolvedItem {
  return resolvedPlaceholderAttachment(item, item.path ?? "", READ_FAILED, {
    filename: displayName,
    mime: media,
    source: origin,
  });
}

// 媒体类型推断：图片按扩展名表、PDF 固定、视频按扩展名表兜底到声明类型或 mp4。
function localMedia(item: TurnAttachment, resolvedPath: string): string {
  if (item.type === "image") return inferImageMimeFromPath(resolvedPath);
  if (item.type === "pdf") return PDF_MEDIA;
  return inferVideoMimeFromPath(resolvedPath) ?? item.mimeType ?? DEFAULT_VIDEO_MEDIA;
}

// 模型请求里的文件来源标记：保留用户输入的相对路径文本范围与解析后的绝对路径。
function fileOrigin(resolvedPath: string, reference: string): FilePartSource {
  return {
    path: resolvedPath,
    text: { end: reference.length, start: 0, value: reference },
    type: "file",
  };
}

// 产物 URI 只在 artifact 形态出现：内联形态不带空串占位。
function sourceUri(persisted: Persisted): { uri?: string } {
  return persisted.metadata.artifactUri ? { uri: persisted.metadata.artifactUri } : {};
}

function artifactUriField(persisted: Persisted): { artifactUri?: string } {
  return persisted.metadata.artifactUri ? { artifactUri: persisted.metadata.artifactUri } : {};
}
