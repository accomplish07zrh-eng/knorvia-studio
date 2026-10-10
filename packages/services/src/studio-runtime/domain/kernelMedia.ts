import type { StudioKernelMedia } from "../kernelTypes.js";

/**
 * 从各内核原生结构中提取媒体引用（specs/knorvia-kernel-native-media-20261010.md）。
 * 只读取内核自己给出的位置或内联内容，不扫描工作区。
 */
const IMAGE = /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)$/i;
const VIDEO = /\.(?:mp4|webm|mov|m4v|mkv)$/i;
const AUDIO = /\.(?:mp3|wav|ogg|oga|m4a|aac|flac)$/i;
/** 整个字符串就是一个媒体位置：URL、file://、POSIX 绝对路径或 Windows 盘符路径。 */
const LOCATION = /^(?:https?:\/\/\S+|file:\/\/\S+|\/[^\n]+|[A-Za-z]:[\\/][^\n]+)$/;

type Record_ = Record<string, unknown>;
const record = (value: unknown): Record_ | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record_) : undefined;
const string = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

export function mediaKindOf(mimeType?: string, location?: string): StudioKernelMedia["kind"] {
  const mime = mimeType?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const path = location?.split(/[?#]/)[0] ?? "";
  if (IMAGE.test(path)) return "image";
  if (VIDEO.test(path)) return "video";
  if (AUDIO.test(path)) return "audio";
  return "file";
}

function baseName(location?: string): string | undefined {
  return location?.split(/[?#]/)[0]?.split(/[\\/]/).filter(Boolean).pop();
}

function inline(
  kind: StudioKernelMedia["kind"],
  dataBase64: string,
  mimeType?: string,
  name?: string,
): StudioKernelMedia {
  return { kind, dataBase64, ...(mimeType ? { mimeType } : {}), ...(name ? { name } : {}) };
}
function located(uri: string, mimeType?: string, name?: string): StudioKernelMedia {
  return {
    kind: mediaKindOf(mimeType, uri),
    uri,
    ...(mimeType ? { mimeType } : {}),
    name: name ?? baseName(uri) ?? uri,
  };
}

/** ACP ContentBlock：image、audio、resource_link、resource。text 块不算媒体。 */
export function acpContentMedia(value: unknown): StudioKernelMedia[] {
  const block = record(value);
  if (!block) return [];
  const mimeType = string(block.mimeType);
  if (block.type === "image" || block.type === "audio") {
    const kind = block.type;
    const data = string(block.data);
    if (data) return [inline(kind, data, mimeType)];
    const uri = string(block.uri);
    return uri ? [{ ...located(uri, mimeType), kind }] : [];
  }
  if (block.type === "resource_link") {
    const uri = string(block.uri);
    return uri ? [located(uri, mimeType, string(block.name) ?? string(block.title))] : [];
  }
  if (block.type === "resource") {
    const resource = record(block.resource);
    const uri = string(resource?.uri);
    const mime = string(resource?.mimeType);
    const blob = string(resource?.blob);
    if (blob) {
      const kind = mediaKindOf(mime, uri);
      return [inline(kind, blob, mime, baseName(uri))];
    }
    // 文本资源是正文内容，不当作媒体。
    return uri && mediaKindOf(mime, uri) !== "file" ? [located(uri, mime)] : [];
  }
  return [];
}

/** 字段值整体就是媒体位置时才认作产出，避免从普通文本中猜路径。 */
export function locationValueMedia(value: unknown, depth = 0): StudioKernelMedia[] {
  if (depth > 6) return [];
  if (typeof value === "string") {
    const text = value.trim();
    return LOCATION.test(text) && mediaKindOf(undefined, text) !== "file" ? [located(text)] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item) => locationValueMedia(item, depth + 1));
  const object = record(value);
  return object ? Object.values(object).flatMap((item) => locationValueMedia(item, depth + 1)) : [];
}

/** ACP 工具调用：content 中的内容块，以及完成后原始输出里的媒体位置字段。 */
export function acpToolMedia(update: Record_): StudioKernelMedia[] {
  const content = Array.isArray(update.content) ? update.content : [];
  const blocks = content.flatMap((item) => {
    const entry = record(item);
    return entry?.type === "content" ? acpContentMedia(entry.content) : [];
  });
  const completed = update.status === "completed";
  return dedupeMedia([...blocks, ...(completed ? locationValueMedia(update.rawOutput) : [])]);
}

/** Codex app-server 条目：图片生成（base64 或路径）与查看图片（路径）。 */
export function codexItemMedia(item: Record_): StudioKernelMedia[] {
  if (item.type === "imageView") {
    const path = string(item.path);
    return path ? [located(path)] : [];
  }
  if (item.type !== "imageGeneration") return [];
  const saved = string(item.savedPath) ?? string(item.path);
  if (saved) return [located(saved)];
  const result = string(item.result);
  if (!result) return [];
  if (LOCATION.test(result.trim())) return [located(result.trim())];
  const data = result.replace(/^data:([^;]+);base64,/, "");
  const mime = /^data:([^;]+);base64,/.exec(result)?.[1] ?? "image/png";
  return [inline("image", data, mime)];
}

/** Claude 内容块：image（base64 或 url），以及 tool_result 内嵌的 image。 */
export function claudeContentMedia(value: unknown): StudioKernelMedia[] {
  const block = record(value);
  if (!block) return [];
  if (block.type === "tool_result")
    return Array.isArray(block.content) ? block.content.flatMap(claudeContentMedia) : [];
  if (block.type !== "image") return [];
  const source = record(block.source);
  if (source?.type === "base64") {
    const data = string(source.data);
    return data ? [inline("image", data, string(source.media_type))] : [];
  }
  const url = string(source?.url);
  return url ? [{ ...located(url, string(source?.media_type)), kind: "image" }] : [];
}

/** 全文 FNV-1a；用于去重与消息 ID，不作内容地址（内容地址由落盘时的 SHA-256 决定）。 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}
/** 同一位置或同一内联内容只保留一次。 */
export function dedupeMedia(items: StudioKernelMedia[]): StudioKernelMedia[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.uri ?? `data:${fingerprint(item.dataBase64 ?? "")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
