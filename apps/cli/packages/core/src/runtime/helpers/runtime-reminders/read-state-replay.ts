// SPDX-License-Identifier: Apache-2.0
// 压缩后的读取状态提醒（B21）。
// 压缩把上下文裁掉之后，把「最近读过的文件」回放成系统提醒分片：按最近读取时间倒序挑候选，
// 排除 `.git/` 路径、来源非 Read 的条目与压缩保留段里已读过的文件；单文件太大或合计超预算的
// 降级成「太大，请自行 Read」的引用提示，其余附带带行号的完整内容。同步纯计算，不读文件、
// 不抛异常；路径比较前把反斜杠统一成 `/`，Windows 与 POSIX 的同一路径视为同一文件。
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@knorvia/shared";
import type { ReadFileStateEntry, ReadFileStateMap } from "../../deps.js";
import {
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../../agent/message-history.js";

// 三个上限（契约默认值）：最多 5 个文件、单文件 5000 token 估算、合计 50000。
const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_FILE_APPROX_TOKENS = 5000;
const DEFAULT_MAX_TOTAL_APPROX_TOKENS = 50000;

// 回放正文的固定标题（逐字契约）。
const RESULT_HEADING = "Result of calling the Read tool:";

export interface PostCompactReadStateInput {
  maxFileApproxTokens?: /* 单文件 token 估算上限 */ number;
  maxFiles?: /* 回放文件数上限 */ number;
  maxTotalApproxTokens?: /* 合计 token 估算上限 */ number;
  preservedEntries?: /* 压缩保留段：里面已读过的文件不再回放 */ readonly RuntimeMessageEntry[];
  readFileState?: ReadFileStateMap;
}

export const buildPostCompactReadStateReminderEntries = (
  request: PostCompactReadStateInput,
): RuntimeMessageEntry[] => {
  const readState = request.readFileState;
  if (!readState || readState.size === 0) return [];

  const maxFiles = request.maxFiles ?? DEFAULT_MAX_FILES;
  const perFileCap = request.maxFileApproxTokens ?? DEFAULT_MAX_FILE_APPROX_TOKENS;
  const totalCap = request.maxTotalApproxTokens ?? DEFAULT_MAX_TOTAL_APPROX_TOKENS;
  const skip = collectPreservedPaths(request.preservedEntries ?? []);

  // 候选：Read 来源、非 .git、压缩保留段没读过，按最近读取时间倒序。
  const ranked = [...readState.values()]
    .filter((entry) => isReplayable(entry, skip))
    .sort(byMostRecentlyRead);

  const picked: RuntimeMessageEntry[] = [];
  let spentTokens = 0;
  for (const entry of ranked) {
    if (picked.length >= maxFiles) break;
    const cost = Math.ceil(entry.content.length / ESTIMATED_TOKEN_CHAR_DIVISOR);
    const overBudget = cost > perFileCap || spentTokens + cost > totalCap;
    if (overBudget) {
      picked.push(reminderEntry(tooLargeNotice(entry)));
      continue;
    }
    spentTokens += cost;
    picked.push(reminderEntry(replayedReadContent(entry)));
  }
  return picked;
};

// 最近读取优先的排序键。
function byMostRecentlyRead(left: ReadFileStateEntry, right: ReadFileStateEntry): number {
  return right.readAt.getTime() - left.readAt.getTime();
}

// 候选口径：来源缺省算 Read、显式非 Read 排除；`.git/` 与保留段已读的也排除。
function isReplayable(entry: ReadFileStateEntry, skip: ReadonlySet<string>): boolean {
  const tool = entry.sourceTool;
  if (tool !== undefined && tool !== "Read") return false;
  if (GIT_METADATA_PATH.test(normalizePath(entry.path))) return false;
  return !skip.has(normalizePath(entry.path));
}

// `.git/` 元数据路径不回放（归一后比对）。
const GIT_METADATA_PATH = /\/\.git\//u;

// 压缩保留段里 Read 过的文件路径（归一后）：这些不重复回放。
function collectPreservedPaths(entries: readonly RuntimeMessageEntry[]): Set<string> {
  const readInputs = entries.flatMap((entry) =>
    "message" in entry && entry.message.role === "assistant" && entry.message.toolCalls
      ? entry.message.toolCalls.filter((call) => call.name === "Read").map((call) => call.input)
      : [],
  );
  const paths = new Set<string>();
  for (const input of readInputs) {
    const filePath = extractFilePath(input);
    if (filePath) paths.add(normalizePath(filePath));
  }
  return paths;
}

// Read 工具入参里的 file_path：只认非空字符串。
function extractFilePath(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const candidate = (input as { file_path?: unknown }).file_path;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

// 路径归一：反斜杠统一成 `/`，跨平台同一路径视为同一文件。
function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

function reminderEntry(content: string): RuntimeMessageEntry {
  return systemReminderAttachmentEntry("resume_referenced_session_context", content);
}

// 引用提示（逐字契约）：内容太大就不内联，只留一句「用 Read 自己看」。
function tooLargeNotice(entry: ReadFileStateEntry): string {
  return (
    `Note: ${entry.path} was read before the last conversation was summarized, ` +
    "but the contents are too large to include. Use Read tool if you need to access it."
  );
}

// 完整回放：Read 入参 + 固定标题 + 带行号的内容。
function replayedReadContent(entry: ReadFileStateEntry): string {
  const head = `Called the Read tool with the following input: ${formatFileStateInput(entry)}`;
  const body = addReadLineNumbers(entry.content, readStateStartLine(entry.offset));
  return [head, RESULT_HEADING, body].join("\n");
}

// Read 入参的 JSON 形状：file_path 必填，offset/limit 缺省时不出现。
function formatFileStateInput(entry: ReadFileStateEntry): string {
  const payload: Record<string, unknown> = { file_path: entry.path };
  if (entry.offset !== undefined) payload.offset = entry.offset;
  if (entry.limit !== undefined) payload.limit = entry.limit;
  return JSON.stringify(payload);
}

// 行号起点：offset=0 从 0 起，offset>1 截断取整，其余从 1 起。
function readStateStartLine(offset: number | undefined): number {
  if (offset === undefined || offset <= 1) return offset === 0 ? 0 : 1;
  return Math.trunc(offset);
}

// 给内容逐行加 `行号 + 制表符` 前缀，换行兼容 CRLF 与 LF。
function addReadLineNumbers(content: string, startLine: number): string {
  const numbered: string[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    numbered.push(`${index + startLine}\t${line}`);
  });
  return numbered.join("\n");
}
