// SPDX-License-Identifier: Apache-2.0
import type { Expand, OptionalField, RequiredField } from "./field-slots.js";
import {
  cleanToken,
  foldKey,
  getConversationPreviewFileType,
  resolveConversationPreviewPath,
  toSlashes,
  type ConversationPreviewArtifactType,
  type ConversationPreviewFileKind,
  type PreviewFileTypeDefinition,
} from "./preview-paths.js";

export type { ConversationPreviewArtifactType, ConversationPreviewFileKind };
export { getConversationPreviewFileType, resolveConversationPreviewPath };

type ReferenceShape = {
  start: RequiredField<number>;
  end: RequiredField<number>;
  kind: RequiredField<ConversationPreviewFileKind>;
  path: RequiredField<string>;
  raw: RequiredField<string>;
};

export type ConversationPreviewFileReference = Expand<ReferenceShape>;

type FileChangeShape = {
  path: RequiredField<string>;
  state: OptionalField<"active" | "reverted">;
};

export type ConversationPreviewFileChange = Expand<FileChangeShape>;

type PreviewSourceKind = "user_input_attachment" | "assistant_preview_card";

type CandidateShape = {
  artifactType: RequiredField<ConversationPreviewArtifactType>;
  displayName: RequiredField<string>;
  mimeType: RequiredField<string>;
  previewKind: RequiredField<ConversationPreviewFileKind>;
  productTurnId: RequiredField<string>;
  sourceKind: RequiredField<PreviewSourceKind>;
  sourceRef: RequiredField<string>;
  requiresFileChanges: RequiredField<boolean>;
};

export type ConversationPreviewArtifactCandidate = Expand<CandidateShape>;

const CARD_LIMITS = { candidate: 15, visible: 10 } as const;
export const CONVERSATION_PREVIEW_CARD_CANDIDATE_LIMIT = CARD_LIMITS.candidate;
export const CONVERSATION_PREVIEW_CARD_VISIBLE_LIMIT = CARD_LIMITS.visible;

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
const ANGLE_WRAP = /^<|>$/gu;
const CITATION_MEDIA = new Set<ConversationPreviewFileKind>([
  "docx",
  "xlsx",
  "pptx",
  "pdf",
  "video",
  "audio",
]);
const CHANGE_GATED_KINDS = new Set<ConversationPreviewFileKind>(["markdown", "html"]);
const CITATION_KIND_MAP: Readonly<Record<string, ConversationPreviewFileKind | undefined>> = {
  document: "docx",
  presentation: "pptx",
  workbook: "xlsx",
};

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
  if (path === root) return true;
  const prefix = `${root}/`;
  return path.startsWith(prefix);
}

function directiveParameter(body: string, name: string): string | undefined {
  const matched = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "iu").exec(body);
  const value = matched?.[1]?.trim() ?? "";
  return value.length > 0 ? value : undefined;
}

function citationExpectation(artifactKind: string): ConversationPreviewFileKind | undefined {
  return CITATION_KIND_MAP[artifactKind];
}

