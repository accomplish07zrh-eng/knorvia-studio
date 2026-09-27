// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import { BashOutputSchema, type ToolResultDisplayPayload } from "@knorvia/contracts";
const DISPLAY_BYTES = 150000;

function decodedPrefix(text: string): { value: string; truncated: boolean } {
  if (Buffer.byteLength(text, "utf8") <= DISPLAY_BYTES) return { value: text, truncated: false };
  const buffer = new Uint8Array(DISPLAY_BYTES);
  const { written } = new TextEncoder().encodeInto(text, buffer);
  // 与历史卡片的 UTF-8 解码一致：只在截断时处理 BOM 和孤立代理项，不能直接按字符裁剪。
  const value = new TextDecoder().decode(buffer.subarray(0, written), { stream: true });
  return { value, truncated: true };
}

export function createBashResultDisplay(output: unknown): ToolResultDisplayPayload | undefined {
  const result = BashOutputSchema.safeParse(output);
  if (!result.success) return;
  const data = result.data;
  const detached = data.status === "backgrounded" || data.isImage || data.structuredContent?.length;
  if (detached) return;
  const path = data.persistedOutputPath ?? data.rawOutputPath;
  const cutStream = data.stdoutTruncated === true || data.stderrTruncated === true;
  if (!path && !cutStream) return;
  const chunks: string[] = [];
  for (const text of [data.stdout, data.stderr]) if (text) chunks.push(text);
  const preview = decodedPrefix(chunks.join("\n"));
  return {
    kind: "bash_output",
    output: preview.value,
    truncated: cutStream || preview.truncated,
    ...(path ? { outputPath: path } : {}),
  };
}
