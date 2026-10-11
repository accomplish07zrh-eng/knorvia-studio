// SPDX-License-Identifier: Apache-2.0
// SKILL.md 的 frontmatter 解析：围栏定位、折叠/字面量块、键值抽取。
import { basename } from "node:path";
import type { SkillDiagnostic } from "@knorvia/contracts";

const FENCE = "---";
const BOM = /^\uFEFF/u;
const LINE_BREAK = /\r?\n/u;
/** 块标量：`>` 折叠换行为空格，`|` 保留换行；允许 +- 修饰。 */
const BLOCK_HEADER = /^([>|])([+-]?)$/u;
const INDENTED = /^\s/u;

export interface SkillFrontmatter {
  body: string;
  header?: string;
  present: boolean;
}

function rows(text: string): string[] {
  return text.replace(BOM, "").split(LINE_BREAK);
}

/** 第一行必须是 `---`，其后的同名行是结束围栏。 */
export function readFrontmatter(text: string): SkillFrontmatter {
  const text0 = text.replace(BOM, "");
  if (!text0.startsWith(FENCE)) return { body: text, present: false };
  const lines = rows(text);
  if (lines[0]?.trim() !== FENCE) return { body: text, present: false };
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() !== FENCE) continue;
    return {
      body: lines.slice(index + 1).join("\n"),
      header: lines.slice(1, index).join("\n"),
      present: true,
    };
  }
  return { body: text, present: false };
}

export function skillBody(text: string): string {
  return readFrontmatter(text).body;
}

/** 去首尾空白；成对引号剥掉一层。 */
export function plainValue(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (text === undefined || text.length === 0) return undefined;
  const head = text.charAt(0);
  const quoted =
    text.length > 1 && head === text.charAt(text.length - 1) && (head === '"' || head === "'");
  return quoted ? text.slice(1, -1).trim() : text;
}

/** 块内公共缩进：以非空行的最小缩进为准。 */
function commonIndent(lines: readonly string[]): number {
  let width: number | undefined;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const current = /^\s*/u.exec(line)?.[0].length ?? 0;
    width = width === undefined ? current : Math.min(width, current);
  }
  return width ?? 0;
}

/** 去掉公共缩进；空行归一成空串。 */
function dedent(lines: readonly string[]): string[] {
  const width = commonIndent(lines);
  return lines.map((line) => (line.trim().length === 0 ? "" : line.slice(width)));
}

/** 折叠块：连续非空行合成一段，段间用换行；字面量块：按原样保留。 */
function foldLines(lines: readonly string[]): string[] {
  const folded: string[] = [];
  let pending: string[] = [];
  const flush = (): void => {
    if (pending.length === 0) return;
    folded.push(pending.join(" "));
    pending = [];
  };
  for (const line of lines) {
    const text = line.trim();
    if (text.length > 0) pending.push(text);
    else flush();
  }
  flush();
  return folded;
}

export function blockValue(lines: readonly string[], folded: boolean): string {
  const content = dedent(lines);
  return (folded ? foldLines(content) : content).join("\n").trim();
}

export interface HeaderFields {
  keys: string[];
  values: Record<string, string>;
}

/** 逐行读键值；缩进行属于上一个块，缺冒号的行记 warning 后跳过。 */
export function headerFields(
  header: string,
  path: string,
  diagnostics: SkillDiagnostic[],
): HeaderFields {
  const keys: string[] = [];
  const values: Record<string, string> = {};
  const lines = header.split(LINE_BREAK);
  for (let cursor = 0; cursor < lines.length; cursor += 1) {
    const raw = lines[cursor] ?? "";
    const text = raw.trim();
    if (text.length === 0 || text.startsWith("#") || INDENTED.test(raw)) continue;
    const separator = raw.indexOf(":");
    if (separator <= 0) {
      diagnostics.push({
        code: "skill_invalid_frontmatter",
        message: "Invalid frontmatter line " + (cursor + 1) + " in " + basename(path),
        path,
        severity: "warning",
      });
      continue;
    }
    const key = raw.slice(0, separator).trim();
    keys.push(key);
    const inline = raw.slice(separator + 1).trim();
    const blockHeader = BLOCK_HEADER.exec(inline);
    if (blockHeader === null) {
      values[key] = inline;
      continue;
    }
    const block: string[] = [];
    while (cursor + 1 < lines.length) {
      const next = lines[cursor + 1] ?? "";
      if (next.trim().length > 0 && !INDENTED.test(next)) break;
      block.push(next);
      cursor += 1;
    }
    values[key] = blockValue(block, blockHeader[1] === ">");
  }
  return { keys, values };
}
