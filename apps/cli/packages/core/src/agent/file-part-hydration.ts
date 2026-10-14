// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 文件 part 水合：把 FilePart 落成模型可见的内容块，并把持久化的媒体行投影回内容块。
import { isArtifactUri } from "@knorvia/shared";
import type {
  AttachmentRef,
  FilePart,
  ModelMessageContentBlock,
  ToolArtifactStorePort,
} from "@knorvia/contracts";

type TextBlock = Extract<ModelMessageContentBlock, { type: "text" }>;
type ImageBlock = Extract<ModelMessageContentBlock, { type: "image" }>;
type VideoBlock = Extract<ModelMessageContentBlock, { type: "video" }>;
type FileBlock = Extract<ModelMessageContentBlock, { type: "file" }>;

const DATA_URL_PREFIX = "data:";
const PDF_MIME = "application/pdf";
const IMAGE_WILDCARD_MIME = "image/*";
const IMAGE_FALLBACK_MIME = "image/png";

/** 内联载荷 = data URL，且逗号之后确实还有内容。 */
const isInlineDataUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || !value.startsWith(DATA_URL_PREFIX)) return false;
  const commaAt = value.indexOf(",");
  return commaAt >= 0 && commaAt < value.length - 1;
};

const isImageMediaType = (mime: string): boolean =>
  mime === IMAGE_WILDCARD_MIME || mime.startsWith("image/");

/** 参数段不参与判定：先截到分号前再 trim 并小写。 */
const isPdfMediaType = (mime: string): boolean =>
  mime.split(";", 1)[0]?.trim().toLowerCase() === PDF_MIME;

/** 附件引用：逐字段写入，键序保持 id → kind → uri → path → mimeType → sizeBytes → sha256 → placeholder。 */
function attachmentReference(
  part: FilePart,
  useArtifactIdentity: boolean,
  durableUri: string,
): AttachmentRef {
  const origin = part.source;
  const reference = {} as AttachmentRef;
  reference.id = part.id;
  if (useArtifactIdentity) {
    reference.kind = "inline";
  } else if (origin?.type === "resource") {
    reference.kind = "resource";
  } else if (origin) {
    reference.kind = "local_file";
  } else {
    reference.kind = "inline";
  }
  if (useArtifactIdentity) {
    reference.uri = durableUri;
  } else if (origin?.type === "resource") {
    reference.uri = origin.uri;
  } else {
    reference.uri = part.url;
  }
  const localOrigin = origin?.type === "file" || origin?.type === "symbol";
  reference.path = localOrigin && !useArtifactIdentity ? origin.path : undefined;
  reference.mimeType = part.mime;
  reference.sizeBytes = part.metadata?.sizeBytes;
  reference.sha256 = part.metadata?.sha256;
  reference.placeholder = origin?.text.value ?? part.filename;
  return reference;
}

/** 内联载荷来源：part 自带 data URL，或从 artifact store 读回；都拿不到就回落文本。 */
async function resolveInlinePayload(
  part: FilePart,
  artifactStore: ToolArtifactStorePort | undefined,
  durableUri: string,
): Promise<string | undefined> {
  if (isInlineDataUrl(part.url)) return part.url;
  if (!artifactStore || !isArtifactUri(durableUri)) return undefined;
  try {
    const result = await artifactStore.readToolResultArtifact({ uri: durableUri });
    return isInlineDataUrl(result.content) ? result.content : undefined;
  } catch {
    // artifact 不可用或不可解析时，文本回落仍然可用。
    return undefined;
  }
}

/** image/* 通配时从 data URL 头推断真实媒体类型，失败按 png 处理。 */
function inferredImageMediaType(mime: string, payload: string): string {
  if (mime !== IMAGE_WILDCARD_MIME) return mime;
  const matched = payload.match(/^data:([^;,]+)(?:;base64)?,/i);
  return matched?.[1]?.toLowerCase() ?? IMAGE_FALLBACK_MIME;
}

