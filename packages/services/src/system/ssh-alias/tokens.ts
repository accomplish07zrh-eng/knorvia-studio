// SPDX-License-Identifier: Apache-2.0
// OpenSSH config 词法：注释剥离、引号分词与 home 前缀展开。
import { homedir } from "node:os";

/**
 * 一行 ssh_config 的词法片段形态。相邻、无空白间隔的片段合起来才是同一个参数，
 * 所以「引号只包住参数的一部分」（`Host "a b"c`）天然被支持。
 */
type ChunkKind = "gap" | "comment" | "double" | "single" | "escaped" | "bare";

interface Chunk {
  kind: ChunkKind;
  /** 片段去掉外层引号后的内容（非引号片段即原文）。 */
  text: string;
  /** 片段在原始行中的起始下标：剥离注释要按原字节切，不能先改写文本。 */
  at: number;
}

/**
 * 片段切分。
 *
 * - `gap` / `comment`：空白与注释（`#` 只在引号外成立）；
 * - `double` / `single`：整段引号；第 1 组是引号内的内容、第 2 组是收尾引号（可能缺省）；
 *   引号内 `\X` 一律成对吞掉，交给后续还原；
 * - `escaped`：引号外**可转义**字符的 `\X`（空白、`\`、两种引号、`#`）；
 * - `bare`：其余连续字符；`\` 只有在后随可转义字符时才另算，故 Windows 路径里的
 *   `\Synthetic` 原样留在 bare 里，不会被当成转义。
 */
const CHUNKS =
  /(?:\s+)|(?:#[^\n]*)|(?:"((?:\\[\s\S]|[^"\\])*)(")?)|(?:'((?:\\[\s\S]|[^'\\])*)(')?)|(?:\\[\\\s"'#])|(?:(?:[^\s"'\\#]|\\(?![\\\s"'#]))+)/gu;

const BLANK = /\s/u;

/**
 * 引号内容的还原：只把 `\<引号>` 与 `\\` 还原成引号/反斜杠。
 *
 * 其余 `\X` 保持两字符原样 —— ssh_config 的引号内路径允许直接写 `C:\dir`，
 * 若把 `\d` 之类也当转义就会吃掉用户路径里的反斜杠。
 */
function unquote(body: string, quote: string): string {
  return body.replace(/\\([\s\S])/gu, (pair, escaped: string) =>
    escaped === quote || escaped === "\\" ? escaped : pair,
  );
}

function chunksOf(line: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const match of line.matchAll(CHUNKS)) {
    const text = match[0];
    const at = match.index;
    const body = match[1] ?? match[3];
    if (body !== undefined) {
      const quote = match[1] !== undefined ? '"' : "'";
      chunks.push({ kind: quote === '"' ? "double" : "single", text: unquote(body, quote), at });
      continue;
    }
    const head = text.charAt(0);
    if (BLANK.test(head)) chunks.push({ kind: "gap", text, at });
    else if (head === "#") chunks.push({ kind: "comment", text, at });
    else if (head === "\\") chunks.push({ kind: "escaped", text: text.slice(1), at });
    else chunks.push({ kind: "bare", text, at });
  }
  return chunks;
}

/** 去掉行内第一个未加引号的 `#` 及其后缀，之前字符的原始写法保持不变。 */
export function withoutComment(line: string): string {
  for (const chunk of chunksOf(line)) {
    if (chunk.kind === "comment") return line.slice(0, chunk.at);
  }
  return line;
}

/**
 * 按空白把片段聚成参数：同一参数可以由多个片段拼成（`"a b"c` → `a bc`）。
 *
 * 引号里一个字符都没有（`User ""`）时不产出参数 —— 空引号在 ssh_config 里
 * 不是一个有意义的指令值，保留它只会让调用方多出一条空指令。
 */
function groups(line: string): Chunk[][] {
  const result: Chunk[][] = [];
  let group: Chunk[] = [];
  for (const chunk of chunksOf(line)) {
    if (chunk.kind === "comment") break;
    if (chunk.kind === "gap") {
      if (group.length > 0) result.push(group);
      group = [];
    } else {
      group.push(chunk);
    }
  }
  if (group.length > 0) result.push(group);
  return result;
}

/** 把一行 ssh_config 拆成参数：引号内的空白不切分，引号外的 `\X` 取后一个字符。 */
export function words(line: string): string[] {
  const tokens: string[] = [];
  for (const group of groups(line)) {
    const token = group.map((chunk) => chunk.text).join("");
    if (token !== "") tokens.push(token);
  }
  return tokens;
}

/**
 * 展开 home 前缀：`~` / `~/…` / `~\…` 与 OpenSSH for Windows 的 `%d`。
 *
 * `%d` 以替换字符串拼接（而非替换函数），保留 `$&` 等 `String.replace` 替换模式
 * 被解释的既有协议行为；`%d` 之后的路径后缀按原字节保留。
 */
export function homeToken(raw: string): string {
  const value = raw.trim();
  if (value === "") return "";
  const home = homedir();
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) return `${home}${value.slice(1)}`;
  return value.replace(/^%d(?=$|[/\\])/u, home);
}
