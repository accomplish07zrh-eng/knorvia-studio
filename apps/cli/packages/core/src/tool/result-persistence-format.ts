// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
const TAG = { open: "<persisted-output>", close: "</persisted-output>" };
const PREVIEW_CHARACTERS = 2_000;
const UNITS = ["B", "KB", "MB", "GB"] as const;
const BASE = 1_000;
function decimalSize(bytes: number): string {
  let unit = 0;
  while (unit < UNITS.length - 1 && !(bytes < BASE ** (unit + 1))) unit++;
  const amount = unit === 0 ? bytes : Math.round(bytes / BASE ** unit);
  return `${amount} ${UNITS[unit]}`;
}
interface Envelope {
  content: string;
  formatBytes: (bytes: number) => string;
  originalBytes: number;
  persistedPath: string;
  previewChars: number;
}
function excerpt(content: string, limit: number): [string, boolean] {
  if (content.length <= limit) return [content, false];
  const leading = content.slice(0, limit);
  const line = leading.lastIndexOf("\n");
  // 沿用公开 helper 的 slice 边界（包括旧的负值行为），不在迁移中新增校验规则。
  return [content.slice(0, line > limit / 2 ? line : limit), true];
}
export function formatPersistedOutputEnvelope(input: Envelope): string {
  const [preview, shortened] = excerpt(input.content, input.previewChars);
  const heading = `Output too large (${input.formatBytes(input.originalBytes)}). Full output saved to: ${input.persistedPath}`;
  const label = `Preview (first ${input.formatBytes(input.previewChars)}):`;
  return `${TAG.open}\n${heading}\n\n${label}\n${preview}\n${shortened ? "...\n" : ""}${TAG.close}`;
}
export function formatGenericPersistedOutputContent(input: {
  content: string;
  originalBytes: number;
  persistedPath: string;
}): string {
  return formatPersistedOutputEnvelope({
    content: input.content,
    formatBytes: decimalSize,
    originalBytes: input.originalBytes,
    persistedPath: input.persistedPath,
    previewChars: PREVIEW_CHARACTERS,
  });
}
export function isPersistedOutputContent(content: string): boolean {
  return content.indexOf(TAG.open) === 0 && content.indexOf(TAG.close) !== -1;
}
