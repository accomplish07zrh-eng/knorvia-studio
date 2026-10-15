// SPDX-License-Identifier: Apache-2.0
// bash 读文件来源识别：模型用 cat/head/tail/sed/grep 直读文件时，把「读了哪个文件的
// 哪一段」折算成来源描述，供 read-state 回填判定模型已见过的内容。
// 出现管道/重定向、不可解析语法或任何写嫌疑的段落都放弃识别（宁缺勿错）。
import {
  analyzeBashCommand,
  isBashCommandPermissionSafe,
  type BashCommandInvocation,
} from "./bash-command-parser.js";

const DEFAULT_HEAD_COUNT = 10;
const DEFAULT_TAIL_COUNT = 10;
const SED_RANGE_SHAPE = /^(\d+),(\d+)p$/u;
const SED_SINGLE_SHAPE = /^(\d+)p$/u;
const NOISE_COMMAND_HEAD = /^\s*(echo|printf|true|:)\b/u;
const GREP_SHORT_CLUSTER = /^-[niwxEFGPHh]+$/u;
const GREP_CONTEXT_TAIL = /^-[ABC]\d+$/u;
const GREP_CONTEXT_LONG = /^--(?:after-context|before-context|context)=\d+$/u;
const GREP_READING_LONG_FLAGS = new Set(
  (
    "--line-number --ignore-case --word-regexp --line-regexp --extended-regexp --fixed-strings " +
    "--basic-regexp --perl-regexp --with-filename --no-filename --color=never --color=auto"
  ).split(" "),
);

interface BashReadFileSource {
  requiresExitZero?: boolean;
  tailLines?: number;
  endLine?: number;
  startLine?: number;
  filePath: string;
}

interface SelectedReadContent {
  limit?: number;
  offset?: number;
  content: string;
}

export function collectBashReadFileSources(rawText: string): BashReadFileSource[] {
  if (/[|<>]/u.test(rawText)) return [];
  const parsed = analyzeBashCommand(rawText);
  if (!isBashCommandPermissionSafe(parsed) || parsed.hasRedirects) return [];
  if (parsed.commands.length === 0) return [];

  const loneSegment = parsed.commands.length === 1;
  const collected: BashReadFileSource[] = [];
  for (const segment of parsed.commands) {
    const picked =
      sedPrintRange(segment) ??
      catWholeFile(segment) ??
      headPrefixLines(segment) ??
      tailSuffixLines(segment) ??
      (loneSegment ? grepMatchedFile(segment) : undefined);
    if (picked !== undefined) {
      collected.push(picked);
      continue;
    }
    const harmlessFiller = !loneSegment && NOISE_COMMAND_HEAD.test(segment.commandText);
    if (harmlessFiller) continue;
    return [];
  }
  return collected;
}

export function selectReadContent(
  text: string,
  origin: BashReadFileSource,
): SelectedReadContent | undefined {
  if (origin.tailLines !== undefined) return tailWindow(text, origin.tailLines);
  if (origin.startLine === undefined) return { content: text };
  return lineWindow(text, origin.startLine, origin.endLine ?? origin.startLine);
}

// tail 窗口：文件末尾 N 行；行数不足时给整份内容并如实标注窗口。
function tailWindow(text: string, tailLines: number): SelectedReadContent | undefined {
  const rows = text.split("\n");
  if (rows.length > 0 && rows.at(-1) === "") rows.pop();
  if (rows.length === 0) return undefined;
  const windowSize = Math.min(tailLines, rows.length);
  const windowStart = rows.length - windowSize + 1;
  const windowed: SelectedReadContent = {
    content: rows.slice(windowStart - 1).join("\n"),
    offset: windowStart,
    limit: windowSize,
  };
  return windowed;
}

// 行号窗口：起止都夹在 [1, 行数] 内；起点越界则放弃（内容与读取时可能已不同）。
function lineWindow(text: string, start: number, end: number): SelectedReadContent | undefined {
  const rows = text.split("\n");
  const from = Math.max(1, start);
  const to = Math.max(from, end);
  if (from > rows.length) return undefined;
  const windowed: SelectedReadContent = {
    content: rows.slice(from - 1, to).join("\n"),
    offset: from,
    limit: to - from + 1,
  };
  return windowed;
}

function catWholeFile(segment: BashCommandInvocation): BashReadFileSource | undefined {
  const [tool, ...rest] = segment.argv;
  if (tool !== "cat") return undefined;
  let chosenPath: string | undefined;
  for (const token of rest) {
    if (token.startsWith("-")) {
      if (token !== "-n" && token !== "--number") return undefined;
      continue;
    }
    if (chosenPath !== undefined) return undefined;
    chosenPath = token;
  }
  return usablePath(chosenPath) ? { filePath: chosenPath } : undefined;
}

function headPrefixLines(segment: BashCommandInvocation): BashReadFileSource | undefined {
  const bounded = headTailWindow(segment.argv, DEFAULT_HEAD_COUNT);
  if (!bounded || segment.argv[0] !== "head") return undefined;
  return { filePath: bounded.filePath, startLine: 1, endLine: bounded.count };
}

