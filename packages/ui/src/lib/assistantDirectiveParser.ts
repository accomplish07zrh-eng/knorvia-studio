// SPDX-License-Identifier: Apache-2.0
// Source-exposed independent candidate, 2026-10-03; prior attribution remains in Git/NOTICE.
interface ParsedAssistantDirective {
  end: number;
  name: string;
  parameters: Readonly<Record<string, string>> | null;
  raw: string;
  start: number;
}

export type AssistantTextRange = readonly [start: number, end: number];

interface AssistantDirectiveSyntaxOptions {
  allowSmartQuotes?: boolean;
  allowSingleColon?: boolean;
  allowTripleColon?: boolean;
}

interface AssistantDirectivePrefixOptions {
  minimumSingleColonPrefixLength?: number;
  singleColonDirectiveNames?: readonly string[];
  tripleColonDirectiveNames?: readonly string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createDirectiveStartPattern(
  directiveName: string,
  options: AssistantDirectiveSyntaxOptions = {},
): RegExp {
  // 单/三冒号只允许现有消费者 opt-in，且拒绝从连续冒号的中间起读。
  return new RegExp(
    `(?<!:):{${options.allowSingleColon ? 1 : 2},${options.allowTripleColon ? 3 : 2}}${escapeRegExp(directiveName)}\\s*\\{`,
    "g",
  );
}

interface DirectiveQuoteState {
  close: string;
  open: string;
}

function getDirectiveQuoteState(
  character: string | undefined,
  options: AssistantDirectiveSyntaxOptions,
): DirectiveQuoteState | null {
  if (character === '"' || character === "'") return { open: character, close: character };
  if (!options.allowSmartQuotes) return null;
  if (character === "“") return { open: character, close: "”" };
  if (character === "‘") return { open: character, close: "’" };
  return null;
}

/** 一个 quoted span reader；闭合扫描、参数与流式尾部共享同一转义边界。 */
function readQuotedSpan(
  source: string,
  start: number,
  quote: DirectiveQuoteState,
): { end: number; value: string } | null {
  const boundaries = new RegExp(`[\\\\${escapeRegExp(quote.close)}]`, "g");
  const pieces: string[] = [];
  let cursor = start + 1;
  boundaries.lastIndex = cursor;
  for (let boundary = boundaries.exec(source); boundary; boundary = boundaries.exec(source)) {
    pieces.push(source.slice(cursor, boundary.index));
    if (boundary[0] === quote.close) {
      return { end: boundary.index + 1, value: pieces.join("") };
    }
    const escaped = source[boundary.index + 1];
    if (escaped === undefined) return null;
    // Directive 不是 JSON；未知转义必须保持原字符，尤其不能破坏 Windows 路径。
    pieces.push([quote.open, quote.close, "\\"].includes(escaped) ? escaped : `\\${escaped}`);
    cursor = boundary.index + 2;
    boundaries.lastIndex = cursor;
  }
  return null;
}

function scanDirectiveBoundary(
  source: string,
  bodyStart: number,
  options: AssistantDirectiveSyntaxOptions,
): { brace: number; unfinishedQuote: boolean } {
  const markers = /["'“‘}]/g;
  markers.lastIndex = bodyStart;
  for (let marker = markers.exec(source); marker; marker = markers.exec(source)) {
    if (marker[0] === "}") return { brace: marker.index, unfinishedQuote: false };
    const quote = getDirectiveQuoteState(marker[0], options);
    if (!quote) continue;
    const span = readQuotedSpan(source, marker.index, quote);
    if (!span) return { brace: -1, unfinishedQuote: true };
    markers.lastIndex = span.end;
  }
  return { brace: -1, unfinishedQuote: false };
}

function parseDirectiveParameters(
  source: string,
  options: AssistantDirectiveSyntaxOptions,
): Record<string, string> | null {
  const parameters: Record<string, string> = {};
  const binding = /[\s,]*([a-zA-Z_][a-zA-Z\d_-]*)\s*=\s*/y;
  const bareValue = /[^\s,]+/y;
  let cursor = 0;
  while (cursor < source.length) {
    binding.lastIndex = cursor;
    const token = binding.exec(source);
    if (!token) return /^[\s,]*$/.test(source.slice(cursor)) ? parameters : null;
    cursor = binding.lastIndex;
    const quote = getDirectiveQuoteState(source[cursor], options);
    let value: string;
    if (quote) {
      const span = readQuotedSpan(source, cursor, quote);
      if (!span) return null;
      value = span.value;
      cursor = span.end;
    } else {
      bareValue.lastIndex = cursor;
      const tokenValue = bareValue.exec(source);
      if (!tokenValue) return null;
      value = tokenValue[0];
      cursor = bareValue.lastIndex;
    }
    if (cursor < source.length && !/[\s,]/.test(source[cursor]!)) return null;
    parameters[token[1]!] = value;
  }
  return parameters;
}

export function extractAssistantDirectives(
  content: string,
  directiveName: string,
  options: AssistantDirectiveSyntaxOptions = {},
): ParsedAssistantDirective[] {
  if (!content.trim() || !directiveName.trim()) return [];
  const candidates = createDirectiveStartPattern(directiveName, options);
  const directives: ParsedAssistantDirective[] = [];
  for (let match = candidates.exec(content); match; match = candidates.exec(content)) {
    const bodyStart = candidates.lastIndex;
    const { brace } = scanDirectiveBoundary(content, bodyStart, options);
    if (brace < 0) continue;
    const end = brace + 1;
    directives.push({
      start: match.index,
      end,
      name: directiveName,
      raw: content.slice(match.index, end),
      parameters: parseDirectiveParameters(content.slice(bodyStart, brace), options),
    });
    // 只有完整 span 才消费内部候选；坏参数仍保留 raw，而未闭合 span 不撤销后续候选。
    candidates.lastIndex = end;
  }
  return directives;
}

function mergeRanges(ranges: AssistantTextRange[]): AssistantTextRange[] {
  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

export function findMarkdownCodeRanges(content: string): AssistantTextRange[] {
  const fences: Array<[number, number]> = [];
  let opener: { marker: string; start: number } | null = null;
  // 仅以 \n 作行边界；不能把 JS multiline regex 额外识别的 Unicode separator 当作换行。
  for (const line of content.matchAll(/(^|\n) {0,3}(`{3,}|~{3,})[^\n]*/g)) {
    const marker = line[2]!;
    if (!opener) {
      opener = { marker, start: line.index + line[1]!.length };
    } else if (marker[0] === opener.marker[0] && marker.length >= opener.marker.length) {
      const end = line.index + line[0].length;
      fences.push([opener.start, end + (content[end] === "\n" ? 1 : 0)]);
      opener = null;
    }
  }
  if (opener) fences.push([opener.start, content.length]);
  const ranges: AssistantTextRange[] = [...fences];
  for (const element of content.matchAll(/<(code|pre)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi)) {
    ranges.push([element.index, element.index + element[0].length]);
  }
  const inFence = (index: number) => fences.some(([start, end]) => start <= index && index < end);
  const inlineMarkers = /`+/g;
  for (let marker = inlineMarkers.exec(content); marker; marker = inlineMarkers.exec(content)) {
    if (inFence(marker.index)) continue;
    const close = content.indexOf(marker[0], inlineMarkers.lastIndex);
    // 保留首个闭合 marker 落在 fence 内就放弃该 opener 的既有呈现规则。
    if (close < 0 || inFence(close)) continue;
    inlineMarkers.lastIndex = close + marker[0].length;
    ranges.push([marker.index, inlineMarkers.lastIndex]);
  }
  return mergeRanges(ranges);
}

export function overlapsAssistantTextRanges(
  start: number,
  end: number,
  ranges: readonly AssistantTextRange[],
): boolean {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart);
}

export function findUnclosedAssistantDirectiveStart(
  content: string,
  directiveName: string,
  protectedRanges: readonly AssistantTextRange[] = [],
  options: AssistantDirectiveSyntaxOptions = {},
): number | null {
  let result: number | null = null;
  const candidates = createDirectiveStartPattern(directiveName, options);
  for (const match of content.matchAll(candidates)) {
    const bodyStart = match.index + match[0].length;
    if (overlapsAssistantTextRanges(match.index, bodyStart, protectedRanges)) continue;
    const boundary = scanDirectiveBoundary(content, bodyStart, options);
    if (boundary.brace >= 0) continue;
    const tail = content.slice(bodyStart);
    // 末词/等号兼容规则保留：不把 source-exposed 重写顺手变成已保存消息的显示迁移。
    const pendingBinding = /(?:^|[\s,])[a-zA-Z_][a-zA-Z\d_-]*\s*(?:=\s*)?$/.test(tail);
    if (
      boundary.unfinishedQuote ||
      pendingBinding ||
      parseDirectiveParameters(tail, options) !== null
    ) {
      result = match.index;
    }
  }
  return result;
}

export function findAssistantDirectivePrefixStart(
  content: string,
  directiveNames: readonly string[],
  protectedRanges: readonly AssistantTextRange[] = [],
  options: AssistantDirectivePrefixOptions = {},
): number | null {
  const forms = directiveNames.flatMap((name) => {
    const entries = [{ spelling: `::${name}`, colons: "::", minimumLength: 0 }];
    if (options.tripleColonDirectiveNames?.includes(name)) {
      entries.push({ spelling: `:::${name}`, colons: ":::", minimumLength: 0 });
    }
    if (options.singleColonDirectiveNames?.includes(name)) {
      entries.push({
        spelling: `:${name}`,
        colons: ":",
        minimumLength: options.minimumSingleColonPrefixLength ?? 2,
      });
    }
    return entries;
  });
  let result: number | null = null;
  for (const candidate of content.matchAll(/(?<!:):/g)) {
    const start = candidate.index;
    if (overlapsAssistantTextRanges(start, start + 1, protectedRanges)) continue;
    const suffix = content.slice(start);
    if (
      forms.some(
        ({ spelling, colons, minimumLength }) =>
          suffix.startsWith(colons) &&
          suffix.length >= minimumLength &&
          (spelling.startsWith(suffix) ||
            (suffix.startsWith(spelling) && /^\s*$/.test(suffix.slice(spelling.length)))),
      )
    )
      result = start;
  }
  return result;
}
