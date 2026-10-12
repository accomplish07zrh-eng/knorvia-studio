// SPDX-License-Identifier: Apache-2.0
// 文本搜索的行匹配：多行/单行两条路径、上下文窗口与片段切分。
import type { FileSystemSearchTextEntry, FileSystemSearchTextRequest } from "@knorvia/contracts";

type Span = { start: number; end: number };

export interface LineMatches {
  matchCount: number;
  entries: FileSystemSearchTextEntry[];
}

/** 单行匹配结果：计数 + 命中区间 + 逐行片段。 */
interface MatchAccumulator {
  fragmentsByLine: Map<number, FileSystemSearchTextEntry[]>;
  hits: number;
  hitRanges: Span[];
  rawEntries: FileSystemSearchTextEntry[];
}

function accumulator(): MatchAccumulator {
  return { fragmentsByLine: new Map(), hits: 0, hitRanges: [], rawEntries: [] };
}

function entry(
  path: string,
  lineNumber: number | undefined,
  text: string,
  matched: boolean,
): FileSystemSearchTextEntry {
  const result = { path, text, matched } as FileSystemSearchTextEntry;
  result.lineNumber = lineNumber;
  return result;
}

export function matchingFragments(
  path: string,
  text: string,
  lineNumber?: number,
): FileSystemSearchTextEntry[] {
  if (text.length === 0) return [entry(path, lineNumber, "", true)];
  const fragments: FileSystemSearchTextEntry[] = [];
  for (const [index, fragment] of text.split(/\r?\n/u).entries()) {
    if (fragment.length === 0) continue;
    const at = lineNumber === undefined ? undefined : lineNumber + index;
    fragments.push(entry(path, at, fragment, true));
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
  request: FileSystemSearchTextRequest;
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

function globalPattern(regex: RegExp, flags: string): RegExp {
  return new RegExp(regex.source, (regex.ignoreCase ? "i" : "") + flags);
}

/** 多行路径：整篇内容上匹配，命中区间按行号换算。 */
function collectMultiline(
  path: string,
  content: string,
  regex: RegExp,
  request: FileSystemSearchTextRequest,
  acc: MatchAccumulator,
): void {
  const starts = new LineStarts(content);
  for (const match of content.matchAll(globalPattern(regex, "gs"))) {
    const start = match.index ?? 0;
    const lineNumber = starts.lineOf(start);
    acc.hits += 1;
    if (!request.onlyMatching) {
      const firstLine = match[0].split(/\r?\n/u, 1)[0] ?? "";
      acc.rawEntries.push(entry(path, lineNumber, firstLine, true));
      continue;
    }
    acc.hitRanges.push({
      end: starts.lineOf(Math.max(start, start + match[0].length - 1)) - 1,
      start: lineNumber - 1,
    });
    for (const fragment of matchingFragments(path, match[0], lineNumber)) {
      const line = (fragment.lineNumber ?? lineNumber) - 1;
      const existing = acc.fragmentsByLine.get(line);
      if (existing === undefined) acc.fragmentsByLine.set(line, [fragment]);
      else existing.push(fragment);
    }
  }
}

/** 单行路径：逐行匹配，只统计命中行并（可选）收集片段。 */
function collectPerLine(
  path: string,
  rows: string[],
  regex: RegExp,
  request: FileSystemSearchTextRequest,
  acc: MatchAccumulator,
): void {
  for (const [line, text] of rows.entries()) {
    if (request.onlyMatching) {
      const pattern = globalPattern(regex, "g");
      const fragments = [...text.matchAll(pattern)].flatMap((match) =>
        matchingFragments(path, match[0], line + 1),
      );
      if (fragments.length === 0) continue;
      acc.fragmentsByLine.set(line, fragments);
    } else {
      regex.lastIndex = 0;
      if (!regex.test(text)) continue;
    }
    acc.hits += 1;
    acc.hitRanges.push({ end: line, start: line });
  }
}

export function matchContent(
  path: string,
  content: string,
  regex: RegExp,
  request: FileSystemSearchTextRequest,
): LineMatches {
  const rows = content.length === 0 ? [] : content.replace(/\r?\n$/u, "").split(/\r?\n/u);
  const acc = accumulator();
  if (request.multiline) {
    collectMultiline(path, content, regex, request, acc);
    if (!request.onlyMatching) return { entries: acc.rawEntries, matchCount: acc.hits };
  } else {
    collectPerLine(path, rows, regex, request, acc);
  }

  const matchedLines = new Set<number>();
  for (const range of acc.hitRanges) {
    for (let line = range.start; line <= range.end; line += 1) matchedLines.add(line);
  }

  const entries: FileSystemSearchTextEntry[] = [];
  for (const line of contextIndexes({ length: rows.length, request, spans: acc.hitRanges })) {
    if (request.onlyMatching) {
      const fragments = acc.fragmentsByLine.get(line);
      if (fragments !== undefined) {
        entries.push(...fragments);
        continue;
      }
      if (matchedLines.has(line)) continue;
    }
    entries.push(
      entry(
        path,
        line + 1,
        rows[line] ?? "",
        request.onlyMatching ? false : matchedLines.has(line),
      ),
    );
  }
  return { entries, matchCount: acc.hits };
}
