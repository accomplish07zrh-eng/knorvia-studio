// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ExecutionOutputPreview } from "@knorvia/contracts";

const SHORT_PREVIEW_LINES = /* 预览保留的尾部行数 */ 5;
const FULL_PREVIEW_LINES = /* 完整预览的行数上限 */ 100;

function /* 按行切分并去掉末尾空行 */ linesIn(text: string): string[] {
  if (text === "") return /* 空输入：无行 */ [];
  const lines = /* 兼容 CRLF 与 LF */ text.split(/\r?\n/);
  /* 末尾换行不算一行 */ if (lines.at(-1) === "") lines.pop();
  return /* 有效行 */ lines;
}

export function /* 构造 bash 输出预览：截尾 + 总行数估算 */ buildBashOutputPreview(
  text: string,
  bytesRead: /* 已读取字节数 */ number,
  totalBytes: /* 输出总字节数 */ number,
  previousLines: /* 上一轮已知行数（估算基准） */ number,
): /* 预览结果 */ ExecutionOutputPreview {
  const lines = linesIn(text);
  const partial = /* 是否只读到部分输出 */ bytesRead < totalBytes;
  let totalLines = lines.length;
  if (bytesRead === 0) {
    totalLines = previousLines;
  } else if (partial) {
    const estimate = Math.ceil((lines.length * totalBytes) / bytesRead);
    totalLines = Math.max(previousLines, lines.length, estimate);
  }
  return /* 预览字段 */ {
    text: lines.slice(-SHORT_PREVIEW_LINES).join("\n"),
    fullText: lines.slice(-FULL_PREVIEW_LINES).join("\n"),
    /* 估算的总行数 */ totalLines,
    /* 输出总字节数（原样回传） */ totalBytes,
    linesEstimated: /* 行数为估算值 */ partial,
  };
}
