// SPDX-License-Identifier: Apache-2.0
import type { ConversationArtifactType } from "../protocol-v4/rows.js";
import { MEDIA_PREVIEW_FORMATS } from "../media-preview.js";

export type ConversationPreviewFileKind =
  | "markdown"
  | "html"
  | "docx"
  | "xlsx"
  | "pptx"
  | "pdf"
  | "video"
  | "audio";

export type ConversationPreviewArtifactType = ConversationArtifactType | "video" | "audio";

export interface ConversationPreviewFileReference {
  end: number;
  kind: ConversationPreviewFileKind;
  path: string;
  raw: string;
  start: number;
}

export interface ConversationPreviewFileChange {
  path: string;
  state?: "active" | "reverted";
}

export interface ConversationPreviewArtifactCandidate {
  artifactType: ConversationPreviewArtifactType;
  displayName: string;
  mimeType: string;
  previewKind: ConversationPreviewFileKind;
  productTurnId: string;
  sourceKind: "user_input_attachment" | "assistant_preview_card";
  sourceRef: string;
  requiresFileChanges: boolean;
}

export interface PreviewFileTypeDefinition {
  extensions: readonly string[];
  kind: ConversationPreviewFileKind;
  mimeType: string;
  artifactType: ConversationPreviewArtifactType;
}

export const CONVERSATION_PREVIEW_CARD_CANDIDATE_LIMIT = 15;
export const CONVERSATION_PREVIEW_CARD_VISIBLE_LIMIT = 10;

const DOCUMENT_CATALOG: readonly PreviewFileTypeDefinition[] = [
  { extensions: [".md"], kind: "markdown", mimeType: "text/markdown", artifactType: "md" },
  { extensions: [".html", ".htm"], kind: "html", mimeType: "text/html", artifactType: "html" },
  {
    extensions: [".docx"],
    kind: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    artifactType: "docx",
  },
  {
    extensions: [".xlsx"],
    kind: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    artifactType: "xlsx",
  },
  {
    extensions: [".pptx"],
    kind: "pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    artifactType: "pptx",
  },
  { extensions: [".pdf"], kind: "pdf", mimeType: "application/pdf", artifactType: "pdf" },
];

const FILE_CATALOG: readonly PreviewFileTypeDefinition[] = [
  ...DOCUMENT_CATALOG,
  ...MEDIA_PREVIEW_FORMATS.map((format) => ({
    extensions: [format.extension],
    kind: format.kind,
    mimeType: format.mediaType,
    artifactType: format.kind,
  })),
];

const EXTENSION_ALTERNATION =
  "md|html?|docx|xlsx|pptx|pdf|mp4|mov|webm|m4v|mp3|wav|m4a|ogg|opus|flac|weba";
const LINE_SUFFIX = "(?::\\d+(?::\\d+)?)?";
const NAME_CHARS = "[\\p{L}\\p{N}\\p{M}\\p{S}_.@()-]";
const SEGMENT_CHARS = "[\\p{L}\\p{N}\\p{M}\\p{S}_.@() -]";
const LEADING_BREAK = "[\\s(\"'`,.;:!?，。！？；：、]";
const TRAILING_BREAK = "[\\s)\"'`,.;:!?，。！？；：、]";

function compileScanners() {
  const rooted =
    "(?:\\.{1,2}[\\\\/]|[a-zA-Z]:[\\\\/]|\\/|" +
    NAME_CHARS +
    "+[\\\\/])" +
    SEGMENT_CHARS +
    "+?(?:[\\\\/]" +
    SEGMENT_CHARS +
    "+?)*";
  const body =
    "(?:" + rooted + "|" + NAME_CHARS + "+)\\.(?:" + EXTENSION_ALTERNATION + ")" + LINE_SUFFIX;
  return {
    citations: new RegExp(":{1,2}knorvia-file-citation\\{([^}]*)\\}", "giu"),
    markdownLinks: new RegExp("\\[([^\\]\\n]*)\\]\\(([^)\\n]+)\\)", "g"),
    fileUrls: new RegExp("\\bfile:\\/\\/[^\\s<>()\\]`\"'*，。！？；：、]+", "giu"),
    quotedPaths: new RegExp(
      "([`\"'])([^`\"'\\r\\n]+?\\.(?:" + EXTENSION_ALTERNATION + ")" + LINE_SUFFIX + ")\\1",
      "giu",
    ),
    plainPaths: new RegExp(
      "(?:^|" + LEADING_BREAK + ")(" + body + ")(?=$|" + TRAILING_BREAK + ")",
      "giu",
    ),
  };
}

const SCANNERS = compileScanners();
const TRAILING_LINE_COLUMN = /:\d+(?::\d+)?$/u;
const HOME_PREFIX = /^~[\\/]/u;
const FILE_SCHEME = /^file:\/\//iu;
const DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/u;
const DRIVE_URL_PATH = /^\/[a-zA-Z]:\//u;
const CITATION_MEDIA = new Set<ConversationPreviewFileKind>([
  "docx",
  "xlsx",
  "pptx",
  "pdf",
  "video",
  "audio",
]);

