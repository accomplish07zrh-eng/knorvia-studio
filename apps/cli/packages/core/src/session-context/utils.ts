// SPDX-License-Identifier: Apache-2.0
// 会话上下文的两个小工具：按字符上限截断文本（带省略标记）与不会抛的 JSON 序列化。
const TRUNCATION_MARKER = "\n...[truncated]";
// 给标记预留的字符数：标记本身 15 个，这里留 18 个（多 3 个余量，与旧实现一致）。
const MARKER_RESERVE = 18;
// 上限小到连标记都放不下时直接硬切，不再附加标记。
const MIN_CHARS_FOR_MARKER = 20;

export function truncateText(text: string, maxChars: number): string {
  const length = text.length;
  if (length <= maxChars) return text;
  if (maxChars <= MIN_CHARS_FOR_MARKER) return text.slice(0, maxChars);
  const keep = maxChars - MARKER_RESERVE;
  return text.slice(0, keep) + TRUNCATION_MARKER;
}

// 用 try/catch 而不是预检：循环引用只有遍历到深处才知道，预检要么误判要么代价更高；
// 抛出的错误类型不重要，兜底一律是 String(value)。
// 这里刻意不吞掉「没抛但也没有文本」的情况（undefined / 函数），保持与 JSON.stringify 一致。
export function safeJson(value: unknown): string {
  try {
    return serialize(value);
  } catch {
    return String(value);
  }
}

// JSON.stringify 在循环引用上会抛；抛由调用方兜底成 String(value)。
// 注意它对 undefined / 函数返回 undefined，这种「没抛但也没文本」照旧原样返回。
function serialize(value: unknown): string {
  return JSON.stringify(value) as string;
}
