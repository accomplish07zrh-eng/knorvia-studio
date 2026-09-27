// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { takeBytes } from "./result/byte-budget.js";
const MARKER = "\n...[truncated]";
const MARKER_BYTES = Buffer.byteLength(MARKER, "utf8");

export function boundDisplayText(
  value: string,
  maxBytes: number,
): { value: string; truncated: boolean } {
  const fits = Buffer.byteLength(value, "utf8") <= maxBytes;
  // 提示属于固定协议：极小配额仍保留完整提示，正文配额可以为零。
  return {
    value: fits ? value : takeBytes(value, maxBytes - MARKER_BYTES, "head") + MARKER,
    truncated: !fits,
  };
}
