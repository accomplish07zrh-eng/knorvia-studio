// SPDX-License-Identifier: Apache-2.0
// Modified for Knorvia Studio: B2 citation projection policies, 2026-09-30.
// Prior source was reviewed; authorship/license review remains pending.
import {
  extractAssistantDirectives,
  findAssistantDirectivePrefixStart,
  findMarkdownCodeRanges,
  findUnclosedAssistantDirectiveStart,
} from "@/lib/assistantDirectiveParser.js";

type KnorviaFileCitationPreviewKind = "docx" | "xlsx" | "pptx" | "pdf" | "video" | "audio";

interface KnorviaFileCitation {
  artifactKind?: string;
  end: number;
  path: string;
  purpose?: string;
  raw: string;
  start: number;
}

interface KnorviaFileCitationDirective {
  artifactKind?: string;
  end: number;
  path?: string;
  purpose?: string;
  raw: string;
  start: number;
}

interface KnorviaFileCitationProjection {
  visibleText: string;
}

// 新输出用 Knorvia；保留旧字面量读取已保存会话，不能迁移消息正文。
export const FILE_CITATION_DIRECTIVE_NAMES = [
  "knorvia-file-citation",
  "zcode-file-citation",
] as const;

const grammar = { allowSingleColon: true, allowSmartQuotes: true, allowTripleColon: true } as const;
const prefixPolicy = {
  minimumSingleColonPrefixLength: 6,
  singleColonDirectiveNames: FILE_CITATION_DIRECTIVE_NAMES,
  tripleColonDirectiveNames: FILE_CITATION_DIRECTIVE_NAMES,
};

type ParsedDirective = ReturnType<typeof extractAssistantDirectives>[number];

function projectDirective(directive: ParsedDirective): KnorviaFileCitationDirective {
  const parameters = directive.parameters;
  const path = parameters?.path?.trim();
  return {
    start: directive.start,
    end: directive.end,
    raw: directive.raw,
    ...(path ? { path } : {}),
    ...(parameters?.purpose !== undefined ? { purpose: parameters.purpose } : {}),
    ...(parameters?.artifact_kind !== undefined ? { artifactKind: parameters.artifact_kind } : {}),
  };
}

export function extractKnorviaFileCitationDirectives(
  content: string,
): KnorviaFileCitationDirective[] {
  const records: ParsedDirective[] = [];
  FILE_CITATION_DIRECTIVE_NAMES.forEach((name) => {
    for (const directive of extractAssistantDirectives(content, name, grammar)) {
      records.push(directive);
    }
  });
  records.sort((left, right) => left.start - right.start);
  return records.map(projectDirective);
}

export function extractKnorviaFileCitations(content: string): KnorviaFileCitation[] {
  const result: KnorviaFileCitation[] = [];
  for (const directive of extractKnorviaFileCitationDirectives(content)) {
    if (directive.path) result.push({ ...directive, path: directive.path });
  }
  return result;
}

function streamingCut(content: string): number | null {
  const codeRanges = findMarkdownCodeRanges(content);
  let cut: number | null = null;
  FILE_CITATION_DIRECTIVE_NAMES.forEach((name) => {
    const start = findUnclosedAssistantDirectiveStart(content, name, codeRanges, grammar);
    if (start !== null) cut = cut === null ? start : Math.min(cut, start);
  });
  // 未闭合引用优先于名称前缀；完整引用仍交给 remark owner，不在此删除。
  return (
    cut ??
    findAssistantDirectivePrefixStart(
      content,
      ["code-comment", ...FILE_CITATION_DIRECTIVE_NAMES],
      codeRanges,
      prefixPolicy,
    )
  );
}

export function projectKnorviaFileCitations(
  content: string,
  options: { streaming: boolean },
): KnorviaFileCitationProjection {
  if (!options.streaming || !content) return { visibleText: content };
  const cut = streamingCut(content);
  return { visibleText: cut === null ? content : content.slice(0, cut) };
}

const previewPolicies: ReadonlyArray<{
  kind: KnorviaFileCitationPreviewKind;
  extensions: readonly string[];
  artifactKind?: string;
}> = [
  { kind: "docx", extensions: ["docx"], artifactKind: "document" },
  { kind: "xlsx", extensions: ["xlsx"], artifactKind: "workbook" },
  { kind: "pptx", extensions: ["pptx"], artifactKind: "presentation" },
  { kind: "pdf", extensions: ["pdf"] },
  { kind: "video", extensions: ["m4v", "mov", "mp4", "webm"], artifactKind: "video" },
  {
    kind: "audio",
    extensions: ["flac", "m4a", "mp3", "ogg", "opus", "wav", "weba"],
    artifactKind: "audio",
  },
];
const extensionKinds = new Map(
  previewPolicies.flatMap(({ kind, extensions }) =>
    extensions.map((extension) => [extension, kind] as const),
  ),
);
const artifactKinds = new Map(
  previewPolicies.flatMap(({ kind, artifactKind }) =>
    artifactKind === undefined ? [] : [[artifactKind, kind] as const],
  ),
);

export function resolveKnorviaFileCitationPreviewKind(params: {
  artifactKind?: string;
  path: string;
}): KnorviaFileCitationPreviewKind | null {
  const path = params.path.trim().toLowerCase();
  const dot = path.lastIndexOf(".");
  const inferred = dot < 0 ? null : (extensionKinds.get(path.slice(dot + 1)) ?? null);
  if (params.artifactKind === undefined) return inferred;
  const declared = artifactKinds.get(params.artifactKind.trim().toLowerCase());
  return declared !== undefined && declared === inferred ? declared : null;
}
