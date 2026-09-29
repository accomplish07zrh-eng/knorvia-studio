// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import { createHash } from "node:crypto";
import { basename, join } from "node:path";

export interface ArtifactRoots {
  rootDir: string;
  imageCacheRootDir: string;
  videoCacheRootDir: string;
  pdfCacheRootDir: string;
}

export type MediaKind = "image" | "video" | "pdf";
const SESSION_COMPONENT_LIMIT = 120;
const EXTENSION_LIMIT = 16;
const CACHE_HASH_LENGTH = 32;
const WRITE_EXTENSIONS: Record<string, string> = {
  "text/plain": ".txt",
  "text/markdown": ".md",
  "application/json": ".json",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};
const READ_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".bin": "application/octet-stream",
  ".html": "text/html",
  ".htm": "text/html",
  ".csv": "text/csv",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "video/x-matroska": ".mkv",
  "video/x-m4v": ".m4v",
  "video/x-msvideo": ".avi",
  "application/pdf": ".pdf",
};

export function sanitizeComponent(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, SESSION_COMPONENT_LIMIT) || "unknown";
}

export function sessionComponent(sessionId: string): string {
  const component = sanitizeComponent(sessionId);
  // 点组件会使 join 越过所选根目录；只拒绝已批准的两个精确结果。
  if (component === "." || component === "..") {
    throw new Error(`Invalid tool artifact session path: ${sessionId}`);
  }
  return component;
}

export function parseArtifactUri(uri: string): { sessionId: string; artifactId: string } {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch (error) {
    throw new Error(`Invalid tool artifact URI: ${uri}`, { cause: error });
  }
  // 历史 URI 指向现有数据，读取兼容不能被当前写入协议遮蔽。
  if (parsed.protocol !== "knorvia-artifact:" && parsed.protocol !== "zcode-artifact:") {
    throw new Error(`Unsupported tool artifact URI: ${uri}`);
  }
  const sessionId = decodeURIComponent(parsed.hostname);
  const artifactId = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!sessionId || !artifactId) throw new Error(`Invalid tool artifact URI: ${uri}`);
  return { sessionId, artifactId };
}

export function normalizedMime(value: string): string {
  return value.split(";")[0]!.trim().toLowerCase();
}

export function textExtension(contentType: string): string {
  const type = normalizedMime(contentType);
  // MIME 必须是表内自有键，不能把对象原型成员当作扩展名。
  return (Object.hasOwn(WRITE_EXTENSIONS, type) ? WRITE_EXTENSIONS[type] : undefined) ?? ".json";
}

export function binaryExtension(contentType: string, explicit: string | undefined): string {
  const text = textExtension(contentType);
  const fallback = text === ".json" && !contentType.toLowerCase().includes("json") ? ".bin" : text;
  const requested = explicit ?? fallback;
  const dotted = requested.startsWith(".") ? requested : `.${requested}`;
  const cleaned = dotted
    .replace(/[^A-Za-z0-9.]/g, "")
    .slice(0, EXTENSION_LIMIT)
    .toLowerCase();
  return /^\.[a-z0-9]+$/.test(cleaned) ? cleaned : ".bin";
}

export function inferredType(path: string): string {
  const filename = basename(path).toLowerCase();
  // .txt 等点开头的完整文件名也有约定后缀，不能用 extname 的空结果排除。
  for (const [suffix, type] of Object.entries(READ_TYPES)) {
    if (filename.endsWith(suffix)) return type;
  }
  return "application/octet-stream";
}

export function mediaKind(mediaType: string): MediaKind | undefined {
  const type = normalizedMime(mediaType);
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return type === "application/pdf" ? "pdf" : undefined;
}

export function mediaTarget(
  roots: ArtifactRoots,
  uri: string,
  mediaType: string,
): { path: string; kind: MediaKind } | undefined {
  const { sessionId } = parseArtifactUri(uri);
  const session = sessionComponent(sessionId);
  const kind = mediaKind(mediaType);
  const extension = MEDIA_EXTENSIONS[normalizedMime(mediaType)];
  if (!kind || !extension) return undefined;
  const root =
    kind === "image"
      ? roots.imageCacheRootDir
      : kind === "video"
        ? roots.videoCacheRootDir
        : roots.pdfCacheRootDir;
  const hash = createHash("sha256").update(uri).digest("hex").slice(0, CACHE_HASH_LENGTH);
  return { path: join(root, session, `${kind}-${hash}${extension}`), kind };
}
