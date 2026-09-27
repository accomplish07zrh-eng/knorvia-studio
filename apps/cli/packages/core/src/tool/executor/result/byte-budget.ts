// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
export type Direction = "head" | "tail";
export interface TextProjection {
  content: string;
  truncated: boolean;
}
const HIGH_START = 0xd800;
const LOW_START = 0xdc00;
const LOW_END = 0xdfff;

// 只走需要保留的码点；不为大输出构造完整字符数组或反复编码候选字符串。
export function takeBytes(value: string, limit: number, direction: Direction): string {
  if (!(limit > 0)) return "";
  if (Buffer.byteLength(value, "utf8") <= limit) return value;
  const backwards = direction === "tail";
  let boundary = backwards ? value.length : 0;
  let remaining = limit;
  while (backwards ? boundary > 0 : boundary < value.length) {
    let start = backwards ? boundary - 1 : boundary;
    if (backwards && start > 0) {
      const last = value.charCodeAt(start);
      const prior = value.charCodeAt(start - 1);
      if (last >= LOW_START && last <= LOW_END && prior >= HIGH_START && prior < LOW_START) start--;
    }
    const point = value.codePointAt(start)!;
    const width = point > 0xffff ? 2 : 1;
    const bytes = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > remaining) break;
    remaining -= bytes;
    boundary = backwards ? start : start + width;
  }
  return backwards ? value.slice(boundary) : value.slice(0, boundary);
}
export function fitContentWithSuffix(
  content: string,
  maxBytes: number,
  suffix: string,
  direction: Direction,
): string {
  const reserved = takeBytes(suffix, maxBytes, "head");
  return takeBytes(content, maxBytes - Buffer.byteLength(reserved, "utf8"), direction) + reserved;
}
export function appendHookToStringContent(
  content: string,
  suffix: string,
  maxBytes: number,
  direction: Direction,
): TextProjection {
  const combined = content + suffix;
  if (Buffer.byteLength(combined, "utf8") <= maxBytes)
    return { content: combined, truncated: false };
  return { content: fitContentWithSuffix(content, maxBytes, suffix, direction), truncated: true };
}
export function appendHookToPersistedArtifactPreview(
  content: string,
  suffix: string,
  maxBytes: number,
): TextProjection {
  return {
    content: content + takeBytes(suffix, maxBytes, "head"),
    truncated: Buffer.byteLength(suffix, "utf8") > maxBytes,
  };
}
