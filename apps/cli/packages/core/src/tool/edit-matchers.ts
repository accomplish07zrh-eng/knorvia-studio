// Streaming Edit candidate selection; specs/knorvia-edit-matchers.md.
// Behaviour was observed from prior code; licence/source clearance remains separate.
import { editLineDistance } from "./edit-match-distance.js";
import {
  plainQuotes,
  restoreQuotes,
  stripReadNumbers,
  unicodeCharacters,
  visibleCharacters,
} from "./edit-match-text.js";

type EditMatchStrategy =
  | "exact"
  | "quote_normalized"
  | "line_number_prefix_stripped"
  | "escape_normalized"
  | "unicode_escape_normalized"
  | "line_trimmed"
  | "indentation_flexible"
  | "block_anchor";
type EditMatchResult =
  | { status: "matched"; actualString: string; strategy: EditMatchStrategy; candidateCount: number }
  | { status: "ambiguous"; strategy: EditMatchStrategy; candidateCount: number }
  | { status: "not_found" };
interface Summary {
  count: number;
  first: string;
  diverse: boolean;
}
const fresh = (): Summary => ({ count: 0, first: "", diverse: false });
const ANCHOR_SIMILARITY = 0.8;

function include(summary: Summary, value: () => string): void {
  summary.count++;
  if (summary.count === 1) summary.first = value();
  else if (!summary.diverse && summary.first !== value()) summary.diverse = true;
}
function project(strategy: EditMatchStrategy, summary: Summary): EditMatchResult {
  return summary.diverse
    ? { status: "ambiguous", strategy, candidateCount: summary.count }
    : { status: "matched", actualString: summary.first, strategy, candidateCount: summary.count };
}
function occurrences(content: string, needle: string, actual?: string): Summary {
  const result = fresh();
  if (!needle.length) return result;
  for (let cursor = 0; cursor <= content.length; ) {
    const found = content.indexOf(needle, cursor);
    if (found < 0) break;
    include(result, () =>
      actual === undefined ? needle : actual.slice(found, found + needle.length),
    );
    cursor = found + needle.length;
  }
  return result;
}

interface LineView {
  raw: string[];
  trimmed: string[];
  starts: number[];
}
function linesOf(content: string): LineView {
  const raw = content.split("\n");
  let offset = 0;
  return {
    raw,
    trimmed: raw.map((line) => line.trim()),
    starts: raw.map((line) => {
      const start = offset;
      offset += line.length + 1;
      return start;
    }),
  };
}
function withoutIndent(lines: string[], start: number, length: number): string[] {
  let indent = Infinity;
  for (let i = start; i < start + length; i++) {
    if (!lines[i]!.trim().length) continue;
    let count = 0;
    while (lines[i]![count] === " " || lines[i]![count] === "\t") count++;
    indent = Math.min(indent, count);
  }
  return Array.from({ length }, (_, index) => {
    const line = lines[start + index]!;
    return indent === Infinity || !line.trim().length ? line : line.slice(indent);
  });
}
function middleScore(actual: string[], expected: string[], start: number): number {
  let sum = 0;
  for (let index = 1; index < expected.length - 1; index++) {
    const left = actual[start + index]!,
      right = expected[index]!;
    const width = Math.max(left.length, right.length);
    sum += left === right || width === 0 ? 1 : 1 - editLineDistance(left, right) / width;
  }
  return sum / (expected.length - 2);
}
function broadCandidates(content: string, search: string): EditMatchResult {
  const source = linesOf(content);
  const target = search.split("\n");
  if (target[target.length - 1] === "") target.pop();
  if (!target.length) return { status: "not_found" };
  const trimmed = target.map((line) => line.trim());
  const stages = ["line_trimmed", "indentation_flexible", "block_anchor"] as const;
  for (const stage of stages) {
    if (stage === "indentation_flexible" && target.length < 2) continue;
    if (stage === "block_anchor" && target.length < 3) continue;
    const normalized =
      stage === "indentation_flexible" ? withoutIndent(target, 0, target.length) : [];
    const found = fresh();
    for (let start = 0; start + target.length <= source.raw.length; start++) {
      let matches: boolean;
      if (stage === "line_trimmed")
        matches = trimmed.every((line, offset) => line === source.trimmed[start + offset]);
      else if (stage === "indentation_flexible")
        matches = withoutIndent(source.raw, start, target.length).every(
          (line, offset) => line === normalized[offset],
        );
      else
        matches =
          source.trimmed[start] === trimmed[0] &&
          source.trimmed[start + target.length - 1] === trimmed[trimmed.length - 1] &&
          middleScore(source.trimmed, trimmed, start) >= ANCHOR_SIMILARITY;
      if (matches)
        include(found, () => {
          const end = start + target.length - 1;
          return content.slice(
            source.starts[start]!,
            source.starts[end]! + source.raw[end]!.length,
          );
        });
    }
    if (found.count) return project(stage, found);
  }
  return { status: "not_found" };
}

export function findEditMatch(input: {
  content: string;
  search: string;
  replaceAll: boolean;
}): EditMatchResult {
  const exact = occurrences(input.content, input.search);
  if (exact.count) return project("exact", exact);
  // 旧规则的空search会在引号归一阶段匹配所有边界；不改成新的失败行为。
  if (!input.search.length)
    return project("quote_normalized", {
      count: input.content.length + 1,
      first: "",
      diverse: false,
    });
  const quoted = occurrences(plainQuotes(input.content), plainQuotes(input.search), input.content);
  if (quoted.count) return project("quote_normalized", quoted);
  const transforms: [EditMatchStrategy, (value: string) => string | undefined][] = [
    ["line_number_prefix_stripped", stripReadNumbers],
    ["escape_normalized", visibleCharacters],
    ["unicode_escape_normalized", unicodeCharacters],
  ];
  for (const [strategy, transform] of transforms) {
    const candidate = transform(input.search);
    if (candidate === undefined || candidate === input.search) continue;
    const found = occurrences(input.content, candidate);
    if (found.count) return project(strategy, found);
  }
  return input.replaceAll ? { status: "not_found" } : broadCandidates(input.content, input.search);
}
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n");
}
export function normalizeReplacementForMatch(
  strategy: EditMatchStrategy,
  newString: string,
): string {
  return strategy === "escape_normalized" ? visibleCharacters(newString) : newString;
}
export function preserveQuoteStyle(
  oldString: string,
  actualOldString: string,
  newString: string,
): string {
  return oldString === actualOldString ? newString : restoreQuotes(actualOldString, newString);
}
