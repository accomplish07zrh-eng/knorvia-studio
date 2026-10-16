// SPDX-License-Identifier: Apache-2.0
// 记录与空白折叠：数组不是字段袋；行内空白与命令块换行是两套规则。

export function asPlainRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if (Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function collapseInlineWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

// 命令预览保留换行，只把 CRLF 收成 LF；不折叠空格，也不剥反引号。
export function normalizeCommandBlock(value: string): string {
  return value.trim().replace(/\r\n/g, "\n");
}

export function trimmedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // 只含空白的字符串视同缺省。
  return value.trim() || undefined;
}
