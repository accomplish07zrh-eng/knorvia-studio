// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ExecutionOutputPreview } from "@knorvia/contracts";

// 尾读预览的两个窗口：短窗口给工具结果卡片，长窗口给展开视图。
const TAIL_WINDOW_SHORT = 5;
const TAIL_WINDOW_LONG = 100;

type PreviewAsk = {
  text: string;
  bytesRead: number;
  totalBytes: number;
  previousLines: number;
};

/** 按行切分：空文本没有行，末尾的换行不额外算一行。 */
function splitRows(text: string): string[] {
  if (text.length === 0) return [];
  const rows = text.split(/\r?\n/);
  const trailingBlank = rows.at(-1) === "";
  return trailingBlank ? rows.slice(0, -1) : rows;
}

/** 取末尾 window 行拼回文本；行数不足时返回全部行。 */
function tailText(rows: readonly string[], window: number): string {
  const start = rows.length > window ? rows.length - window : 0;
  return rows.slice(start).join("\n");
}

/** 部分读取时按已读比例外推总行数，且不低于先前已知值与本次实读行数。 */
function estimateTotalLines(ask: PreviewAsk, readLines: number): number {
  if (ask.bytesRead === 0) return ask.previousLines;
  if (ask.bytesRead >= ask.totalBytes) return readLines;
  const extrapolated = Math.ceil((readLines * ask.totalBytes) / ask.bytesRead);
  return Math.max(ask.previousLines, readLines, extrapolated);
}

export function buildBashOutputPreview(ask: PreviewAsk): ExecutionOutputPreview {
  const rows = splitRows(ask.text);
  const preview = {} as ExecutionOutputPreview;
  preview.text = tailText(rows, TAIL_WINDOW_SHORT);
  preview.fullText = tailText(rows, TAIL_WINDOW_LONG);
  preview.totalLines = estimateTotalLines(ask, rows.length);
  preview.totalBytes = ask.totalBytes;
  preview.linesEstimated = ask.bytesRead < ask.totalBytes;
  return preview;
}
