// SPDX-License-Identifier: Apache-2.0
// frontmatter 解析：分隔符定位 + 头部键值行扫描 + 标量/列表归一化。
const DELIMITER = "---";
const DESCRIPTION_LIMIT = 1024;

/** 头部条目：形如 `key: value`；行首禁止空白（缩进视为续行），`#` 开头是注释。 */
const HEADER_ENTRY = /^([^\s:#][^:]*):(.*)$/u;
const INDENTED_LINE = /^\s/u;

export interface FrontmatterSection {
  end: number;
  lines: string[];
}

/** 头部结束行的下标（第一个 `---` 行）；`exactOpening` 为真时首行必须逐字是 `---`。 */
function findClosingLine(lines: string[], exactOpening: boolean): number {
  if (exactOpening && lines[0]?.trim() !== DELIMITER) return -1;
  return lines.findIndex((line, index) => index > 0 && line.trim() === DELIMITER);
}

export function frontmatterLines(
  content: string,
  exactOpening: boolean,
): FrontmatterSection | undefined {
  const normalized = content.replace(/^\uFEFF/u, "");
  if (!normalized.startsWith(DELIMITER)) return undefined;
  const lines = normalized.split(/\r?\n/u);
  const end = findClosingLine(lines, exactOpening);
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

const BRACKETS = /^\[|\]$/gu;

function trimmedEntries(text: string): string[] {
  const entries: string[] = [];
  for (const part of text.split(",")) {
    const item = part.trim();
    if (item.length > 0) entries.push(item);
  }
  return entries;
}

export function list(value: string | undefined): string[] {
  const text = scalar(value);
  return text === undefined ? [] : trimmedEntries(text.replace(BRACKETS, ""));
}

const TRUTHY_VALUES: ReadonlySet<string> = new Set(["true", "yes"]);

export function enabled(value: string | undefined): boolean {
  const text = scalar(value);
  return text !== undefined && TRUTHY_VALUES.has(text.toLowerCase());
}

export interface ParsedHeader {
  keys: string[];
  values: Record<string, string>;
}

/** 逐行扫描头部；空行、注释与缩进续行跳过，缺冒号的行交给回调记诊断。 */
export function parseHeader(
  header: string,
  onUnparsableLine: (lineNumber: number) => void,
): ParsedHeader {
  const keys: string[] = [];
  const values: Record<string, string> = {};
  const rows = header.split(/\r?\n/u);
  for (let position = 0; position < rows.length; position += 1) {
    const raw = rows[position] ?? "";
    const label = raw.trim();
    if (label.length === 0 || label.startsWith("#") || INDENTED_LINE.test(raw)) continue;
    const entry = HEADER_ENTRY.exec(raw);
    if (entry === null) {
      onUnparsableLine(position + 1);
      continue;
    }
    const key = entry[1]!.trim();
    keys.push(key);
    values[key] = (entry[2] ?? "").trim();
  }
  return { keys, values };
}

/** 正文首行（去掉 `#` 标题与列表前缀）作为 description 的回退值。 */
export function bodyDescription(body: string): string {
  const firstLine = body
    .split(/\r?\n/u)
    .map((raw) =>
      raw
        .replace(/^#+\s*/u, "")
        .replace(/^[-*]\s*/u, "")
        .trim(),
    )
    .find((text) => Boolean(text));
  return firstLine?.slice(0, DESCRIPTION_LIMIT) ?? "";
}

export { DESCRIPTION_LIMIT };
