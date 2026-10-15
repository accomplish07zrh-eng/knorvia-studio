// SPDX-License-Identifier: Apache-2.0
// 回合附件的逐条解析（B1）。
// 解析严格按数组顺序串行推进：一条附件完成「分类 → 内容取得 → 呈现转换」之后才轮到下
// 一条，不做并发、不做重排。任何读取/统计/缩放失败都降级为带 errorCode 的占位项，不向
// 外抛异常——唯一例外是端口在取消（abort）时抛出的中止错误，按原样冒泡交回回合作用域。
// 本模块不打日志：解析结果的观测由媒体观测模块（B13）统一负责。

import { READ_DEFAULT_MAX_LINES, READ_MAX_FILE_SIZE_BYTES } from "@knorvia/contracts";
import { basename, resolvePath } from "../../deps.js";
import type {
  FilePartSource,
  FileSystemPort,
  ImageProcessorPort,
  SessionId,
  ToolArtifactStorePort,
  TraceContext,
  TurnAttachment,
  TurnId,
  TurnState,
} from "../../deps.js";
import { readTextFileForModel } from "../../../tool/handlers/read-text.js";
import type { ResolvedTurnAttachment } from "../../types.js";
import {
  resolveInlineMediaAttachment,
  resolveLocalMediaAttachment,
} from "../attachment-media-resolver.js";
import { readInlineAttachmentContent } from "./artifact-content.js";
import { parseDataUrlHeader } from "./data-url-codec.js";
import {
  inferAttachmentMimeFromPath,
  isDataOrArtifactUrl,
  isTextLikePath,
  resolvedInlineTextAttachment,
  resolvedPathReferenceAttachment,
  resolvedPlaceholderAttachment,
} from "./fallback-blocks.js";

// 解析选项：所有外部触点都从这里注入（文件系统、产物库、图像处理器、取消信号）。
type AttachmentResolution = {
  abortSignal?: /* 取消信号：所有端口调用都透传 */ AbortSignal;
  // 附件产物库：内联 data URL 的持久化与回读都经它，缺席即退化为纯内联。
  artifactStore?: ToolArtifactStorePort;
  fileSystemPort?: /* 本地路径读取端口，缺席时路径附件降级占位 */ FileSystemPort;
  // 图像处理器：缺席时图片原样透传，不做缩放。
  imageProcessorPort?: ImageProcessorPort;
  // 会话标识：与产物库同时在场才会真正写库（工具产物的归属键）。
  sessionId?: SessionId;
  traceContext: /* 追踪上下文随每次端口调用透传 */ TraceContext;
  turnId?: TurnId;
  // 相对路径统一按它解析成绝对路径；Windows 与 POSIX 分隔符都由平台 API 处理。
  workingDirectory: string;
};

type InlineResolution = AttachmentResolution & {
  // 上游已经持有产物 URI 时直接复用，产物写入被短路。
  existingArtifactUri?: string;
};

type LocalResolution = AttachmentResolution & {
  fileSystemPort: /* 本地分支保证端口在场 */ FileSystemPort;
};

// 单条附件的解析结果；对外类型不变，内部签名用短名保持可读。
type ResolvedItem = ResolvedTurnAttachment;

const TEXT_MEDIA = "text/plain";
const INLINE_WILDCARD_MEDIA = "image/*";
const READ_FAILED_CODE = "attachment_read_failed";
const RESOURCE_LINK_BLOCK = "resource_link";

export async function resolveTurnAttachments(
  items: TurnState["attachments"],
  settings: AttachmentResolution,
): Promise<ResolvedItem[]> {
  const collected: ResolvedItem[] = [];
  for (const [position, item] of (items ?? []).entries()) {
    collected.push(await resolveAttachmentAt(item, position, settings));
  }
  return collected;
}

// 按附件形态分派：url 走远端引用；有内容走内联解析；否则按本地路径读取或降级。
async function resolveAttachmentAt(
  item: TurnAttachment,
  ordinal: number,
  settings: AttachmentResolution,
): Promise<ResolvedItem> {
  if (item.type === "url") {
    return remoteReferenceAttachment(item, ordinal);
  }
  if (item.content) {
    return await resolveFromInlineContent(item, ordinal, settings);
  }
  return await resolveFromLocalPath(item, ordinal, settings);
}