function cleanToken(value: string): string {
  return value
    .trim()
    .replace(/[.,;!?，。！？；：、]+$/u, "")
    .replace(TRAILING_LINE_COLUMN, "");
}

function toSlashes(value: string): string {
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
      if (trapAboveRoot) return null;
      continue;
    }
    kept.pop();
  }
  const lead = trapAboveRoot ? "" : unified.startsWith("/") ? "/" : "";
  return lead + kept.join("/");
}

function foldKey(value: string): string {
  return foldSegments(value, false) ?? "";
}

function pathFromFileUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "file:") return null;
  let path = url.pathname;
  try {
    path = decodeURI(path);
  } catch {
    // Malformed percent-encoding stays on the raw pathname.
  }
  if (DRIVE_URL_PATH.test(path)) return path.slice(1);
  if (url.hostname.length > 0 && url.hostname !== "localhost") return `//${url.hostname}${path}`;
  return path;
}

export function resolveConversationPreviewPath(
  workspacePath: string,
  rawPath: string,
): string | null {
  const cleaned = cleanToken(rawPath);
  if (cleaned.length === 0 || HOME_PREFIX.test(cleaned)) return null;
  const path = FILE_SCHEME.test(cleaned) ? pathFromFileUrl(cleaned) : cleaned;
  if (path === null || path.length === 0) return null;
  if (isAbsolutePath(path)) return foldKey(path);
  const relative = foldSegments(path, true);
  if (relative === null) return null;
  const root = foldKey(workspacePath).replace(/\/$/u, "");
  return `${root}/${relative}`;
}

export function getConversationPreviewFileType(path: string): PreviewFileTypeDefinition | null {
  const lowered = cleanToken(path).toLowerCase();
  for (const definition of FILE_CATALOG) {
    if (definition.extensions.some((extension) => lowered.endsWith(extension))) return definition;
  }
  return null;
}

function leafName(path: string): string {
  const segments = toSlashes(path)
    .replace(/\/+$/u, "")
    .split("/")
    .filter((segment) => segment.length > 0);
  return segments.at(-1) ?? path;
}

function insideWorkspace(workspace: string, target: string): boolean {
  const path = foldKey(target).replace(/\/$/u, "");
  const root = foldKey(workspace).replace(/\/$/u, "");
  return path === root || path.startsWith(`${root}/`);
}

function directiveParameter(body: string, name: string): string | undefined {
  const matched = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "iu").exec(body);
  const value = matched?.[1]?.trim() ?? "";
  return value.length > 0 ? value : undefined;
}

function citationExpectation(artifactKind: string): ConversationPreviewFileKind | undefined {
  if (artifactKind === "document") return "docx";
  if (artifactKind === "presentation") return "pptx";
  if (artifactKind === "workbook") return "xlsx";
  return undefined;
}

class SpanGuard {
  private readonly spans: Array<{ from: number; to: number }> = [];

  overlaps(from: number, to: number): boolean {
    return this.spans.some((span) => from < span.to && to > span.from);
  }

  protect(from: number, to: number): void {
    this.spans.push({ from, to });
  }
}

function spanOf(match: RegExpMatchArray): { from: number; to: number; text: string } {
  const from = match.index ?? 0;
  const text = match[0];
  return { from, to: from + text.length, text };
}

interface FoundReference {
  start: number;
  end: number;
  kind: ConversationPreviewFileKind;
  path: string;
  raw: string;
}

function admitReference(
  found: FoundReference[],
  workspacePath: string,
  raw: string,
  start: number,
  end: number,
  citationKind: string | undefined,
): void {
  const path = resolveConversationPreviewPath(workspacePath, raw);
  if (path === null) return;
  const definition = getConversationPreviewFileType(path);
  if (definition === null) return;
  if (citationKind !== undefined) {
    if (!CITATION_MEDIA.has(definition.kind)) return;
    const expected = citationExpectation(citationKind);
    if (expected !== undefined && definition.kind !== expected) return;
  }
  found.push({ start, end, kind: definition.kind, path, raw });
}

