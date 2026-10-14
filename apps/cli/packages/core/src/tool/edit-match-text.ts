// SPDX-License-Identifier: Apache-2.0
// Edit 契约的文本变换：可见转义展开、Unicode 转义展开、读取行号剥离与引号风格还原。
//
// 全部是「按字符扫描 + 局部替换」的纯函数：不改行数、不 trim、不抛错。
// 展开结果里可能再次出现可展开的序列，所以这些函数**不保证幂等**（known-differences.md K3）。

const BACKSLASH = "\\";

const ESCAPED_VISIBLE_CHARS: ReadonlyMap<string, string> = new Map<string, string>([
  ["n", "\n"],
  ["t", "\t"],
  ["r", "\r"],
  ['"', '"'],
  ["'", "'"],
  ["\`", "\`"],
  [BACKSLASH, BACKSLASH],
  ["$", "$"],
]);

const CURLY_TO_STRAIGHT: ReadonlyMap<string, string> = new Map<string, string>([
  ["\u2018", "'"],
  ["\u2019", "'"],
  ["\u201c", '"'],
  ["\u201d", '"'],
]);

// 出现在这些字符之后的直引号按「开引号」处理。
const QUOTE_OPENERS: ReadonlySet<string> = new Set<string>([
  " ",
  "\t",
  "\n",
  "\r",
  "(",
  "[",
  "{",
  "\u2014",
  "\u2013",
]);

const LETTER = /\p{L}/u;
const FOUR_HEX_DIGITS = /^[0-9a-fA-F]{4}$/;
const READ_NUMBER_LINE = /^\d+(?:: |\t)(.*)$/;

export const plainQuotes = (text: string): string =>
  text.replace(/[\u2018\u2019\u201c\u201d]/gu, (char) => CURLY_TO_STRAIGHT.get(char)!);

// 每一行都必须带「行号 + 冒号空格或制表符」前缀；有一行不带就整体返回 undefined。
export function stripReadNumbers(text: string): string | undefined {
  const stripped = text.split("\n").map((line) => READ_NUMBER_LINE.exec(line)?.[1]);
  if (stripped.some((value) => value === undefined)) return undefined;
  return stripped.map((value) => value ?? "").join("\n");
}

interface EscapeExpansion {
  /** 被替换掉的原始字符数。 */
  readonly length: number;
  readonly text: string;
}

// 单趟扫描：只在反斜杠位置问一次 decode，命中就替换并跳过被消费的字符。
function expandEscapes(
  source: string,
  decode: (at: number) => EscapeExpansion | undefined,
): string {
  const parts: string[] = [];
  let copied = 0;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    if (source[cursor] !== BACKSLASH) continue;
    const expansion = decode(cursor);
    if (expansion === undefined) continue;
    parts.push(source.slice(copied, cursor), expansion.text);
    copied = cursor + expansion.length;
    cursor = copied - 1;
  }
  if (copied === 0) return source;
  parts.push(source.slice(copied));
  return parts.join("");
}

export function visibleCharacters(text: string): string {
  return expandEscapes(text, (at) => {
    const visible = ESCAPED_VISIBLE_CHARS.get(text[at + 1] ?? "");
    return visible === undefined ? undefined : { length: 2, text: visible };
  });
}

export function unicodeCharacters(text: string): string {
  return expandEscapes(text, (at) => {
    const next = text[at + 1];
    // 双反斜杠原样保留，但仍要消费两个字符，避免把后一个反斜杠再当一次起点。
    if (next === BACKSLASH) return { length: 2, text: text.slice(at, at + 2) };
    if (next !== "u") return undefined;
    const digits = text.slice(at + 2, at + 6);
    if (!FOUR_HEX_DIGITS.test(digits)) return undefined;
    return { length: 6, text: String.fromCharCode(Number.parseInt(digits, 16)) };
  });
}

function isOpeningQuotePoint(points: readonly string[], index: number): boolean {
  if (index === 0) return true;
  return QUOTE_OPENERS.has(points[index - 1]!);
}

function styleSingleQuote(points: readonly string[], index: number): string {
  const previous = points[index - 1];
  const next = points[index + 1];
  const insideWord =
    previous !== undefined && next !== undefined && LETTER.test(previous) && LETTER.test(next);
  return insideWord || !isOpeningQuotePoint(points, index) ? "\u2019" : "\u2018";
}

// 匹配到的原文用的是弯引号时，把替换文本里的直引号按同样的风格写回去。
export function restoreQuotes(actual: string, replacement: string): string {
  const wantsSingle = /[\u2018\u2019]/u.test(actual);
  const wantsDouble = /[\u201c\u201d]/u.test(actual);
  if (!wantsSingle && !wantsDouble) return replacement;

  const points = Array.from(replacement);
  const styled = points.map((point, index) => {
    if (wantsDouble && point === '"') {
      return isOpeningQuotePoint(points, index) ? "\u201c" : "\u201d";
    }
    if (wantsSingle && point === "'") return styleSingleQuote(points, index);
    return point;
  });
  return styled.join("");
}
