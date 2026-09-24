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

const ARTIFACT_KIND_TO_PREVIEW_KIND: Readonly<
  Record<string, Exclude<KnorviaFileCitationPreviewKind, "pdf">>
> = {
  audio: "audio",
  document: "docx",
  presentation: "pptx",
  video: "video",
  workbook: "xlsx",
};
const PREVIEW_EXTENSION_TO_KIND: Readonly<Record<string, KnorviaFileCitationPreviewKind>> = {
  ".docx": "docx",
  ".flac": "audio",
  ".m4a": "audio",
  ".m4v": "video",
  ".mov": "video",
  ".mp3": "audio",
  ".mp4": "video",
  ".ogg": "audio",
  ".opus": "audio",
  ".pdf": "pdf",
  ".pptx": "pptx",
  ".xlsx": "xlsx",
  ".wav": "audio",
  ".webm": "video",
  ".weba": "audio",
};
export const FILE_CITATION_DIRECTIVE_NAMES = [
  "knorvia-file-citation",
  // 旧会话中保存的指令名。改名会让历史消息里的引用无法再被解析，
  // 因此这里必须保留上游字面量作为读取兼容分支（见 specs/knorvia-builtin-plugins.md 的身份归一规则）。
  "zcode-file-citation",
] as const;
const KNORVIA_FILE_CITATION_SINGLE_COLON_PREFIX_LENGTH = 6;
const KNORVIA_FILE_CITATION_SYNTAX = {
  allowSingleColon: true,
  allowSmartQuotes: true,
  allowTripleColon: true,
} as const;

export function extractKnorviaFileCitationDirectives(content: string): KnorviaFileCitationDirective[] {
  return FILE_CITATION_DIRECTIVE_NAMES.flatMap((name) =>
    extractAssistantDirectives(content, name, KNORVIA_FILE_CITATION_SYNTAX),
  )
    .sort((left, right) => left.start - right.start)
    .map((directive) => ({
      start: directive.start,
      end: directive.end,
      raw: directive.raw,
      ...(directive.parameters?.path?.trim() ? { path: directive.parameters.path.trim() } : {}),
      ...(directive.parameters?.purpose !== undefined
        ? { purpose: directive.parameters.purpose }
        : {}),
      ...(directive.parameters?.artifact_kind !== undefined
        ? { artifactKind: directive.parameters.artifact_kind }
        : {}),
    }));
}

export function extractKnorviaFileCitations(content: string): KnorviaFileCitation[] {
  return extractKnorviaFileCitationDirectives(content).flatMap((directive) =>
    directive.path
      ? [
          {
            ...directive,
            path: directive.path,
          },
        ]
      : [],
  );
}

/**
 * 仅在流式尾部隐藏未闭合 citation。完整 citation 继续交给 remark 插件投影为正文链接，
 * 卡片是否生成仍由终态 row gate 决定。异常模型输出若已换行继续正文，则保留原文，避免
 * 一个缺失 `}` 的指令把后续回答全部吞掉；代码块中的协议样例也不参与隐藏。
 */
export function projectKnorviaFileCitations(
  content: string,
  options: { streaming: boolean },
): KnorviaFileCitationProjection {
  if (!options.streaming || !content) return { visibleText: content };

  const protectedRanges = findMarkdownCodeRanges(content);
  const unclosedStarts = FILE_CITATION_DIRECTIVE_NAMES.flatMap((name) => {
    const start = findUnclosedAssistantDirectiveStart(
      content,
      name,
      protectedRanges,
      KNORVIA_FILE_CITATION_SYNTAX,
    );
    return start === null ? [] : [start];
  });
  const unclosedStart = unclosedStarts.length === 0 ? null : Math.min(...unclosedStarts);
  if (unclosedStart === null) {
    const prefixStart = findAssistantDirectivePrefixStart(
      content,
      ["code-comment", ...FILE_CITATION_DIRECTIVE_NAMES],
      protectedRanges,
      {
        minimumSingleColonPrefixLength: KNORVIA_FILE_CITATION_SINGLE_COLON_PREFIX_LENGTH,
        singleColonDirectiveNames: FILE_CITATION_DIRECTIVE_NAMES,
        tripleColonDirectiveNames: FILE_CITATION_DIRECTIVE_NAMES,
      },
    );
    return prefixStart === null
      ? { visibleText: content }
      : { visibleText: content.slice(0, prefixStart) };
  }

  return {
    visibleText: content.slice(0, unclosedStart),
  };
}

function inferPreviewKindFromPath(path: string): KnorviaFileCitationPreviewKind | null {
  const normalizedPath = path.trim().toLowerCase();
  for (const [extension, kind] of Object.entries(PREVIEW_EXTENSION_TO_KIND)) {
    if (normalizedPath.endsWith(extension)) return kind;
  }
  return null;
}

export function resolveKnorviaFileCitationPreviewKind(params: {
  artifactKind?: string;
  path: string;
}): KnorviaFileCitationPreviewKind | null {
  const inferredKind = inferPreviewKindFromPath(params.path);
  if (params.artifactKind === undefined) return inferredKind;

  const artifactKind = ARTIFACT_KIND_TO_PREVIEW_KIND[params.artifactKind.trim().toLowerCase()];
  return artifactKind && artifactKind === inferredKind ? artifactKind : null;
}