// Citation spans are reserved first so a looser scanner cannot emit the same region again.
function collectReferences(content: string, workspacePath: string): FoundReference[] {
  const guard = new SpanGuard();
  const found: FoundReference[] = [];
  for (const match of content.matchAll(SCANNERS.citations)) {
    const span = spanOf(match);
    guard.protect(span.from, span.to);
    const body = match[1] ?? "";
    const citedPath = directiveParameter(body, "path");
    if (citedPath === undefined) continue;
    const artifactKind = directiveParameter(body, "artifact_kind")?.toLowerCase() ?? "";
    admitReference(found, workspacePath, citedPath, span.from, span.to, artifactKind);
  }
  for (const match of content.matchAll(SCANNERS.markdownLinks)) {
    const span = spanOf(match);
    if (guard.overlaps(span.from, span.to)) continue;
    guard.protect(span.from, span.to);
    const raw = (match[2] ?? "").trim().replace(/^<|>$/gu, "");
    admitReference(found, workspacePath, raw, span.from, span.to, undefined);
  }
  for (const match of content.matchAll(SCANNERS.fileUrls)) {
    const span = spanOf(match);
    if (guard.overlaps(span.from, span.to)) continue;
    guard.protect(span.from, span.to);
    admitReference(found, workspacePath, cleanToken(span.text), span.from, span.to, undefined);
  }
  for (const match of content.matchAll(SCANNERS.quotedPaths)) {
    const span = spanOf(match);
    const raw = (match[2] ?? "").trim();
    if (raw.length === 0 || guard.overlaps(span.from, span.to)) continue;
    guard.protect(span.from, span.to);
    const inner = span.from + span.text.indexOf(raw);
    admitReference(found, workspacePath, raw, inner, inner + raw.length, undefined);
  }
  for (const match of content.matchAll(SCANNERS.plainPaths)) {
    const raw = match[1] ?? "";
    if (raw.length === 0) continue;
    const full = spanOf(match);
    const start = full.from + full.text.lastIndexOf(raw);
    const end = start + raw.length;
    if (guard.overlaps(start, end)) continue;
    admitReference(found, workspacePath, raw, start, end, undefined);
  }
  return found;
}

function laterFirst(
  left: { start: number; end: number },
  right: { start: number; end: number },
): number {
  if (left.start !== right.start) return right.start - left.start;
  return right.end - left.end;
}

function uniqueByPath(references: readonly FoundReference[]): ConversationPreviewFileReference[] {
  const ranked = references.slice().sort(laterFirst);
  const seen = new Set<string>();
  const kept: ConversationPreviewFileReference[] = [];
  for (const reference of ranked) {
    const key = foldKey(reference.path);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({
      start: reference.start,
      end: reference.end,
      kind: reference.kind,
      path: reference.path,
      raw: reference.raw,
    });
  }
  kept.reverse();
  return kept;
}

export function extractConversationPreviewFileReferences(
  content: string,
  workspacePath: string,
): ConversationPreviewFileReference[] {
  if (content.trim().length === 0) return [];
  return uniqueByPath(collectReferences(content, workspacePath));
}

function changeKey(workspacePath: string, rawPath: string): string {
  return foldKey(resolveConversationPreviewPath(workspacePath, rawPath) ?? rawPath);
}

function partitionChanges(
  workspacePath: string,
  changes: readonly ConversationPreviewFileChange[],
): { active: Set<string>; reverted: Set<string> } {
  const active = new Set<string>();
  const reverted = new Set<string>();
  for (const change of changes) {
    const key = changeKey(workspacePath, change.path);
    if (change.state === "reverted") reverted.add(key);
    else active.add(key);
  }
  return { active, reverted };
}

export function buildConversationPreviewArtifactCandidatesFromReferences(input: {
  references: readonly ConversationPreviewFileReference[];
  productTurnId: string;
  workspacePath: string;
  fileChanges?: readonly ConversationPreviewFileChange[];
  enforceWorkspaceBoundary?: boolean;
}): ConversationPreviewArtifactCandidate[] {
  const changes = partitionChanges(input.workspacePath, input.fileChanges ?? []);
  const enforceBoundary = input.enforceWorkspaceBoundary !== false;
  const seen = new Set<string>();
  const produced: ConversationPreviewArtifactCandidate[] = [];
  const ordered = input.references.slice().sort(laterFirst);
  for (const reference of ordered) {
    if (produced.length >= CONVERSATION_PREVIEW_CARD_CANDIDATE_LIMIT) break;
    const definition = getConversationPreviewFileType(reference.path);
    if (definition === null) continue;
    const path = foldKey(reference.path);
    if (enforceBoundary && !insideWorkspace(input.workspacePath, path)) continue;
    const requiresFileChanges = reference.kind === "markdown" || reference.kind === "html";
    if (requiresFileChanges && (!changes.active.has(path) || changes.reverted.has(path))) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    produced.push({
      artifactType: definition.artifactType,
      displayName: leafName(reference.path),
      mimeType: definition.mimeType,
      previewKind: definition.kind,
      productTurnId: input.productTurnId,
      sourceKind: "assistant_preview_card",
      sourceRef: reference.path,
      requiresFileChanges,
    });
  }
  return produced;
}

export function buildConversationPreviewArtifactCandidates(input: {
  assistantText: string;
  productTurnId: string;
  workspacePath: string;
  fileChanges?: readonly ConversationPreviewFileChange[];
}): ConversationPreviewArtifactCandidate[] {
  const { assistantText, ...rest } = input;
  return buildConversationPreviewArtifactCandidatesFromReferences({
    ...rest,
    references: extractConversationPreviewFileReferences(assistantText, input.workspacePath),
  });
}
