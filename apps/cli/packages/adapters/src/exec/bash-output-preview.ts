// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import type { ExecutionOutputPreview } from "@knorvia/contracts";

const SHORT_PREVIEW_LINES = 5;
const FULL_PREVIEW_LINES = 100;

function linesIn(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function buildBashOutputPreview(
  text: string,
  bytesRead: number,
  totalBytes: number,
  previousLines: number,
): ExecutionOutputPreview {
  const lines = linesIn(text);
  const partial = bytesRead < totalBytes;
  let totalLines = lines.length;
  if (bytesRead === 0) {
    totalLines = previousLines;
  } else if (partial) {
    const estimate = Math.ceil((lines.length * totalBytes) / bytesRead);
    totalLines = Math.max(previousLines, lines.length, estimate);
  }
  return {
    text: lines.slice(-SHORT_PREVIEW_LINES).join("\n"),
    fullText: lines.slice(-FULL_PREVIEW_LINES).join("\n"),
    totalLines,
    totalBytes,
    linesEstimated: partial,
  };
}
