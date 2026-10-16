// SPDX-License-Identifier: Apache-2.0
// Extension catalog and path folding for preview cards. Scanners stay with the reference collector.
import type { ConversationArtifactType } from "../protocol-v4/rows.js";
import { MEDIA_PREVIEW_FORMATS } from "../media-preview.js";
import type { Expand, RequiredField } from "./field-slots.js";

const PREVIEW_FILE_KINDS = [
  "markdown",
  "html",
  "docx",
  "xlsx",
  "pptx",
  "pdf",
  "video",
  "audio",
] as const;

export type ConversationPreviewFileKind = (typeof PREVIEW_FILE_KINDS)[number];

type MediaOnlyArtifact = "video" | "audio";
export type ConversationPreviewArtifactType = ConversationArtifactType | MediaOnlyArtifact;

type DefinitionShape = {
  extensions: RequiredField<readonly string[]>;
  kind: RequiredField<ConversationPreviewFileKind>;
  mimeType: RequiredField<string>;
  artifactType: RequiredField<ConversationPreviewArtifactType>;
};

export type PreviewFileTypeDefinition = Expand<DefinitionShape>;

type CatalogRow = readonly [
  readonly string[],
  ConversationPreviewFileKind,
  string,
  ConversationPreviewArtifactType,
];

function catalogEntry(row: CatalogRow): PreviewFileTypeDefinition {
  const [extensions, kind, mimeType, artifactType] = row;
  return { extensions, kind, mimeType, artifactType };
}

const DOCUMENT_ROWS: readonly CatalogRow[] = [
  [[".md"], "markdown", "text/markdown", "md"],
  [[".html", ".htm"], "html", "text/html", "html"],
  [
    [".docx"],
    "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  [[".xlsx"], "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
  [
    [".pptx"],
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx",
  ],
  [[".pdf"], "pdf", "application/pdf", "pdf"],
];

const FILE_CATALOG: readonly PreviewFileTypeDefinition[] = [
  ...DOCUMENT_ROWS.map(catalogEntry),
  ...MEDIA_PREVIEW_FORMATS.map((format) =>
    catalogEntry([[format.extension], format.kind, format.mediaType, format.kind]),
  ),
];

const TRAILING_PUNCTUATION = /[.,;!?，。！？；：、]+$/u;
const TRAILING_LINE_COLUMN = /:\d+(?::\d+)?$/u;
const HOME_PREFIX = /^~[\\/]/u;
const FILE_SCHEME = /^file:\/\//iu;
const DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/u;
const DRIVE_URL_PATH = /^\/[a-zA-Z]:\//u;

function miss(): null {
  return null;
}

export function cleanToken(value: string): string {
  const trimmed = value.trim();
  const unpunctuated = trimmed.replace(TRAILING_PUNCTUATION, "");
  return unpunctuated.replace(TRAILING_LINE_COLUMN, "");
}

export function toSlashes(value: string): string {
  return value.split("\\").join("/");
}

function isAbsolutePath(value: string): boolean {
  if (value.startsWith("/")) return true;
  if (value.startsWith("\\\\")) return true;
  return DRIVE_PREFIX.test(value);
}

// `..` above a relative root is rejected. Absolute keys keep a leading slash and drop duplicate slashes,
// which collapses UNC `\\server\share` to `/server/share`.
function foldSegments(value: string, trapAboveRoot: boolean): string | null {
  const unified = toSlashes(value).replace(/\/{2,}/gu, "/");
  const kept: string[] = [];
  for (const segment of unified.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment !== "..") {
      kept.push(segment);
      continue;
    }
    if (kept.length === 0) {
      if (trapAboveRoot) return miss();
      continue;
    }
    kept.pop();
  }
  const lead = trapAboveRoot ? "" : unified.startsWith("/") ? "/" : "";
  return lead + kept.join("/");
}

export function foldKey(value: string): string {
  return foldSegments(value, false) ?? "";
}

function decodePathname(pathname: string): string {
  try {
    return decodeURI(pathname);
  } catch {
    // Malformed percent-encoding stays on the raw pathname.
    return pathname;
  }
}

function pathFromFileUrl(value: string): string | null {
  if (!URL.canParse(value)) return miss();
  const url = new URL(value);
  if (url.protocol !== "file:") return miss();
  const decoded = decodePathname(url.pathname);
  if (DRIVE_URL_PATH.test(decoded)) return decoded.slice(1);
  const host = url.hostname;
  if (host.length > 0 && host !== "localhost") return `//${host}${decoded}`;
  return decoded;
}

export function resolveConversationPreviewPath(workspacePath: string, rawPath: string) {
  const cleaned = cleanToken(rawPath);
  if (cleaned.length === 0 || HOME_PREFIX.test(cleaned)) return miss();
  const located = FILE_SCHEME.test(cleaned) ? pathFromFileUrl(cleaned) : cleaned;
  if (located === null || located.length === 0) return miss();
  if (isAbsolutePath(located)) return foldKey(located);
  const relative = foldSegments(located, true);
  if (relative === null) return miss();
  const root = foldKey(workspacePath).replace(/\/$/u, "");
  return `${root}/${relative}`;
}

export function getConversationPreviewFileType(rawPath: string) {
  const lowered = cleanToken(rawPath).toLowerCase();
  for (const definition of FILE_CATALOG) {
    const matched = definition.extensions.some((extension) => lowered.endsWith(extension));
    if (matched) return definition;
  }
  return miss();
}
