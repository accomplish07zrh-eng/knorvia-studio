// SPDX-License-Identifier: Apache-2.0
// frontmatter 解析：围栏定位 + 头部键值扫描 + 标量/列表/布尔归一化。
const FRONTMATTER_FENCE = "---";
const DESCRIPTION_MAX_CHARS = 1024;
const BOM = /^\uFEFF/u;
const LINE_BREAK = /\r?\n/u;

/** 头部条目：形如 `key: value`；首字符不能是空白或 `#`（缩进是续行、`#` 是注释）。 */
const HEADER_ENTRY = /^([^\s:#][^:]*):(.*)$/u;
const INDENTED_LINE = /^\s/u;
const QUOTES = new Set(["'", '"']);

export interface FrontmatterSection {
  end: number;
  lines: string[];
}

/** 围栏必须出现在首行；返回结束行下标与切好的行数组。 */
export function frontmatterLines(
  content: string,
  exactOpening: boolean,
): FrontmatterSection | undefined {
  const text = content.replace(BOM, "");
  if (text.slice(0, FRONTMATTER_FENCE.length) !== FRONTMATTER_FENCE) return undefined;
  const rows = text.split(LINE_BREAK);
  if (exactOpening && rows[0]?.trim() !== FRONTMATTER_FENCE) return undefined;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index]?.trim() === FRONTMATTER_FENCE) return { end: index, lines: rows };
  }
  return undefined;
}

export function removeFrontmatter(content: string): string {
  const section = frontmatterLines(content, false);
  if (section === undefined) return content;
  return section.lines.slice(section.end + 1).join("\n");
}

function unquote(text: string): string {
  const head = text.charAt(0);
  const tail = text.charAt(text.length - 1);
  const wrapped = text.length > 1 && head === tail && QUOTES.has(head);
  return wrapped ? text.slice(1, -1).trim() : text;
}

export function scalar(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (text === undefined || text.length === 0) return undefined;
  return unquote(text);
}

const SURROUNDING_BRACKETS = /^\[|\]$/gu;

function trimmedEntries(csv: string): string[] {
  const entries: string[] = [];
  for (const part of csv.split(",")) {
    const item = part.trim();
    if (item.length > 0) entries.push(item);
  }
  return entries;
}

export function list(value: string | undefined): string[] {
  const text = scalar(value);
  return text === undefined ? [] : trimmedEntries(text.replace(SURROUNDING_BRACKETS, ""));
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
  const rawRows = header.split(LINE_BREAK);
  for (let position = 0; position < rawRows.length; position += 1) {
    const raw = rawRows[position] ?? "";
    const text = raw.trim();
    if (text.length === 0 || text.startsWith("#") || INDENTED_LINE.test(raw)) continue;
    const entry = HEADER_ENTRY.exec(raw);
    if (entry === null) {
      onUnparsableLine(position + 1);
      continue;
    }
    const key = entry[1]!.trim();
    keys[keys.length] = key;
    values[key] = (entry[2] ?? "").trim();
  }
  return { keys, values };
}

function stripLineMarkers(raw: string): string {
  return raw
    .replace(/^#+\s*/u, "")
    .replace(/^[-*]\s*/u, "")
    .trim();
}

/** 正文首个非空行（去掉标题与列表前缀）作为 description 的回退值。 */
export function bodyDescription(body: string): string {
  for (const raw of body.split(LINE_BREAK)) {
    const text = stripLineMarkers(raw);
    if (text.length > 0) return text.slice(0, DESCRIPTION_MAX_CHARS);
  }
  return "";
}

export { DESCRIPTION_MAX_CHARS as DESCRIPTION_LIMIT };
