// SPDX-License-Identifier: Apache-2.0
// 工具卡片摘要。变更行数按换行切分，尾随 LF 不另计一行，空串为 0。
import { asPlainRecord, collapseInlineWhitespace } from "./internal-s03/value-shape.js";

const COMPACT_STATE_ROWS = [
  {
    state: "input-streaming",
    phase: "running",
    messageId: "chat.toolCall.status.pending",
  },
  {
    state: "input-available",
    phase: "running",
    messageId: "chat.toolCall.status.running",
  },
  {
    state: "output-available",
    phase: "finished",
    messageId: "chat.toolCall.status.completed",
  },
  {
    state: "output-error",
    phase: "finished",
    messageId: "chat.toolCall.status.failed",
  },
  {
    state: "output-denied",
    phase: "finished",
    messageId: "chat.toolCall.status.denied",
  },
] as const;

export type CompactToolCallState = (typeof COMPACT_STATE_ROWS)[number]["state"];

export type ToolCallSummarySource = {
  title?: /* 卡片标题，空白则退回 tool */ string;
  kind: /* 工具种类，用来判断是否统计编辑行数 */ string;
  input: /* 工具入参，字符串或字段袋 */ unknown;
  output?: /* 工具出参，文本对的后备来源 */ unknown;
  raw?: /* 原始载荷，文本对的最后后备 */ unknown;
};

export type ToolCallChangeStat = {
  added: /* 新文本行数 */ number;
  removed: /* 旧文本行数 */ number;
};

export type ToolCallSummary = {
  primaryText: /* 折叠后的标题 */ string;
  secondaryText?: /* 入参摘要，可缺 */ string;
  changeStat?: /* 两侧行数都是 0 时省略 */ ToolCallChangeStat;
};

const STOPPED_STATUS_MESSAGE = "chat.toolCall.status.stopped";
const DEFAULT_STATUS_MESSAGE = "chat.toolCall.status.pending";
const FALLBACK_PRIMARY_TEXT = "tool";

const SUMMARY_FIELD_GROUPS = [
  ["command", "path", "file_path"],
  ["filePath", "prompt"],
] as const;
const BEFORE_TEXT_GROUPS = [
  ["old_string", "oldString"],
  ["oldText", "before"],
] as const;
const AFTER_TEXT_GROUPS = [
  ["new_string", "newString", "newText"],
  ["after", "content"],
] as const;

const SUMMARY_FIELD_PRIORITY = SUMMARY_FIELD_GROUPS.flat();
const BEFORE_TEXT_KEYS = BEFORE_TEXT_GROUPS.flat();
const AFTER_TEXT_KEYS = AFTER_TEXT_GROUPS.flat();

const EDIT_KIND = /edit|patch|replace|multi.?edit/i;

type TextPair = readonly [string, string];

type ChangeProbe = {
  kind: string;
  input: unknown;
  output: unknown;
  raw: unknown;
};

function statesInPhase(phase: "running" | "finished"): Set<string> {
  const names = COMPACT_STATE_ROWS.filter((row) => row.phase === phase).map((row) => row.state);
  return new Set<string>(names);
}

const RUNNING_STATES = statesInPhase("running");
const FINISHED_STATES = statesInPhase("finished");

function messageForState(state: string): string | undefined {
  const row = COMPACT_STATE_ROWS.find((entry) => entry.state === state);
  return row?.messageId;
}

function noText(): undefined {
  return undefined;
}

export function isCompactToolCallRunningState(state: string): state is CompactToolCallState {
  return RUNNING_STATES.has(state);
}

export function isCompactToolCallFinishedState(state: string): state is CompactToolCallState {
  return FINISHED_STATES.has(state);
}

export function getCompactToolCallStatusMessageId(state: string, rawStatus?: string): string {
  if (rawStatus === "stopped") return STOPPED_STATUS_MESSAGE;
  return messageForState(state) ?? DEFAULT_STATUS_MESSAGE;
}

