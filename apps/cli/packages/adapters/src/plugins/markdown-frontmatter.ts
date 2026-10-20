// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// SKILL.md 的 YAML 前言只取 name 与 description 两个标量。解析器按「行分类」推进：
// 先切出前言块，再逐行判成「键值行」「块标量开行」「块标量正文」三类，正文由缩进剥离后
// 按原标记（折叠 > / 保留 |）决定行间连接符。读不到文件或缺少数行一律当作没有前言。

import { readFileSync } from "node:fs";

type Fields = { name?: string; description?: string };
type RowKind = "key" | "block-opener" | "block-body";

const FRONTMATTER_FENCE = "---";
const KEY_LINE = /^(name|description):\s*(.*)$/u;
const BLOCK_OPENER = /^[>|][+-]?\s*(?:#.*)?$/u;
const TRAILING_COMMENT = /\s+#.*$/u;
const LEADING_INDENT = /^\s*/u;
const INDENTED = /^\s/u;

/** 键名白名单：只认这两个标量，其余键直接丢弃。 */
const FIELD_KEYS = new Set<string>(["name", "description"]);

/** 双引号串先按 JSON 解；不是合法 JSON 就退化为去掉首尾引号。 */
function fromDoubleQuoted(quoted: string): string {
  try {
    const decoded: unknown = JSON.parse(quoted);
    return typeof decoded === "string" ? decoded : quoted;
  } catch {
    return quoted.slice(1, -1);
  }
}

/** 单引号串：YAML 里两个连续单引号表示一个字面单引号。 */
function fromSingleQuoted(quoted: string): string {
  return quoted.slice(1, -1).replaceAll("''", "'");
}

/** 裸标量：去掉行尾 `#` 注释后再收空白。 */
function fromPlainScalar(text: string): string {
  return text.replace(TRAILING_COMMENT, "").trim();
}

/**
 * 单个标量的求值顺序：带引号的按引号规则解，其余走裸标量规则。
 * 引号必须成对出现在首尾，否则按裸标量处理（YAML 语义）。
 */
function readScalar(text: string): string {
  const trimmed = text.trim();
  const doubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  if (doubleQuoted) return fromDoubleQuoted(trimmed);
  const singleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");
  if (singleQuoted) return fromSingleQuoted(trimmed);
  return fromPlainScalar(trimmed);
}

/** 把一行判成三类之一；不是这三类的行返回 null（调用方跳过）。 */
function classifyRow(row: string): RowKind | null {
  if (KEY_LINE.test(row)) return "key";
  if (BLOCK_OPENER.test(row.trim())) return "block-opener";
  if (INDENTED.test(row)) return "block-body";
  return null;
}

/** 块标量正文的公共缩进：所有非空行缩进的最小值。 */
function commonIndent(rows: readonly string[]): number {
  const widths: number[] = [];
  for (const row of rows) {
    if (!row.trim()) continue;
    widths.push(LEADING_INDENT.exec(row)?.[0].length ?? 0);
  }
  return widths.length > 0 ? Math.min(...widths) : 0;
}

/**
 * 块标量正文的拼接规则：折叠式（`>`）在两侧都有内容时用空格接，其余用换行；
 * 保留式（`|`）一律换行。拼接后整体收空白。
 */
function joinBlockBody(rows: readonly string[], folded: boolean): string {
  const width = commonIndent(rows);
  const body = rows.map((row) => row.slice(width));
  let joined = "";
  for (let index = 0; index < body.length; index += 1) {
    const current = body[index] ?? "";
    joined += current;
    if (index + 1 >= body.length) continue;
    const next = body[index + 1];
    joined += folded && current.length > 0 && next !== undefined && next.length > 0 ? " " : "\n";
  }
  return joined.trim();
}

/** 前言块：首行围栏到第二条围栏之间的行；没有围栏则整份文件都不算前言。 */
function frontmatterRows(filePath: string): string[] | null {
  let rows: string[];
  try {
    rows = readFileSync(filePath, "utf8")
      .replace(/^\uFEFF/u, "")
      .split(/\r?\n/u);
  } catch {
    return null;
  }
  if (rows[0]?.trim() !== FRONTMATTER_FENCE) return null;
  const closing = rows.findIndex((row, index) => index > 0 && row.trim() === FRONTMATTER_FENCE);
  return closing < 0 ? null : rows.slice(1, closing);
}

/** 从一个键值行推进出它的标量值；块标量要把后续缩进行一起吃掉。 */
function readFieldValue(
  rows: readonly string[],
  start: number,
): { value: string; nextIndex: number } {
  const row = rows[start] ?? "";
  const matched = KEY_LINE.exec(row);
  const raw = matched?.[2] ?? "";
  if (!BLOCK_OPENER.test(raw)) {
    return { value: readScalar(raw), nextIndex: start };
  }
  const body: string[] = [];
  let cursor = start;
  while (cursor + 1 < rows.length) {
    const following = rows[cursor + 1] ?? "";
    // 遇到顶格的非空行说明块标量结束，交还给外层继续判键值行。
    if (following.trim() && !INDENTED.test(following)) break;
    body.push(following);
    cursor += 1;
  }
  return { value: joinBlockBody(body, raw.startsWith(">")), nextIndex: cursor };
}

export function readMarkdownFrontmatter(filePath: string): Fields {
  const rows = frontmatterRows(filePath);
  if (!rows) return {};
  const fields: Fields = {};
  let index = 0;
  while (index < rows.length) {
    const row = rows[index] ?? "";
    if (classifyRow(row) !== "key") {
      index += 1;
      continue;
    }
    const matched = KEY_LINE.exec(row);
    const key = matched?.[1] ?? "";
    const { value, nextIndex } = readFieldValue(rows, index);
    if (FIELD_KEYS.has(key) && value.length > 0) {
      fields[key as keyof Fields] = value;
    }
    index = nextIndex + 1;
  }
  return fields;
}
