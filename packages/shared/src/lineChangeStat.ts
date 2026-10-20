// SPDX-License-Identifier: Apache-2.0

/** 一次文本变更的统计口径：只数「不在公共首尾里的行」。 */
export interface LineChangeStat {
  added: number;
  removed: number;
}

/** 末行空串是换行符的产物而非内容行；只砍末尾一个，中间空行仍然计数。 */
function toLogicalLines(content: string | null): readonly string[] {
  if (content === null || content === "") return [];
  const lines = content.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

/** 两段序列的最长公共子序列长度（滚动数组，内存 O(min(n, m))）。 */
function longestCommonSubsequence(rows: readonly string[], columns: readonly string[]): number {
  if (rows.length === 0 || columns.length === 0) return 0;
  const table = new Array<number>(columns.length + 1).fill(0);
  for (const row of rows) {
    let diagonal = 0;
    for (let index = 1; index <= columns.length; index += 1) {
      const above = table[index] as number;
      const matched = row === columns[index - 1];
      table[index] = matched ? diagonal + 1 : Math.max(above, table[index - 1] as number);
      diagonal = above;
    }
  }
  return table[columns.length] as number;
}

/**
 * 计算 before → after 的增删行数。
 *
 * 先剥掉公共首尾，把比较量压到真正变化的那一段；剩下一段仍可能很大，
 * 超过阈值时按「全增全删」保守计数，避免在界面线程上跑 DP。
 */
export function computeLineChangeStat(before: string | null, after: string): LineChangeStat {
  const beforeLines = toLogicalLines(before);
  const afterLines = toLogicalLines(after);

  let head = 0;
  while (head < beforeLines.length && head < afterLines.length) {
    if (beforeLines[head] !== afterLines[head]) break;
    head += 1;
  }

  let beforeTail = beforeLines.length;
  let afterTail = afterLines.length;
  while (beforeTail > head && afterTail > head) {
    if (beforeLines[beforeTail - 1] !== afterLines[afterTail - 1]) break;
    beforeTail -= 1;
    afterTail -= 1;
  }

  const removed = beforeTail - head;
  const added = afterTail - head;
  if (removed === 0) return { added, removed: 0 };
  if (added === 0) return { added: 0, removed };

  // 400k 单元格以上直接保守计数：穷举这些组合没有意义，只会拖慢界面。
  if (removed * added > 400_000) return { added, removed };

  const shared = longestCommonSubsequence(
    beforeLines.slice(head, beforeTail),
    afterLines.slice(head, afterTail),
  );
  return { added: added - shared, removed: removed - shared };
}
