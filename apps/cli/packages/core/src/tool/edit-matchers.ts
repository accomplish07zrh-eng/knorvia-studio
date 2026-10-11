// SPDX-License-Identifier: Apache-2.0
// 编辑匹配：把 search 文本在 content 里定位，按固定顺序尝试多套策略。
//
// 顺序（先精确后宽松）：exact → quote_normalized → line_number_prefix_stripped →
// escape_normalized → unicode_escape_normalized → line_trimmed → indentation_flexible → block_anchor。
// 同一策略命中多处且文本不同 → ambiguous；`replaceAll` 不做宽松阶段（B36）。
// 规范见 specs/knorvia-edit-matchers.md；行为口径见本包 behavior.md B36–B39、B43。

import { editLineDistance } from "./edit-match-distance.js";
import * as editText from "./edit-match-text.js";

// 策略清单是唯一事实来源：类型从它派生，新增策略只改这一处。
const EDIT_MATCH_STRATEGIES = [
  "exact",
  "quote_normalized",
  "line_number_prefix_stripped",
  "escape_normalized",
  "unicode_escape_normalized",
  "line_trimmed",
  "indentation_flexible",
  "block_anchor",
] as const;

type EditMatchStrategy = (typeof EDIT_MATCH_STRATEGIES)[number];

interface MatchedEdit {
  status: "matched";
  actualString: string;
  strategy: EditMatchStrategy;
  candidateCount: number;
}

interface AmbiguousEdit {
  status: "ambiguous";
  strategy: EditMatchStrategy;
  candidateCount: number;
}

interface MissingEdit {
  status: "not_found";
}

type EditMatchResult = MatchedEdit | AmbiguousEdit | MissingEdit;

const NOT_FOUND: MissingEdit = { status: "not_found" };

/** 块锚点策略要求首尾行之外的平均相似度达到这个值。 */
const BLOCK_ANCHOR_MIN_SIMILARITY = 0.8;

interface CandidateSpans {
  readonly count: number;
  readonly first: string;
  readonly varied: boolean;
}

// 命中累积：保留全部命中文本，再从中导出「首个」与「是否不一致」。
function tallySpans(
  haystack: string,
  needle: string,
  projectHit?: (start: number) => string,
): CandidateSpans {
  const hits: string[] = [];
  if (needle.length > 0) {
    let cursor = haystack.indexOf(needle);
    while (cursor >= 0) {
      hits.push(projectHit ? projectHit(cursor) : needle);
      cursor = haystack.indexOf(needle, cursor + needle.length);
    }
  }
  const first = hits.length > 0 ? hits[0]! : "";
  return { count: hits.length, first, varied: hits.some((hit) => hit !== first) };
}

function toResult(strategy: EditMatchStrategy, spans: CandidateSpans): EditMatchResult {
  return spans.varied
    ? { status: "ambiguous", strategy, candidateCount: spans.count }
    : { status: "matched", actualString: spans.first, strategy, candidateCount: spans.count };
}

interface LineIndex {
  readonly lines: readonly string[];
  readonly trimmed: readonly string[];
  /** 每行首字符在原文里的偏移。 */
  readonly offsets: readonly number[];
}

function indexLines(content: string): LineIndex {
  const lines = content.split("\n");
  const offsets: number[] = [];
  let cursorOffset = 0;
  for (const line of lines) {
    offsets.push(cursorOffset);
    cursorOffset = cursorOffset + line.length + 1;
  }
  return { lines, trimmed: lines.map((line) => line.trim()), offsets };
}

function leadingWhitespaceWidth(line: string): number {
  let width = 0;
  while (width < line.length && (line[width] === " " || line[width] === "\t")) width += 1;
  return width;
}

// 去掉整块共有的最小缩进；全空行与空块保持原样。
function dedentBlock(lines: readonly string[], start: number, length: number): string[] {
  let shared = Number.POSITIVE_INFINITY;
  for (let index = start; index < start + length; index += 1) {
    const line = lines[index]!;
    if (line.trim().length === 0) continue;
    shared = Math.min(shared, leadingWhitespaceWidth(line));
  }
  const dedented: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const sourceLine = lines[start + index]!;
    const blank = sourceLine.trim().length === 0;
    dedented.push(
      blank || shared === Number.POSITIVE_INFINITY ? sourceLine : sourceLine.slice(shared),
    );
  }
  return dedented;
}

// 首尾行之外的逐行相似度均值（按较长行归一）。
function blockSimilarity(
  actual: readonly string[],
  expected: readonly string[],
  start: number,
): number {
  let total = 0;
  for (let index = 1; index < expected.length - 1; index += 1) {
    const actualLine = actual[start + index]!;
    const expectedLine = expected[index]!;
    const longest = Math.max(actualLine.length, expectedLine.length);
    total +=
      actualLine === expectedLine || longest === 0
        ? 1
        : 1 - editLineDistance(actualLine, expectedLine) / longest;
  }
  return total / (expected.length - 2);
}

type SpanScanner = (
  index: LineIndex,
  target: readonly string[],
  trimmed: readonly string[],
) => number[];

