// SPDX-License-Identifier: Apache-2.0
// 附件解析失败时的兜底呈现（B6）：占位块、内联文本块、路径引用块，以及内容形态与扩展名
// 的判定工具。占位与引用只携带元信息（recoverability=metadata_only），模型侧看到的是几行
// 说明文本；内联文本块把原文直接交给模型（provider_ready）。本模块全部是纯构造函数，
// 不触碰端口、不打日志。

import { isArtifactUri } from "@knorvia/shared";
import { basename } from "../../deps.js";
import type { FilePartSource, TurnAttachment } from "../../deps.js";
import type { ResolvedTurnAttachment } from "../../types.js";
import { safeAttachmentOriginalRef } from "./artifact-content.js";
import { inferVideoMimeFromPath } from "./document-codecs.js";

// 转为路径引用的原因码 → 给模型看的英文解释；原因码类型由这张表的键推导，加原因只改这里。
const REASON_EXPLANATIONS = {
  binary_file: "the file is not a known text attachment",
  deferred_clipboard_text:
    "it is a pasted-text temporary attachment that is deferred to keep the model context small",
  image_too_large: "the image is larger than the inline media budget",
  pdf_too_large: "the PDF is larger than the inline PDF input limit",
  text_too_large: "the text file is larger than the inline text budget",
  video_too_large: "the video is larger than the Knorvia Studio video input limit",
} as const satisfies Record<string, string>;
type PathReferenceReason = keyof typeof REASON_EXPLANATIONS;

const READ_TOOL_HINT =
  "Use the available file reading tools if you need to inspect the file contents.";

// 附件种类 → 占位块的兜底媒体类型：图片给通配、PDF 声明真实类型、其余按纯文本。
const PLACEHOLDER_MEDIA: Readonly<Record<TurnAttachment["type"], string>> = {
  file: "text/plain",
  image: "image/*",
  pdf: "application/pdf",
  url: "text/plain",
  video: "text/plain",
};
const INLINE_PDF_REFERENCE = "inline:pdf";
const INLINE_URL_SCHEME = "data:";
const UNCLASSIFIED_MEDIA = "application/octet-stream";
const TEXT_MEDIA = "text/plain";
const IMAGE_WILDCARD_MEDIA = "image/*";

// 文本型扩展名白名单：只有这些扩展名的本地文件才会整文内联给模型。
const TEXT_LIKE_EXTENSIONS = [
  "cjs",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "mjs",
  "py",
  "rs",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
];
const TEXT_LIKE_PATTERN = new RegExp(`\\.(${TEXT_LIKE_EXTENSIONS.join("|")})$`, "iu");

// 扩展名 → 媒体类型（只登记有专用类型的四种；其余走文本/二进制兜底链）。
const EXTENSION_MEDIA: Readonly<Record<string, string>> = {
  csv: "text/csv",
  json: "application/json",
  md: "text/markdown",
  pdf: "application/pdf",
};

// 生成「只保留元信息」的占位附件：文本块给出 `[Attached <mime>: <占位串>]`，元数据携带
// 错误码供上层观测；带本地路径的附件 storageKind 记为 local_ref，否则是 metadata_only。
export function resolvedPlaceholderAttachment(
  item: TurnAttachment,
  label: string,
  errorCode: string,
  details: {
    filename?: string;
    mime?: string;
    sizeBytes?: number;
    source?: FilePartSource;
  } = {},
): ResolvedTurnAttachment {
  const mime = details.mime ?? PLACEHOLDER_MEDIA[item.type];
  const originalRef = safeAttachmentOriginalRef(item);
  return {
    contentBlock: { text: `[Attached ${mime}: ${label}]`, type: "text" },
    filename: details.filename,
    metadata: {
      errorCode,
      originalUrl: originalRef,
      recoverability: "metadata_only",
      sizeBytes: details.sizeBytes,
      storageKind: item.path ? "local_ref" : "metadata_only",
    },
    mime,
    source: details.source,
    url: placeholderRef(item, originalRef),
  };
}

// 生成「内联文本」附件：原文直接进内容块，预览标记未截断，模型可直接消费。
export function resolvedInlineTextAttachment(
  item: TurnAttachment,
  ordinal: number,
): ResolvedTurnAttachment {
  const content = item.content ?? "";
  const totalBytes = Buffer.byteLength(content, "utf8");
  return {
    contentBlock: { text: content, type: "text" },
    filename: item.path ? basename(item.path) : undefined,
    metadata: {
      originalUrl: safeAttachmentOriginalRef(item),
      preview: { originalBytes: totalBytes, text: content, truncated: false },
      recoverability: "provider_ready",
      sizeBytes: totalBytes,
      storageKind: "inline",
    },
    mime: TEXT_MEDIA,
    url: item.path ?? `attachment-${ordinal + 1}`,
  };
}

// 生成「路径引用」附件：三行说明文本（标题行 / 原因行 / 提示行），内容留给模型自行读取。
export function resolvedPathReferenceAttachment(
  item: TurnAttachment,
  label: string,
  details: {
    filename?: string;
    mime?: string;
    reason: PathReferenceReason;
    sizeBytes?: number;
    source?: FilePartSource;
  },
): ResolvedTurnAttachment {
  const mime = details.mime ?? (item.type === "image" ? IMAGE_WILDCARD_MEDIA : UNCLASSIFIED_MEDIA);
  const explanation = `The file was sent by local path because ${REASON_EXPLANATIONS[details.reason]}.`;
  return {
    contentBlock: {
      text: [`Attached ${mime}: ${label}`, explanation, READ_TOOL_HINT].join("\n"),
      type: "text",
    },
    filename: details.filename,
    metadata: {
      originalUrl: safeAttachmentOriginalRef(item),
      recoverability: "metadata_only",
      sizeBytes: details.sizeBytes,
      storageKind: "local_ref",
    },
    mime,
    source: details.source,
    url: item.path ?? item.content ?? "",
  };
}

// 内容串是否已经是「可直接引用的 URL 形态」：内联 data URL 或产物 URI。
export function isDataOrArtifactUrl(content: string): boolean {
  return content.startsWith(INLINE_URL_SCHEME) || isArtifactUri(content);
}

// 扩展名是否在文本白名单里（大小写不敏感，分隔符无关）。
export function isTextLikePath(path: string): boolean {
  return TEXT_LIKE_PATTERN.test(path);
}

// 按扩展名推断附件媒体类型：专用表 → 视频表 → 文本白名单 → 二进制兜底。
export function inferAttachmentMimeFromPath(path: string): string {
  const segments = path.split(".");
  const extension = segments[segments.length - 1]?.toLocaleLowerCase() ?? "";
  const declared = EXTENSION_MEDIA[extension];
  if (declared) {
    return declared;
  }
  const videoMedia = inferVideoMimeFromPath(path);
  if (videoMedia) {
    return videoMedia;
  }
  return isTextLikePath(path) ? TEXT_MEDIA : UNCLASSIFIED_MEDIA;
}

// 占位块的引用字段：视频/PDF 优先保产物 URI，其次本地路径，PDF 缺路径时用 inline:pdf。
function placeholderRef(item: TurnAttachment, originalUrl: string | undefined): string {
  if (item.type !== "video" && item.type !== "pdf") {
    return item.path ?? item.content ?? "";
  }
  if (isArtifactUri(item.content)) {
    return item.content;
  }
  return item.path ?? (item.type === "pdf" ? INLINE_PDF_REFERENCE : (originalUrl ?? ""));
}