// url 附件不取内容：模型请求只带 resource_link，可恢复性是 metadata_only。
function remoteReferenceAttachment(item: TurnAttachment, ordinal: number): ResolvedItem {
  const uri = item.content ?? item.path ?? `attachment-${ordinal + 1}`;
  return {
    contentBlock: { type: RESOURCE_LINK_BLOCK, uri },
    metadata: {
      storageKind: /* 只有引用随请求走 */ "remote_ref",
      recoverability: "metadata_only",
      originalUrl: uri,
    },
    mime: /* 链接附件的固定媒体类型 */ "text/uri-list",
    url: uri,
  };
}

// 内联内容分支：先挡掉「非 data/artifact URL 的 PDF 与普通文本」，再读产物库、走媒体解析。
async function resolveFromInlineContent(
  item: TurnAttachment,
  ordinal: number,
  settings: AttachmentResolution,
): Promise<ResolvedItem> {
  const payload = item.content ?? "";
  if (!isDataOrArtifactUrl(payload)) {
    if (item.type === "pdf") {
      return resolvedPlaceholderAttachment(
        item,
        item.path ?? `attachment-${ordinal + 1}`,
        "attachment_pdf_invalid",
        {
          filename: item.filename,
          mime: /* PDF 占位必须声明真实类型，模型侧才能识别 */ "application/pdf",
          sizeBytes: item.sizeBytes,
        },
      );
    }
    if (item.type !== "image") {
      return resolvedInlineTextAttachment(item, ordinal);
    }
  }

  const inline = await readInlineAttachmentContent(item, settings);
  if (inline) {
    return await resolveInlineAsMedia({ ...item, content: inline.dataUrl }, ordinal, {
      ...settings,
      existingArtifactUri: inline.artifactUri,
    });
  }
  return resolvedPlaceholderAttachment(
    item,
    item.path ?? `attachment-${ordinal + 1}`,
    READ_FAILED_CODE,
  );
}

// 内联媒体分支：媒体解析器返回空意味着「不是可内联媒体」，此时回退成纯文本块。
async function resolveInlineAsMedia(
  item: TurnAttachment,
  ordinal: number,
  settings: InlineResolution,
): Promise<ResolvedItem> {
  const dataUrlMime = item.content?.startsWith("data:")
    ? parseDataUrlHeader(item.content)?.mediaType
    : /* 非 data URL 内容没有可声明的媒体类型 */ undefined;
  const media = await resolveInlineMediaAttachment(item, ordinal, dataUrlMime, settings);
  if (media) {
    return media;
  }

  const payload = item.content ?? "";
  const inlineBytes = Buffer.byteLength(payload, "utf8");
  return {
    contentBlock: { text: payload, type: "text" },
    metadata: {
      storageKind: /* 内容随请求携带 */ "inline",
      recoverability: "provider_ready",
      originalUrl: item.path ?? item.content,
      preview: { originalBytes: inlineBytes, text: payload, truncated: false },
      sizeBytes: inlineBytes,
    },
    mime: dataUrlMime ?? (item.type === "image" ? INLINE_WILDCARD_MEDIA : TEXT_MEDIA),
    url: item.content ?? "",
  };
}

// 本地路径分支：图片/视频/PDF 交给媒体分派，其余按文本读取；缺端口或缺路径直接降级。
async function resolveFromLocalPath(
  item: TurnAttachment,
  ordinal: number,
  settings: AttachmentResolution,
): Promise<ResolvedItem> {
  const relativePath = item.path;
  const fsPort = settings.fileSystemPort;
  if (relativePath && fsPort) {
    if (item.type === "image" || item.type === "video" || item.type === "pdf") {
      return await resolveLocalMediaAttachment(item, ordinal, {
        ...settings,
        fileSystemPort: fsPort,
      });
    }
    return await resolveLocalText(item, relativePath, { ...settings, fileSystemPort: fsPort });
  }
  return resolvedPlaceholderAttachment(
    item,
    relativePath ?? `attachment-${ordinal + 1}`,
    READ_FAILED_CODE,
  );
}