function tailSuffixLines(segment: BashCommandInvocation): BashReadFileSource | undefined {
  const bounded = headTailWindow(segment.argv, DEFAULT_TAIL_COUNT);
  if (!bounded || segment.argv[0] !== "tail") return undefined;
  return { filePath: bounded.filePath, tailLines: bounded.count };
}

function headTailWindow(
  words: readonly string[],
  fallbackCount: number,
): { count: number; filePath: string } | undefined {
  let lineCount: number | undefined;
  let chosenPath: string | undefined;
  for (let cursor = 1; cursor < words.length; cursor += 1) {
    const token = words[cursor]!;
    if (token === "-n" || token === "--lines") {
      const raw = words[++cursor];
      if (!countAboveZero(raw)) return undefined;
      lineCount = Number(raw);
      continue;
    }
    if (token.startsWith("--lines=")) {
      const raw = token.slice("--lines=".length);
      if (!countAboveZero(raw)) return undefined;
      lineCount = Number(raw);
      continue;
    }
    if (/^-n\d+$/u.test(token)) {
      lineCount = Number(token.slice(2));
      continue;
    }
    if (/^-\d+$/u.test(token)) {
      lineCount = Number(token.slice(1));
      continue;
    }
    if (token.startsWith("-")) return undefined;
    if (chosenPath !== undefined) return undefined;
    chosenPath = token;
  }
  if (!usablePath(chosenPath)) return undefined;
  const bounded = { count: lineCount ?? fallbackCount, filePath: chosenPath };
  return bounded;
}

// sed 只认「安静模式 + 单条行号打印脚本」的形态；就地/多脚本一律放弃。
function sedPrintRange(segment: BashCommandInvocation): BashReadFileSource | undefined {
  const [tool, ...rest] = segment.argv;
  if (tool !== "sed") return undefined;
  let quietMode = false;
  let script: string | undefined;
  let chosenPath: string | undefined;

  for (const token of rest) {
    if (token.startsWith("-")) {
      if (token.startsWith("--")) {
        if (token === "--in-place" || token.startsWith("--in-place=")) return undefined;
        if (token === "--expression") return undefined;
        if (token === "--quiet" || token === "--silent") quietMode = true;
      } else {
        if (token.includes("i")) return undefined;
        if (token === "-e") return undefined;
        if (token.includes("n")) quietMode = true;
      }
      continue;
    }
    if (script === undefined) script = token;
    else if (chosenPath === undefined) chosenPath = token;
    else return undefined;
  }

  if (!quietMode || script === undefined || !usablePath(chosenPath)) return undefined;
  const ranged = SED_RANGE_SHAPE.exec(script);
  if (ranged) {
    return { filePath: chosenPath, startLine: Number(ranged[1]), endLine: Number(ranged[2]) };
  }
  const single = SED_SINGLE_SHAPE.exec(script);
  if (!single) return undefined;
  const lineNumber = Number(single[1]);
  return { filePath: chosenPath, startLine: lineNumber, endLine: lineNumber };
}

// grep 只在单段命令里识别：模式 + 单个具体文件（排除 glob），命不中不算「已读」。
function grepMatchedFile(segment: BashCommandInvocation): BashReadFileSource | undefined {
  const [tool, ...rest] = segment.argv;
  if (tool !== "grep" && tool !== "egrep" && tool !== "fgrep") return undefined;
  let pattern: string | undefined;
  let chosenPath: string | undefined;

  for (let cursor = 0; cursor < rest.length; cursor += 1) {
    const token = rest[cursor]!;
    if (token.startsWith("-") && token !== "-") {
      if (token === "-A" || token === "-B" || token === "-C") {
        const raw = rest[++cursor];
        if (!digitsOnly(raw)) return undefined;
        continue;
      }
      const acceptedFlag =
        GREP_CONTEXT_TAIL.test(token) ||
        GREP_CONTEXT_LONG.test(token) ||
        GREP_SHORT_CLUSTER.test(token) ||
        GREP_READING_LONG_FLAGS.has(token);
      if (!acceptedFlag) return undefined;
      continue;
    }
    if (pattern === undefined) pattern = token;
    else if (chosenPath === undefined) chosenPath = token;
    else return undefined;
  }

  if (pattern === undefined || !usablePath(chosenPath)) return undefined;
  if (/[*?[{]/u.test(chosenPath)) return undefined;
  return { filePath: chosenPath, requiresExitZero: true };
}

function usablePath(value: string | undefined): value is string {
  return value !== undefined && value.length > 0 && value !== "-";
}

function countAboveZero(value: string | undefined): value is string {
  return value !== undefined && /^\d+$/u.test(value) && Number(value) > 0;
}

function digitsOnly(value: string | undefined): value is string {
  return value !== undefined && /^\d+$/u.test(value);
}