function imageBlock(mediaType: string, payload: string, source: AttachmentRef): ImageBlock {
  const block = {} as ImageBlock;
  block.type = "image";
  block.mediaType = mediaType;
  block.dataUrl = payload;
  block.source = source;
  return block;
}

function videoBlock(mediaType: string, payload: string, source: AttachmentRef): VideoBlock {
  const block = {} as VideoBlock;
  block.type = "video";
  block.mediaType = mediaType;
  block.dataUrl = payload;
  block.source = source;
  return block;
}

function fileBlock(
  mediaType: string,
  name: string | undefined,
  payload: string,
  source: AttachmentRef,
): FileBlock {
  const block = {} as FileBlock;
  block.type = "file";
  block.mediaType = mediaType;
  block.name = name;
  block.dataUrl = payload;
  block.source = source;
  return block;
}

function textBlock(text: string): TextBlock {
  const block = {} as TextBlock;
  block.type = "text";
  block.text = text;
  return block;
}

/** 没有内联载荷时的兜底文案：local_ref 优先给路径，否则给文件名或 URL。 */
function attachmentLabel(part: FilePart): string {
  if (part.metadata?.storageKind === "local_ref") {
    const origin = part.source;
    const localPath =
      origin?.type === "file" || origin?.type === "symbol" ? origin.path : undefined;
    return origin?.text.value ?? localPath ?? part.metadata?.originalUrl ?? part.url;
  }
  return part.filename ?? part.url;
}

export async function filePartToContentBlock(
  part: FilePart,
  artifactStore: ToolArtifactStorePort | undefined,
): Promise<ModelMessageContentBlock> {
  const origin = part.source;
  const durableUri = part.metadata?.artifactUri ?? part.url;
  const localOrigin = origin?.type === "file" || origin?.type === "symbol";
  const mediaOrigin =
    isImageMediaType(part.mime) || part.mime.startsWith("video/") || isPdfMediaType(part.mime);
  const useArtifactIdentity = localOrigin && mediaOrigin && isArtifactUri(durableUri);
  const reference = attachmentReference(part, useArtifactIdentity, durableUri);
  const payload = await resolveInlinePayload(part, artifactStore, durableUri);

  if (payload !== undefined && isImageMediaType(part.mime)) {
    return imageBlock(inferredImageMediaType(part.mime, payload), payload, reference);
  }
  if (payload !== undefined && part.mime.startsWith("video/")) {
    return videoBlock(part.mime, payload, reference);
  }
  if (payload !== undefined && isPdfMediaType(part.mime)) {
    return fileBlock(PDF_MIME, part.filename, payload, reference);
  }
  const preview = part.mime.startsWith("text/") ? part.metadata?.preview?.text : undefined;
  if (typeof preview === "string") {
    return textBlock(preview);
  }
  return textBlock(`[Attached ${part.mime}: ${attachmentLabel(part)}]`);
}

/** 校验通过的媒体行：文本行或附件行（内部形状与持久化无关）。 */
type AcceptedRow = { kind: "text"; text: string } | { kind: "attachment"; attachmentIndex: number };

/** 任一行不合法就整体丢弃（不做部分投影），越界附件同样整体丢弃。 */
export function projectPersistedToolMediaContent(
  value: unknown,
  attachmentBlocks: ModelMessageContentBlock[],
): ModelMessageContentBlock[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const accepted: AcceptedRow[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const row = entry as Record<string, unknown>;
    if (row.type === "text") {
      if (typeof row.text !== "string") return undefined;
      accepted.push({ kind: "text", text: row.text });
    } else if (row.type === "attachment") {
      const index = row.attachmentIndex;
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return undefined;
      accepted.push({ kind: "attachment", attachmentIndex: index });
    } else {
      return undefined;
    }
  }

  const projected: ModelMessageContentBlock[] = [];
  for (const entry of accepted) {
    if (entry.kind === "text") {
      projected.push(textBlock(entry.text));
    } else {
      const attachment = attachmentBlocks[entry.attachmentIndex];
      if (!attachment) return undefined;
      projected.push(attachment);
    }
  }
  return projected;
}