function firstMatch<T>(
  keys: readonly string[],
  pick: (key: string) => T | undefined,
): T | undefined {
  let index = 0;
  while (index < keys.length) {
    const key = keys[index];
    index += 1;
    if (key === undefined) break;
    const picked = pick(key);
    if (picked !== undefined) return picked;
  }
  return noText();
}

function collapsedField(value: unknown): string | undefined {
  if (typeof value !== "string") return noText();
  const collapsed = collapseInlineWhitespace(value);
  return collapsed.length > 0 ? collapsed : noText();
}

function inputSummary(input: unknown): string | undefined {
  if (typeof input === "string") return collapsedField(input);
  const record = asPlainRecord(input);
  if (record === undefined) return noText();
  return firstMatch(SUMMARY_FIELD_PRIORITY, (key) => collapsedField(record[key]));
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  return firstMatch(keys, (key) => {
    const field = record[key];
    return typeof field === "string" ? field : undefined;
  });
}

function pairFromRecord(record: Record<string, unknown>): TextPair | undefined {
  const before = firstString(record, BEFORE_TEXT_KEYS);
  const after = firstString(record, AFTER_TEXT_KEYS);
  if (before === undefined || after === undefined) return noText();
  const pair: TextPair = [before, after];
  return pair;
}

function pairFromMetadata(record: Record<string, unknown>): TextPair | undefined {
  const metadata = asPlainRecord(record.metadata);
  const fileDiff = metadata ? asPlainRecord(metadata.filediff) : undefined;
  if (fileDiff === undefined) return noText();
  return pairFromRecord(fileDiff);
}

function pairFromContentBlocks(record: Record<string, unknown>): TextPair | undefined {
  const blocks = record.content;
  if (!Array.isArray(blocks)) return noText();
  return firstMatch(
    blocks.map((_, index) => String(index)),
    (indexText) => {
      const block = asPlainRecord(blocks[Number(indexText)]);
      if (block === undefined) return noText();
      return pairFromRecord(block);
    },
  );
}

const PAIR_LOOKUPS = [pairFromRecord, pairFromMetadata, pairFromContentBlocks];

function findTextPair(value: unknown): TextPair | undefined {
  const record = asPlainRecord(value);
  if (record === undefined) return noText();
  return firstMatch(
    PAIR_LOOKUPS.map((_, index) => String(index)),
    (indexText) => PAIR_LOOKUPS[Number(indexText)]?.(record),
  );
}

function countLines(body: string): number {
  if (body.length === 0) return 0;
  const pieces = body.split("\n");
  const last = pieces[pieces.length - 1];
  return last === "" ? pieces.length - 1 : pieces.length;
}

function changeStat(added: number, removed: number): ToolCallChangeStat | undefined {
  if (added + removed === 0) return noText();
  const stat: ToolCallChangeStat = { added, removed };
  return stat;
}

function measureChange(probe: ChangeProbe): ToolCallChangeStat | undefined {
  if (!EDIT_KIND.test(probe.kind)) return noText();
  const pair = findTextPair(probe.input) ?? findTextPair(probe.output) ?? findTextPair(probe.raw);
  if (pair === undefined) return noText();
  return changeStat(countLines(pair[1]), countLines(pair[0]));
}

function primaryLabel(title: string | undefined): string {
  const collapsed = title ? collapseInlineWhitespace(title) : "";
  return collapsed.length > 0 ? collapsed : FALLBACK_PRIMARY_TEXT;
}

export function getCompactToolCallSummary(source: ToolCallSummarySource): ToolCallSummary {
  const summary: ToolCallSummary = {
    primaryText: primaryLabel(source.title),
    secondaryText: inputSummary(source.input),
    changeStat: measureChange({
      kind: source.kind,
      input: source.input,
      output: source.output,
      raw: source.raw,
    }),
  };
  return summary;
}
