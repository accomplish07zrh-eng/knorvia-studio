// SPDX-License-Identifier: Apache-2.0
// 文本搜索的行匹配：多行/单行两条路径、上下文窗口与片段切分。
import type { FileSystemSearchTextEntry, FileSystemSearchTextRequest } from "@knorvia/contracts";

type Span = { start: number; end: number };
type Fragment = FileSystemSearchTextEntry;
type Request = FileSystemSearchTextRequest;

export interface LineMatches {
  matchCount: number;
  entries: FileSystemSearchTextEntry[];
}

/** 逐行匹配的累积器：计数、命中区间、逐行片段与「原样输出」条目。 */
interface MatchAccumulator {
  fragmentsByLine: Map<number, Fragment[]>;
  hits: number;
  hitRanges: Span[];
  rawEntries: Fragment[];
}

function accumulator(): MatchAccumulator {
  return { fragmentsByLine: new Map(), hits: 0, hitRanges: [], rawEntries: [] };
}

interface EntryInput {
  lineNumber: number | undefined;
  matched: boolean;
  path: string;
  text: string;
}

/** 条目构造：`lineNumber` 键必须存在（值可为 undefined），因此用赋值而不是字面量。 */
function entry(input: EntryInput): Fragment {
  const record = { path: input.path, text: input.text, matched: input.matched } as Fragment;
  record.lineNumber = input.lineNumber;
  return record;
}

export function matchingFragments(path: string, text: string, lineNumber?: number): Fragment[] {
  if (text.length === 0) return [entry({ lineNumber, matched: true, path, text: "" })];
  const fragments: Fragment[] = [];
  for (const [index, fragment] of text.split(/\r?\n/u).entries()) {
    if (fragment.length === 0) continue;
    const at = lineNumber === undefined ? undefined : lineNumber + index;
    fragments.push(entry({ lineNumber: at, matched: true, path, text: fragment }));
  }
  return fragments;
}

/** 行首偏移表：一次扫描建表，之后用二分查行号（旧实现按前缀重复扫字符）。 */
class LineStarts {
  private readonly offsets = [0];

  constructor(content: string) {
    let found = content.indexOf("\n");
    while (found !== -1) {
      this.offsets.push(found + 1);
      found = content.indexOf("\n", found + 1);
    }
  }

  /** 二分找最后一个不超过 index 的行首，返回其行号。 */
  lineOf(index: number): number {
    let low = 0;
    let high = this.offsets.length;
    while (low < high) {
      const pivot = (low + high) >>> 1;
      if (this.offsets[pivot]! <= index) low = pivot + 1;
      else high = pivot;
    }
    return low;
  }
}

interface ContextInput {
  length: number;
  request: Request;
  spans: Span[];
}

/** 需要输出的行下标：每个命中区间按 before/after 展开后去重排序。 */
function contextIndexes(input: ContextInput): number[] {
  const collected = new Set<number>();
  const before = input.request.beforeContext ?? input.request.context ?? 0;
  const after = input.request.afterContext ?? input.request.context ?? 0;
  for (const span of input.spans) {
    const last = Math.min(input.length - 1, span.end + after);
    for (let at = Math.max(0, span.start - before); at <= last; at += 1) collected.add(at);
  }
  return [...collected].sort((left, right) => left - right);
}

function globalPattern(pattern: RegExp, flags: string): RegExp {
  return new RegExp(pattern.source, (pattern.ignoreCase ? "i" : "") + flags);
}

interface CollectInput {
  acc: MatchAccumulator;
  content: string;
  pattern: RegExp;
  path: string;
  request: Request;
}

/** 多行路径：整篇内容上匹配，命中区间按行号换算。 */
function collectMultiline(input: CollectInput): void {
  const { acc, pattern, request } = input;
  const starts = new LineStarts(input.content);
  for (const match of input.content.matchAll(globalPattern(pattern, "gs"))) {
    const start = match.index ?? 0;
    const lineNumber = starts.lineOf(start);
    acc.hits += 1;
    const verbatimOnly = !request.onlyMatching;
    if (verbatimOnly) {
      const firstLine = match[0].split(/\r?\n/u, 1)[0] ?? "";
      acc.rawEntries.push(entry({ lineNumber, matched: true, path: input.path, text: firstLine }));
      continue;
    }
    const range = { end: starts.lineOf(Math.max(start, start + match[0].length - 1)) - 1 } as Span;
    range.start = lineNumber - 1;
    acc.hitRanges.push(range);
    for (const fragment of matchingFragments(input.path, match[0], lineNumber)) {
      const line = (fragment.lineNumber ?? lineNumber) - 1;
      const existing = acc.fragmentsByLine.get(line);
      if (existing === undefined) acc.fragmentsByLine.set(line, [fragment]);
      else existing.push(fragment);
    }
  }
}

/** 单行路径：逐行匹配，只统计命中行并（可选）收集片段。 */
function collectPerLine(input: CollectInput, rows: string[]): void {
  const { acc, pattern, request } = input;
  for (const [line, text] of rows.entries()) {
    if (request.onlyMatching) {
      const fragments = [...text.matchAll(globalPattern(pattern, "g"))].flatMap((match) =>
        matchingFragments(input.path, match[0], line + 1),
      );
      if (fragments.length === 0) continue;
      acc.fragmentsByLine.set(line, fragments);
    } else {
      pattern.lastIndex = 0;
      if (!pattern.test(text)) continue;
    }
    acc.hits += 1;
    acc.hitRanges.push({ end: line, start: line });
  }
}

export function matchContent(
  path: string,
  content: string,
  regex: RegExp,
  request: Request,
): LineMatches {
  const rows = content.length === 0 ? [] : content.replace(/\r?\n$/u, "").split(/\r?\n/u);
  const acc = accumulator();
  const shared: CollectInput = { acc, content, pattern: regex, path, request };
  if (request.multiline) {
    collectMultiline(shared);
    if (!request.onlyMatching) return { entries: acc.rawEntries, matchCount: acc.hits };
  } else {
    collectPerLine(shared, rows);
  }

  const matchedLines = new Set<number>();
  for (const range of acc.hitRanges) {
    for (let line = range.start; line <= range.end; line += 1) matchedLines.add(line);
  }

  const entries: Fragment[] = [];
  for (const line of contextIndexes({ length: rows.length, request, spans: acc.hitRanges })) {
    if (request.onlyMatching) {
      const fragments = acc.fragmentsByLine.get(line);
      if (fragments !== undefined) {
        entries.push(...fragments);
        continue;
      }
      if (matchedLines.has(line)) continue;
    }
    const matched = request.onlyMatching ? false : matchedLines.has(line);
    entries.push(entry({ lineNumber: line + 1, matched, path, text: rows[line] ?? "" }));
  }
  return { entries, matchCount: acc.hits };
}
