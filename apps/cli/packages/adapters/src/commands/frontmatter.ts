// SPDX-License-Identifier: Apache-2.0
// 命令 frontmatter：分隔符定位、键值行解析与标量/列表归一化。
const DELIMITER = "---";
const DESCRIPTION_LIMIT = 1024;

export interface FrontmatterSection {
  end: number;
  lines: string[];
}

export function frontmatterLines(
  content: string,
  exactOpening: boolean,
): FrontmatterSection | undefined {
  const normalized = content.replace(/^\uFEFF/u, "");
  if (!normalized.startsWith(DELIMITER)) return undefined;
  const lines = normalized.split(/\r?\n/u);
  if (exactOpening && lines[0]?.trim() !== DELIMITER) return undefined;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === DELIMITER);
  return end < 0 ? undefined : { end, lines };
}

export function removeFrontmatter(content: string): string {
  const section = frontmatterLines(content, false);
  return section ? section.lines.slice(section.end + 1).join("\n") : content;
}

export function scalar(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"));
  return quoted ? trimmed.slice(1, -1).trim() : trimmed;
}

export function list(value: string | undefined): string[] {
  const text = scalar(value);
  if (!text) return [];
  return text
    .replace(/^\[/u, "")
    .replace(/\]$/u, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function enabled(value: string | undefined): boolean {
  const text = scalar(value)?.toLowerCase();
  return text === "true" || text === "yes";
}

export interface ParsedHeader {
  keys: string[];
  values: Record<string, string>;
}

/** 逐行解析头部：空行、`#` 注释与缩进续行跳过；缺冒号的行写诊断但继续。 */
export function parseHeader(
  header: string,
  onInvalidLine: (lineNumber: number) => void,
): ParsedHeader {
  const keys: string[] = [];
  const values: Record<string, string> = {};
  const lines = header.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || /^\s/u.test(line)) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) {
      onInvalidLine(index + 1);
      continue;
    }
    const key = line.slice(0, colon).trim();
    keys.push(key);
    values[key] = line.slice(colon + 1).trim();
  }
  return { keys, values };
}

/** 正文首行（去掉标题/列表前缀）作为 description 的回退值。 */
export function bodyDescription(body: string): string {
  const line = body
    .split(/\r?\n/u)
    .map((raw) =>
      raw
        .replace(/^#+\s*/u, "")
        .replace(/^[-*]\s*/u, "")
        .trim(),
    )
    .find((text) => Boolean(text));
  return line?.slice(0, DESCRIPTION_LIMIT) ?? "";
}

export { DESCRIPTION_LIMIT };
