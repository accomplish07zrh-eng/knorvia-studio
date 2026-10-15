// SPDX-License-Identifier: Apache-2.0
// 日志时间戳与前缀格式化：纯函数，浏览器与 Node 两侧通用（B4）。

/** 左侧补零到指定宽度；已够宽时原样返回。 */
function padLeft(text: string, width: number): string {
  return text.length >= width ? text : `${"0".repeat(width - text.length)}${text}`;
}

/** 折算成本地时区的 "YYYY-MM-DD HH:mm:ss.mmm"，年份按原值不补零。 */
export function formatTimestamp(date: Date = new Date()): string {
  const year = String(date.getFullYear());
  const month = padLeft(String(date.getMonth() + 1), 2);
  const day = padLeft(String(date.getDate()), 2);
  const hour = padLeft(String(date.getHours()), 2);
  const minute = padLeft(String(date.getMinutes()), 2);
  const second = padLeft(String(date.getSeconds()), 2);
  const millis = padLeft(String(date.getMilliseconds()), 3);
  return [year, month, day].join("-") + " " + [hour, minute, second].join(":") + `.${millis}`;
}

/** 生成日志前缀 "[时间] [pid:123] [source]"；pid 缺席（undefined/null）时省略中间段。 */
export function formatLogPrefix(source: string, pid?: number): string {
  const pidSegment = pid != null ? ` [pid:${pid}]` : "";
  return `[${formatTimestamp()}]${pidSegment} [${source}]`;
}
