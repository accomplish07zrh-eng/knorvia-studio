// Text transformations for the frozen Edit contract; transition licence retained.
const VISIBLE = new Map([
  ["n", "\n"],
  ["t", "\t"],
  ["r", "\r"],
  ['"', '"'],
  ["'", "'"],
  [String.fromCharCode(96), String.fromCharCode(96)],
  ["\\", "\\"],
  ["$", "$"],
]);
const CURLY: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"' };
const OPEN_BEFORE = new Set([" ", "\t", "\n", "\r", "(", "[", "{", "—", "–"]);

export const plainQuotes = (text: string): string =>
  text.replace(/[‘’“”]/gu, (char) => CURLY[char]!);

export function stripReadNumbers(text: string): string | undefined {
  const result: string[] = [];
  for (const line of text.split("\n")) {
    const matched = /^\d+(?:: |\t)(.*)$/.exec(line);
    if (!matched) return undefined;
    result.push(matched[1] ?? "");
  }
  return result.join("\n");
}

interface EscapeToken {
  width: number;
  value: string;
}
function scanBackslashes(text: string, decode: (index: number) => EscapeToken | undefined): string {
  let scan = 0,
    copied = 0,
    result = "";
  for (;;) {
    const index = text.indexOf("\\", scan);
    if (index < 0) break;
    const token = decode(index);
    if (token) {
      result += text.slice(copied, index) + token.value;
      copied = index + token.width;
      scan = copied;
    } else scan = index + 1;
  }
  return copied === 0 ? text : result + text.slice(copied);
}
export function visibleCharacters(text: string): string {
  return scanBackslashes(text, (index) => {
    const value = VISIBLE.get(text[index + 1] ?? "");
    return value === undefined ? undefined : { width: 2, value };
  });
}
export function unicodeCharacters(text: string): string {
  return scanBackslashes(text, (index) => {
    if (text[index + 1] === "\\") return { width: 2, value: text.slice(index, index + 2) };
    if (text[index + 1] !== "u") return undefined;
    const hex = text.slice(index + 2, index + 6);
    return /^[0-9a-fA-F]{4}$/.test(hex)
      ? { width: 6, value: String.fromCharCode(Number.parseInt(hex, 16)) }
      : undefined;
  });
}

export function restoreQuotes(actual: string, replacement: string): string {
  const single = /[‘’]/u.test(actual);
  const double = /[“”]/u.test(actual);
  if (!single && !double) return replacement;
  const points = Array.from(replacement);
  return points
    .map((point, index) => {
      const opening = index === 0 || OPEN_BEFORE.has(points[index - 1]!);
      if (double && point === '"') return opening ? "“" : "”";
      if (single && point === "'") {
        const previous = points[index - 1],
          next = points[index + 1];
        const insideWord =
          previous !== undefined &&
          next !== undefined &&
          /\p{L}/u.test(previous) &&
          /\p{L}/u.test(next);
        return insideWord || !opening ? "’" : "‘";
      }
      return point;
    })
    .join("");
}
