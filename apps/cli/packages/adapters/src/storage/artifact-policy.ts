// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 工件策略：URI 解析、目录/文件名净化、MIME↔扩展名映射与媒体缓存路径计算。
// 三张映射表以「规格串」声明，便于一次改动、一处维护。

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
const UNSAFE_COMPONENT = /[^A-Za-z0-9._-]/g;
const UNSAFE_EXTENSION = /[^A-Za-z0-9.]/g;
const EXTENSION_SHAPE = /^\.[a-z0-9]+$/;
const DEFAULT_TEXT_EXTENSION = ".json";
const BINARY_EXTENSION = ".bin";
const OCTET_STREAM = "application/octet-stream";
/** 历史 URI 指向现有数据，读取兼容不能被当前写入协议遮蔽。 */
const SUPPORTED_PROTOCOLS: ReadonlySet<string> = new Set(["knorvia-artifact:", "zcode-artifact:"]);

/** `<mime>:<扩展名>`，空格分隔一次声明（写入方向）。 */
const WRITE_EXTENSION_SPEC =
  "text/plain:.txt text/markdown:.md application/json:.json image/png:.png image/jpeg:.jpg " +
  "image/jpg:.jpg image/gif:.gif image/webp:.webp application/pdf:.pdf";

/** `<扩展名>:<mime>`，空格分隔一次声明（读取方向，按后缀匹配顺序排列）。 */
const READ_TYPE_SPEC =
  ".txt:text/plain .md:text/markdown .png:image/png .jpg:image/jpeg .jpeg:image/jpeg " +
  ".gif:image/gif .webp:image/webp .pdf:application/pdf .bin:application/octet-stream " +
  ".html:text/html .htm:text/html .csv:text/csv .svg:image/svg+xml .json:application/json";

/** `<mime>:<扩展名>`，空格分隔一次声明（媒体缓存方向）。 */
const MEDIA_EXTENSION_SPEC =
  "image/png:.png image/jpeg:.jpg image/jpg:.jpg image/gif:.gif image/webp:.webp " +
  "video/mp4:.mp4 video/quicktime:.mov video/webm:.webm video/x-matroska:.mkv " +
  "video/x-m4v:.m4v video/x-msvideo:.avi application/pdf:.pdf";

/** 规格串 → 映射表：每个条目形如 `左:右`。 */
function toTable(spec: string): Record<string, string> {
  return Object.fromEntries(spec.split(" ").map((entry) => entry.split(":"))) as Record<
    string,
    string
  >;
}

const WRITE_EXTENSIONS = toTable(WRITE_EXTENSION_SPEC);
const READ_TYPES = toTable(READ_TYPE_SPEC);
const MEDIA_EXTENSIONS = toTable(MEDIA_EXTENSION_SPEC);

export function sanitizeComponent(value: string): string {
  const cleaned = value.replace(UNSAFE_COMPONENT, "_").slice(0, SESSION_COMPONENT_LIMIT);
  return cleaned || "unknown";
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
  } catch (cause) {
    throw new Error(`Invalid tool artifact URI: ${uri}`, { cause });
  }
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
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
  const known = Object.hasOwn(WRITE_EXTENSIONS, type) ? WRITE_EXTENSIONS[type] : undefined;
  return known ?? DEFAULT_TEXT_EXTENSION;
}

export function binaryExtension(contentType: string, explicit: string | undefined): string {
  const text = textExtension(contentType);
  const notJson = text === DEFAULT_TEXT_EXTENSION && !contentType.toLowerCase().includes("json");
  const requested = explicit ?? (notJson ? BINARY_EXTENSION : text);
  const dotted = requested.startsWith(".") ? requested : `.${requested}`;
  const cleaned = dotted.replace(UNSAFE_EXTENSION, "").slice(0, EXTENSION_LIMIT).toLowerCase();
  return EXTENSION_SHAPE.test(cleaned) ? cleaned : BINARY_EXTENSION;
}

export function inferredType(path: string): string {
  const filename = basename(path).toLowerCase();
  // .txt 等点开头的完整文件名也有约定后缀，不能用 extname 的空结果排除。
  for (const [suffix, type] of Object.entries(READ_TYPES)) {
    if (filename.endsWith(suffix)) return type;
  }
  return OCTET_STREAM;
}

export function mediaKind(mediaType: string): MediaKind | undefined {
  const type = normalizedMime(mediaType);
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return type === "application/pdf" ? "pdf" : undefined;
}

/** 媒体缓存根：三类各自独立目录，互不覆盖。 */
function cacheRootFor(roots: ArtifactRoots, kind: MediaKind): string {
  const byKind: Record<MediaKind, string> = {
    image: roots.imageCacheRootDir,
    pdf: roots.pdfCacheRootDir,
    video: roots.videoCacheRootDir,
  };
  return byKind[kind];
}

/** 缓存文件名：`<kind>-<sha256 前 32 位><扩展名>`。 */
function cacheFileName(kind: MediaKind, uri: string, extension: string): string {
  const digest = createHash("sha256").update(uri).digest("hex");
  return `${kind}-${digest.slice(0, CACHE_HASH_LENGTH)}${extension}`;
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
  const name = cacheFileName(kind, uri, extension);
  return { path: join(cacheRootFor(roots, kind), session, name), kind };
}