// 本地文本读取：先 stat 确认是文件，再按「文本白名单 / 剪贴板临时附件 / 体积上限」逐层
// 分流；真正读取走统一的模型文本读取入口（超限文件只取头部窗口）。整段被 try/catch 包住，
// 任何端口异常都降级成读取失败占位。
async function resolveLocalText(
  item: TurnAttachment,
  relativePath: string,
  settings: LocalResolution,
): Promise<ResolvedItem> {
  const resolvedAbsPath = resolvePath(settings.workingDirectory, relativePath);
  const displayName = basename(resolvedAbsPath);
  const source = filePartSource(relativePath, resolvedAbsPath);
  try {
    const stats = await settings.fileSystemPort.stat(
      { path: resolvedAbsPath, trace: settings.traceContext },
      { signal: settings.abortSignal },
    );
    if (stats.kind !== "file") {
      return resolvedPlaceholderAttachment(item, relativePath, "attachment_not_file", {
        filename: displayName,
        mime: TEXT_MEDIA,
        sizeBytes: stats.sizeBytes,
        source,
      });
    }
    if (!isTextLikePath(resolvedAbsPath)) {
      return resolvedPathReferenceAttachment(item, relativePath, {
        filename: displayName,
        mime: inferAttachmentMimeFromPath(resolvedAbsPath),
        reason: "binary_file",
        sizeBytes: stats.sizeBytes,
        source,
      });
    }
    if (item.sourceKind === "clipboard-text") {
      return resolvedPathReferenceAttachment(item, relativePath, {
        filename: displayName,
        mime: TEXT_MEDIA,
        reason: "deferred_clipboard_text",
        sizeBytes: stats.sizeBytes,
        source,
      });
    }

    const overInlineBudget = stats.sizeBytes > READ_MAX_FILE_SIZE_BYTES;
    const window = await readTextFileForModel({
      abortSignal: settings.abortSignal,
      filePath: resolvedAbsPath,
      fileSystemPort: settings.fileSystemPort,
      ...(overInlineBudget
        ? { allowPartialFallback: true, limit: READ_DEFAULT_MAX_LINES, offset: 1 }
        : {}),
      trace: settings.traceContext,
    });
    return inlineTextResult(relativePath, displayName, source, window);
  } catch {
    return resolvedPlaceholderAttachment(item, relativePath, READ_FAILED_CODE, {
      filename: displayName,
      mime: TEXT_MEDIA,
      source,
    });
  }
}

// 把模型文本读取结果组装成内联附件：预览携带行窗口与截断信息，可恢复性随截断降级。
function inlineTextResult(
  relativePath: string,
  displayName: string,
  source: FilePartSource,
  window: Awaited<ReturnType<typeof readTextFileForModel>>,
): ResolvedItem {
  return {
    contentBlock: { text: window.content, type: "text" },
    filename: displayName,
    metadata: {
      storageKind: "inline",
      recoverability: /* 截断过的窗口只是预览，完整内容需要再读 */ window.truncated
        ? "preview_only"
        : "provider_ready",
      originalUrl: relativePath,
      preview: {
        ...(window.sizeBytes !== undefined ? { originalBytes: window.sizeBytes } : {}),
        ...(window.partialViewNotice !== undefined
          ? { partialViewNotice: window.partialViewNotice }
          : {}),
        ...(window.truncatedByTokenCap !== undefined
          ? { truncatedByTokenCap: window.truncatedByTokenCap }
          : {}),
        startLine: window.startLine,
        text: window.content,
        truncated: window.truncated ?? false,
        totalLines: window.totalLines,
      },
      ...(window.sizeBytes !== undefined ? { sizeBytes: window.sizeBytes } : {}),
    },
    mime: TEXT_MEDIA,
    source,
    url: relativePath,
  };
}

// 模型请求里的文件来源标记：保留用户输入的相对路径文本与解析后的绝对路径。
function filePartSource(originalPath: string, resolvedAbsPath: string): FilePartSource {
  return {
    path: resolvedAbsPath,
    text: { end: originalPath.length, start: 0, value: originalPath },
    type: "file",
  };
}