function citationAllows(kind: ConversationPreviewFileKind, artifactKind: string): boolean {
  if (!CITATION_MEDIA.has(kind)) return false;
  const expected = citationExpectation(artifactKind);
  if (expected === undefined) return true;
  return kind === expected;
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

function admitReference(
  found: ConversationPreviewFileReference[],
  workspacePath: string,
  raw: string,
  start: number,
  end: number,
  citationKind: string | undefined,
): void {
  const resolved = resolveConversationPreviewPath(workspacePath, raw);
  if (resolved === null) return;
  const fileType = getConversationPreviewFileType(resolved);
  if (fileType === null) return;
  if (citationKind !== undefined && !citationAllows(fileType.kind, citationKind)) return;
  found.push({ start, end, kind: fileType.kind, path: resolved, raw });
}

function unwrapMarkdownTarget(match: RegExpMatchArray): string {
  const target = match[2] ?? "";
  return target.trim().replace(ANGLE_WRAP, "");
}

function quotedBody(match: RegExpMatchArray): string {
  const body = match[2] ?? "";
  return body.trim();
}

function groupSpan(
  match: RegExpMatchArray,
  raw: string,
  fromEnd: boolean,
): {
  start: number;
  end: number;
} {
  const full = spanOf(match);
  const offset = fromEnd ? full.text.lastIndexOf(raw) : full.text.indexOf(raw);
  const start = full.from + offset;
  return { start, end: start + raw.length };
}

// Citation spans are reserved first so a looser scanner cannot emit the same region again.
function collectReferences(
  content: string,
  workspacePath: string,
): ConversationPreviewFileReference[] {
  const guard = new SpanGuard();
  const found: ConversationPreviewFileReference[] = [];
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
    admitReference(
      found,
      workspacePath,
      unwrapMarkdownTarget(match),
      span.from,
      span.to,
      undefined,
    );
  }
  for (const match of content.matchAll(SCANNERS.fileUrls)) {
    const span = spanOf(match);
    if (guard.overlaps(span.from, span.to)) continue;
    guard.protect(span.from, span.to);
    admitReference(found, workspacePath, cleanToken(span.text), span.from, span.to, undefined);
  }
  for (const match of content.matchAll(SCANNERS.quotedPaths)) {
    const span = spanOf(match);
    const raw = quotedBody(match);
    if (raw.length === 0 || guard.overlaps(span.from, span.to)) continue;
    guard.protect(span.from, span.to);
    const inner = groupSpan(match, raw, false);
    admitReference(found, workspacePath, raw, inner.start, inner.end, undefined);
  }
  for (const match of content.matchAll(SCANNERS.plainPaths)) {
    const raw = match[1] ?? "";
    if (raw.length === 0) continue;
    const inner = groupSpan(match, raw, true);
    if (guard.overlaps(inner.start, inner.end)) continue;
    admitReference(found, workspacePath, raw, inner.start, inner.end, undefined);
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

class FirstSeen {
  private readonly keys = new Set<string>();

  accept(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }
}

function uniqueByPath(
  references: readonly ConversationPreviewFileReference[],
): ConversationPreviewFileReference[] {
  const ranked = references.slice().sort(laterFirst);
  const gate = new FirstSeen();
  const kept: ConversationPreviewFileReference[] = [];
  for (const reference of ranked) {
    if (!gate.accept(foldKey(reference.path))) continue;
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

export function extractConversationPreviewFileReferences(content: string, workspacePath: string) {
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

type ReferenceBuildShape = {
  references: RequiredField<readonly ConversationPreviewFileReference[]>;
  productTurnId: RequiredField<string>;
  workspacePath: RequiredField<string>;
  fileChanges: OptionalField<readonly ConversationPreviewFileChange[]>;
  enforceWorkspaceBoundary: OptionalField<boolean>;
};

type ReferenceBuildInput = Expand<ReferenceBuildShape>;

function makeCandidate(
  fileType: PreviewFileTypeDefinition,
  reference: ConversationPreviewFileReference,
  productTurnId: string,
  requiresFileChanges: boolean,
): ConversationPreviewArtifactCandidate {
  const artifactType = fileType.artifactType;
  const displayName = leafName(reference.path);
  const mimeType = fileType.mimeType;
  const previewKind = fileType.kind;
  const sourceKind = "assistant_preview_card" as const;
  const sourceRef = reference.path;
  return {
    artifactType,
    displayName,
    mimeType,
    previewKind,
    productTurnId,
    sourceKind,
    sourceRef,
    requiresFileChanges,
  };
}

export function buildConversationPreviewArtifactCandidatesFromReferences(
  input: ReferenceBuildInput,
) {
  const changes = partitionChanges(input.workspacePath, input.fileChanges ?? []);
  const enforceBoundary = input.enforceWorkspaceBoundary !== false;
  const gate = new FirstSeen();
  const produced: ConversationPreviewArtifactCandidate[] = [];
  const ordered = input.references.slice().sort(laterFirst);
  for (const reference of ordered) {
    if (produced.length >= CONVERSATION_PREVIEW_CARD_CANDIDATE_LIMIT) break;
    const fileType = getConversationPreviewFileType(reference.path);
    if (fileType === null) continue;
    const path = foldKey(reference.path);
    if (enforceBoundary && !insideWorkspace(input.workspacePath, path)) continue;
    const requiresFileChanges = CHANGE_GATED_KINDS.has(reference.kind);
    if (requiresFileChanges && (!changes.active.has(path) || changes.reverted.has(path))) continue;
    if (!gate.accept(path)) continue;
    produced.push(makeCandidate(fileType, reference, input.productTurnId, requiresFileChanges));
  }
  return produced;
}

type TextBuildShape = {
  assistantText: RequiredField<string>;
  productTurnId: RequiredField<string>;
  workspacePath: RequiredField<string>;
  fileChanges: OptionalField<readonly ConversationPreviewFileChange[]>;
};

type TextBuildInput = Expand<TextBuildShape>;

export function buildConversationPreviewArtifactCandidates(input: TextBuildInput) {
  const { assistantText, productTurnId, workspacePath, fileChanges } = input;
  const references = extractConversationPreviewFileReferences(assistantText, workspacePath);
  const candidates = buildConversationPreviewArtifactCandidatesFromReferences({
    references,
    productTurnId,
    workspacePath,
    fileChanges,
  });
  return candidates;
}