function scanTrimmedLines(
  index: LineIndex,
  target: readonly string[],
  trimmed: readonly string[],
): number[] {
  const starts: number[] = [];
  for (let start = 0; start + target.length <= index.lines.length; start += 1) {
    if (trimmed.every((line, offset) => line === index.trimmed[start + offset])) starts.push(start);
  }
  return starts;
}

function scanIndentFlexible(
  index: LineIndex,
  target: readonly string[],
  _trimmed: readonly string[],
): number[] {
  const wanted = dedentBlock(target, 0, target.length);
  const starts: number[] = [];
  for (let start = 0; start + target.length <= index.lines.length; start += 1) {
    const window = dedentBlock(index.lines, start, target.length);
    if (wanted.every((line, offset) => line === window[offset])) starts.push(start);
  }
  return starts;
}

function scanBlockAnchor(
  index: LineIndex,
  target: readonly string[],
  trimmed: readonly string[],
): number[] {
  const head = trimmed[0]!;
  const tail = trimmed[trimmed.length - 1]!;
  const starts: number[] = [];
  for (let start = 0; start + target.length <= index.lines.length; start += 1) {
    if (index.trimmed[start] !== head) continue;
    if (index.trimmed[start + target.length - 1] !== tail) continue;
    if (blockSimilarity(index.trimmed, trimmed, start) >= BLOCK_ANCHOR_MIN_SIMILARITY) {
      starts.push(start);
    }
  }
  return starts;
}

interface BroadStage {
  readonly strategy: EditMatchStrategy;
  /** 目标行数低于该值时跳过这一阶段。 */
  readonly minimumLines: number;
  readonly scan: SpanScanner;
}

const BROAD_STAGES: readonly BroadStage[] = [
  { strategy: "line_trimmed", minimumLines: 1, scan: scanTrimmedLines },
  { strategy: "indentation_flexible", minimumLines: 2, scan: scanIndentFlexible },
  { strategy: "block_anchor", minimumLines: 3, scan: scanBlockAnchor },
];

function matchByBroadStages(content: string, search: string): EditMatchResult {
  const index = indexLines(content);
  const targetLines = search.split("\n");
  if (targetLines.at(-1) === "") targetLines.pop();
  if (targetLines.length === 0) return NOT_FOUND;
  const trimmedTarget = targetLines.map((line) => line.trim());

  for (const stage of BROAD_STAGES) {
    if (targetLines.length < stage.minimumLines) continue;
    const starts = stage.scan(index, targetLines, trimmedTarget);
    if (starts.length === 0) continue;
    const texts = starts.map((start) => {
      const lastLine = start + targetLines.length - 1;
      return content.slice(
        index.offsets[start]!,
        index.offsets[lastLine]! + index.lines[lastLine]!.length,
      );
    });
    const first = texts[0]!;
    return toResult(stage.strategy, {
      count: texts.length,
      first,
      varied: texts.some((text) => text !== first),
    });
  }
  return NOT_FOUND;
}

// 转义类策略：search 先按各自规则展开，再在原文里找展开后的文本。
const TRANSFORM_STRATEGIES: readonly [EditMatchStrategy, (value: string) => string | undefined][] =
  [
    ["line_number_prefix_stripped", editText.stripReadNumbers],
    ["escape_normalized", editText.visibleCharacters],
    ["unicode_escape_normalized", editText.unicodeCharacters],
  ];

interface EditMatchInput {
  content: string;
  search: string;
  replaceAll: boolean;
}

export function findEditMatch(input: EditMatchInput): EditMatchResult {
  const { content, search, replaceAll } = input;

  const exact = tallySpans(content, search);
  if (exact.count > 0) return toResult("exact", exact);

  // 空 search 在引号归一阶段匹配所有边界（旧规则），这里保持同一结果。
  if (search.length === 0) {
    return toResult("quote_normalized", { count: content.length + 1, first: "", varied: false });
  }

  const quoted = tallySpans(editText.plainQuotes(content), editText.plainQuotes(search), (start) =>
    content.slice(start, start + search.length),
  );
  if (quoted.count > 0) return toResult("quote_normalized", quoted);

  for (const [strategy, transform] of TRANSFORM_STRATEGIES) {
    const needle = transform(search);
    if (needle === undefined || needle === search) continue;
    const found = tallySpans(content, needle);
    if (found.count > 0) return toResult(strategy, found);
  }

  return replaceAll ? NOT_FOUND : matchByBroadStages(content, search);
}

export function normalizeLineEndings(content: string): string {
  return content.replaceAll("\r\n", "\n");
}

export function normalizeReplacementForMatch(
  strategy: EditMatchStrategy,
  newString: string,
): string {
  return strategy === "escape_normalized" ? editText.visibleCharacters(newString) : newString;
}

export function preserveQuoteStyle(
  oldString: string,
  actualOldString: string,
  newString: string,
): string {
  return oldString === actualOldString
    ? newString
    : editText.restoreQuotes(actualOldString, newString);
}
