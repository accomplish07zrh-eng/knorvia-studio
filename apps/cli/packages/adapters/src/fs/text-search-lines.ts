import type { FileSystemSearchTextEntry, FileSystemSearchTextRequest } from "@knorvia/contracts";

type Span = { start: number; end: number };
export interface LineMatches {
  matchCount: number;
  entries: FileSystemSearchTextEntry[];
}
export function matchingFragments(
  path: string,
  text: string,
  lineNumber?: number,
): FileSystemSearchTextEntry[] {
  if (text.length === 0) return [{ path, lineNumber, text: "", matched: true }];
  const result: FileSystemSearchTextEntry[] = [];
  for (const [index, fragment] of text.split(/\r?\n/).entries()) {
    if (fragment.length)
      result.push({
        path,
        lineNumber: lineNumber === undefined ? undefined : lineNumber + index,
        text: fragment,
        matched: true,
      });
  }
  return result;
}

/** 行首只扫描一次；旧前缀计数在大量 multiline match 时重复读取同一字符。 */
class LineStarts {
  private readonly starts = [0];
  constructor(content: string) {
    for (let i = 0; i < content.length; i++)
      if (content.charCodeAt(i) === 10) this.starts.push(i + 1);
  }
  number(index: number): number {
    let lower = 0,
      upper = this.starts.length;
    while (lower < upper) {
      const middle = (lower + upper) >>> 1;
      if (this.starts[middle]! <= index) lower = middle + 1;
      else upper = middle;
    }
    return lower;
  }
}

function contextIndexes(
  length: number,
  spans: Span[],
  request: FileSystemSearchTextRequest,
): number[] {
  const result = new Set<number>();
  const before = request.beforeContext ?? request.context ?? 0;
  const after = request.afterContext ?? request.context ?? 0;
  for (const span of spans) {
    const end = Math.min(length - 1, span.end + after);
    for (let index = Math.max(0, span.start - before); index <= end; index++) result.add(index);
  }
  return [...result].sort((a, b) => a - b);
}

export function matchContent(
  path: string,
  content: string,
  regex: RegExp,
  request: FileSystemSearchTextRequest,
): LineMatches {
  const lines = content.length ? content.replace(/\r?\n$/, "").split(/\r?\n/) : [];
  const spans: Span[] = [];
  const byLine = new Map<number, FileSystemSearchTextEntry[]>();
  const raw: FileSystemSearchTextEntry[] = [];
  let matchCount = 0;
  if (request.multiline) {
    const index = new LineStarts(content);
    const global = new RegExp(regex.source, (regex.ignoreCase ? "i" : "") + "gs");
    for (const match of content.matchAll(global)) {
      const start = match.index ?? 0,
        lineNumber = index.number(start);
      matchCount++;
      if (!request.onlyMatching) {
        raw.push({ path, lineNumber, text: match[0].split(/\r?\n/, 1)[0] ?? "", matched: true });
        continue;
      }
      spans.push({
        start: lineNumber - 1,
        end: index.number(Math.max(start, start + match[0].length - 1)) - 1,
      });
      for (const entry of matchingFragments(path, match[0], lineNumber)) {
        const line = (entry.lineNumber ?? lineNumber) - 1;
        if (!byLine.has(line)) byLine.set(line, []);
        byLine.get(line)!.push(entry);
      }
    }
    if (!request.onlyMatching) return { matchCount, entries: raw };
  } else {
    const global = new RegExp(regex.source, (regex.ignoreCase ? "i" : "") + "g");
    for (const [line, text] of lines.entries()) {
      if (request.onlyMatching) {
        const fragments: FileSystemSearchTextEntry[] = [];
        global.lastIndex = 0;
        for (const match of text.matchAll(global))
          fragments.push(...matchingFragments(path, match[0], line + 1));
        if (!fragments.length) continue;
        byLine.set(line, fragments);
      } else {
        regex.lastIndex = 0;
        if (!regex.test(text)) continue;
      }
      matchCount++;
      spans.push({ start: line, end: line });
    }
  }
  const matched = new Set<number>();
  for (const span of spans) for (let line = span.start; line <= span.end; line++) matched.add(line);
  const entries: FileSystemSearchTextEntry[] = [];
  for (const line of contextIndexes(lines.length, spans, request)) {
    if (request.onlyMatching) {
      const fragments = byLine.get(line);
      if (fragments) {
        entries.push(...fragments);
        continue;
      }
      if (matched.has(line)) continue;
    }
    entries.push({
      path,
      lineNumber: line + 1,
      text: lines[line] ?? "",
      matched: request.onlyMatching ? false : matched.has(line),
    });
  }
  return { matchCount, entries };
}
